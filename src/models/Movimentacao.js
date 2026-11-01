const db = require('../../config/database');

class Movimentacao {
  /**
   * Registra uma movimentação (ENTRADA ou SAIDA) de forma atômica (transação)
   */
  static registrar({ produto_id, tipo, quantidade, motivo, responsavel, documento_ref }) {
    if (!produto_id || !tipo || !quantidade || !motivo || !responsavel) {
      throw new Error('Produto, Tipo (ENTRADA/SAIDA), Quantidade, Motivo e Responsável são obrigatórios.');
    }

    const qtd = parseInt(quantidade, 10);
    if (isNaN(qtd) || qtd <= 0) {
      throw new Error('A quantidade deve ser um número inteiro positivo maior que zero.');
    }

    const tipoNormalizado = tipo.toUpperCase();
    if (!['ENTRADA', 'SAIDA'].includes(tipoNormalizado)) {
      throw new Error('O tipo de movimentação deve ser ENTRADA ou SAIDA.');
    }

    // Transação para garantir consistência de estoque
    const executarTransacao = db.transaction(() => {
      // 1. Busca produto atual com bloqueio implícito
      const produto = db.prepare('SELECT id, nome, quantidade, estoque_minimo FROM produtos WHERE id = ?').get(produto_id);
      if (!produto) {
        throw new Error('Produto selecionado não existe.');
      }

      // 2. Se for SAÍDA, valida disponibilidade de estoque
      if (tipoNormalizado === 'SAIDA' && produto.quantidade < qtd) {
        throw new Error(`Estoque insuficiente para o item "${produto.nome}". Quantidade disponível em almoxarifado: ${produto.quantidade}, tentativa de baixa: ${qtd}.`);
      }

      // 3. Atualiza quantidade do produto
      const novaQuantidade = tipoNormalizado === 'ENTRADA' 
        ? produto.quantidade + qtd 
        : produto.quantidade - qtd;

      db.prepare(`
        UPDATE produtos 
        SET quantidade = ?, atualizado_em = (datetime('now', 'localtime')) 
        WHERE id = ?
      `).run(novaQuantidade, produto_id);

      // 4. Registra no histórico de movimentações
      const stmtMov = db.prepare(`
        INSERT INTO movimentacoes (produto_id, tipo, quantidade, motivo, responsavel, documento_ref)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const resultado = stmtMov.run(
        produto_id,
        tipoNormalizado,
        qtd,
        motivo.trim(),
        responsavel.trim(),
        documento_ref ? documento_ref.trim() : null
      );

      return {
        movimentacao_id: resultado.lastInsertRowid,
        produto_nome: produto.nome,
        quantidade_anterior: produto.quantidade,
        quantidade_nova: novaQuantidade,
        tipo: tipoNormalizado
      };
    });

    return executarTransacao();
  }

  /**
   * Lista movimentações com filtros de tipo, produto e período
   */
  static findAll({ produto_id = '', tipo = '', data_inicio = '', data_fim = '', limite = 50, offset = 0 } = {}) {
    let query = `
      SELECT 
        m.*,
        p.nome AS produto_nome,
        p.sku AS produto_sku,
        p.unidade_medida AS produto_unidade,
        p.categoria AS produto_categoria,
        p.preco_unitario AS produto_preco,
        (m.quantidade * p.preco_unitario) AS valor_movimentado
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      WHERE 1=1
    `;

    const params = [];

    if (produto_id) {
      query += ` AND m.produto_id = ?`;
      params.push(produto_id);
    }

    if (tipo && ['ENTRADA', 'SAIDA'].includes(tipo.toUpperCase())) {
      query += ` AND m.tipo = ?`;
      params.push(tipo.toUpperCase());
    }

    if (data_inicio) {
      query += ` AND date(m.criado_em) >= date(?)`;
      params.push(data_inicio);
    }

    if (data_fim) {
      query += ` AND date(m.criado_em) <= date(?)`;
      params.push(data_fim);
    }

    query += ` ORDER BY m.criado_em DESC, m.id DESC LIMIT ? OFFSET ?`;
    params.push(limite, offset);

    return db.prepare(query).all(...params);
  }

  /**
   * Resumo para gráfico de movimentações dos últimos dias
   */
  static getGraficoConsumo(dias = 7) {
    const query = `
      WITH RECURSIVE dates(dia) AS (
        SELECT date('now', '-' || (? - 1) || ' days', 'localtime')
        UNION ALL
        SELECT date(dia, '+1 day') FROM dates WHERE dia < date('now', 'localtime')
      )
      SELECT 
        d.dia,
        COALESCE(SUM(CASE WHEN m.tipo = 'ENTRADA' THEN m.quantidade ELSE 0 END), 0) AS total_entradas,
        COALESCE(SUM(CASE WHEN m.tipo = 'SAIDA' THEN m.quantidade ELSE 0 END), 0) AS total_saidas
      FROM dates d
      LEFT JOIN movimentacoes m ON date(m.criado_em) = d.dia
      GROUP BY d.dia
      ORDER BY d.dia ASC
    `;

    return db.prepare(query).all(dias);
  }

  /**
   * Produtos mais requisitados (maior volume de saídas)
   */
  static getMaisMovimentados(limite = 5) {
    const query = `
      SELECT 
        p.id,
        p.nome,
        p.sku,
        p.categoria,
        p.unidade_medida,
        COALESCE(SUM(m.quantidade), 0) AS total_saidas
      FROM produtos p
      JOIN movimentacoes m ON p.id = m.produto_id
      WHERE m.tipo = 'SAIDA'
      GROUP BY p.id
      ORDER BY total_saidas DESC
      LIMIT ?
    `;

    return db.prepare(query).all(limite);
  }

  /**
   * Distribuição de valor e itens por categoria
   */
  static getDistribuicaoPorCategoria() {
    const query = `
      SELECT 
        categoria,
        COUNT(*) AS total_itens,
        SUM(quantidade) AS total_unidades,
        SUM(quantidade * preco_unitario) AS valor_total
      FROM produtos
      GROUP BY categoria
      ORDER BY valor_total DESC
    `;
    return db.prepare(query).all();
  }

  /**
   * Relatório resumido para exportação ou impressão
   */
  static getRelatorioConsumo({ mes = '', ano = '' } = {}) {
    let query = `
      SELECT 
        strftime('%Y-%m', m.criado_em) AS periodo,
        m.tipo,
        COUNT(m.id) AS total_operacoes,
        SUM(m.quantidade) AS volume_unidades,
        SUM(m.quantidade * p.preco_unitario) AS valor_financeiro
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (ano) {
      query += ` AND strftime('%Y', m.criado_em) = ?`;
      params.push(String(ano));
    }
    if (mes) {
      query += ` AND strftime('%m', m.criado_em) = ?`;
      params.push(String(mes).padStart(2, '0'));
    }

    query += ` GROUP BY periodo, m.tipo ORDER BY periodo DESC, m.tipo ASC`;

    return db.prepare(query).all(...params);
  }
}

module.exports = Movimentacao;
