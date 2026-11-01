const db = require('../../config/database');

class Movimentacao {
  /**
   * Registra uma movimentação (ENTRADA, SAIDA ou TRANSFERÊNCIA ENTRE OBRAS) de forma atômica
   */
  static registrar({ produto_id, tipo, quantidade, motivo, responsavel, documento_ref, almoxarifado_origem_id, almoxarifado_destino_id }) {
    if (!produto_id || !tipo || !quantidade || !motivo || !responsavel) {
      throw new Error('Produto, Tipo (ENTRADA/SAIDA/TRANSFERENCIA), Quantidade, Motivo e Responsável são obrigatórios.');
    }

    const qtd = parseInt(quantidade, 10);
    if (isNaN(qtd) || qtd <= 0) {
      throw new Error('A quantidade deve ser um número inteiro positivo maior que zero.');
    }

    const tipoNormalizado = tipo.toUpperCase();
    if (!['ENTRADA', 'SAIDA', 'TRANSFERENCIA'].includes(tipoNormalizado)) {
      throw new Error('O tipo de movimentação deve ser ENTRADA, SAIDA ou TRANSFERENCIA.');
    }

    // Transação ACID para garantir consistência de estoque inter-obras
    const executarTransacao = db.transaction(() => {
      // 1. Busca produto atual
      const produto = db.prepare('SELECT id, nome, quantidade, estoque_minimo FROM produtos WHERE id = ?').get(produto_id);
      if (!produto) {
        throw new Error('Produto selecionado não existe.');
      }

      // Almoxarifado Central padrão (fallback se não informado)
      const central = db.prepare("SELECT id FROM almoxarifados WHERE tipo = 'CENTRAL' LIMIT 1").get();
      const defaultAlmoxId = central ? central.id : 1;

      const origemId = almoxarifado_origem_id ? parseInt(almoxarifado_origem_id, 10) : defaultAlmoxId;
      const destinoId = almoxarifado_destino_id ? parseInt(almoxarifado_destino_id, 10) : defaultAlmoxId;

      // =========================================================================
      // CASO 1: TRANSFERÊNCIA ENTRE ALMOXARIFADOS / OBRAS
      // =========================================================================
      if (tipoNormalizado === 'TRANSFERENCIA') {
        if (!almoxarifado_origem_id || !almoxarifado_destino_id) {
          throw new Error('Para transferência entre obras, selecione o almoxarifado de origem e o de destino.');
        }

        if (origemId === destinoId) {
          throw new Error('O almoxarifado de origem não pode ser o mesmo de destino.');
        }

        // Verifica saldo na obra de origem
        const estOrigem = db.prepare('SELECT quantidade FROM estoques WHERE produto_id = ? AND almoxarifado_id = ?').get(produto_id, origemId);
        const saldoOrigem = estOrigem ? estOrigem.quantidade : 0;

        if (saldoOrigem < qtd) {
          const obraOrigem = db.prepare('SELECT nome FROM almoxarifados WHERE id = ?').get(origemId);
          throw new Error(`Saldo insuficiente no almoxarifado "${obraOrigem?.nome}". Saldo disponível: ${saldoOrigem}, tentativa de transferência: ${qtd}.`);
        }

        // 1. Subtrai da origem
        db.prepare('UPDATE estoques SET quantidade = quantidade - ?, atualizado_em = (datetime(\'now\', \'localtime\')) WHERE produto_id = ? AND almoxarifado_id = ?')
          .run(qtd, produto_id, origemId);

        // 2. Adiciona no destino (cria registro de estoque na obra caso ainda não existisse)
        db.prepare(`
          INSERT INTO estoques (produto_id, almoxarifado_id, quantidade) 
          VALUES (?, ?, ?) 
          ON CONFLICT(produto_id, almoxarifado_id) 
          DO UPDATE SET quantidade = quantidade + ?, atualizado_em = (datetime('now', 'localtime'))
        `).run(produto_id, destinoId, qtd, qtd);

        // O saldo global da empresa permanece o mesmo, mudando apenas a posse local
      }

      // =========================================================================
      // CASO 2: ENTRADA (COMPRA / NOTA FISCAL / REPOSIÇÃO)
      // =========================================================================
      else if (tipoNormalizado === 'ENTRADA') {
        // Atualiza estoque na obra de destino
        db.prepare(`
          INSERT INTO estoques (produto_id, almoxarifado_id, quantidade) 
          VALUES (?, ?, ?) 
          ON CONFLICT(produto_id, almoxarifado_id) 
          DO UPDATE SET quantidade = quantidade + ?, atualizado_em = (datetime('now', 'localtime'))
        `).run(produto_id, destinoId, qtd, qtd);

        // Atualiza saldo global do produto
        db.prepare(`
          UPDATE produtos 
          SET quantidade = quantidade + ?, atualizado_em = (datetime('now', 'localtime')) 
          WHERE id = ?
        `).run(qtd, produto_id);
      }

      // =========================================================================
      // CASO 3: SAÍDA / BAIXA (CONSUMO / OBRA / DESCARTE)
      // =========================================================================
      else if (tipoNormalizado === 'SAIDA') {
        // Verifica saldo na obra de origem
        const estOrigem = db.prepare('SELECT quantidade FROM estoques WHERE produto_id = ? AND almoxarifado_id = ?').get(produto_id, origemId);
        const saldoOrigem = estOrigem ? estOrigem.quantidade : 0;

        if (saldoOrigem < qtd) {
          const obraOrigem = db.prepare('SELECT nome FROM almoxarifados WHERE id = ?').get(origemId);
          throw new Error(`Saldo insuficiente no almoxarifado "${obraOrigem?.nome}". Saldo disponível: ${saldoOrigem}, tentativa de baixa: ${qtd}.`);
        }

        // Subtrai da obra de origem
        db.prepare('UPDATE estoques SET quantidade = quantidade - ?, atualizado_em = (datetime(\'now\', \'localtime\')) WHERE produto_id = ? AND almoxarifado_id = ?')
          .run(qtd, produto_id, origemId);

        // Subtrai do saldo global
        db.prepare(`
          UPDATE produtos 
          SET quantidade = MAX(0, quantidade - ?), atualizado_em = (datetime('now', 'localtime')) 
          WHERE id = ?
        `).run(qtd, produto_id);
      }

      // 4. Registra no histórico de movimentações com origem e destino
      const stmtMov = db.prepare(`
        INSERT INTO movimentacoes (produto_id, tipo, quantidade, motivo, responsavel, documento_ref, almoxarifado_origem_id, almoxarifado_destino_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const resultado = stmtMov.run(
        produto_id,
        tipoNormalizado,
        qtd,
        motivo.trim(),
        responsavel.trim(),
        documento_ref ? documento_ref.trim() : null,
        tipoNormalizado === 'ENTRADA' ? null : origemId,
        tipoNormalizado === 'SAIDA' ? null : destinoId
      );

      const produtoAtualizado = db.prepare('SELECT quantidade FROM produtos WHERE id = ?').get(produto_id);

      return {
        movimentacao_id: resultado.lastInsertRowid,
        produto_nome: produto.nome,
        quantidade_movimentada: qtd,
        quantidade_total_nova: produtoAtualizado.quantidade,
        tipo: tipoNormalizado
      };
    });

    return executarTransacao();
  }

  /**
   * Lista movimentações com filtros por almoxarifado, produto, tipo e período
   */
  static findAll({ produto_id = '', tipo = '', almoxarifado_id = '', data_inicio = '', data_fim = '', limite = 50, offset = 0 } = {}) {
    let query = `
      SELECT 
        m.*,
        p.nome AS produto_nome,
        p.sku AS produto_sku,
        p.tag AS produto_tag,
        p.unidade_medida AS produto_unidade,
        p.categoria AS produto_categoria,
        p.preco_unitario AS produto_preco,
        (m.quantidade * p.preco_unitario) AS valor_movimentado,
        ao.nome AS almoxarifado_origem_nome,
        ao.codigo AS almoxarifado_origem_codigo,
        ad.nome AS almoxarifado_destino_nome,
        ad.codigo AS almoxarifado_destino_codigo
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      LEFT JOIN almoxarifados ao ON m.almoxarifado_origem_id = ao.id
      LEFT JOIN almoxarifados ad ON m.almoxarifado_destino_id = ad.id
      WHERE 1=1
    `;

    const params = [];

    if (produto_id) {
      query += ` AND m.produto_id = ?`;
      params.push(produto_id);
    }

    if (almoxarifado_id) {
      query += ` AND (m.almoxarifado_origem_id = ? OR m.almoxarifado_destino_id = ?)`;
      params.push(almoxarifado_id, almoxarifado_id);
    }

    if (tipo && ['ENTRADA', 'SAIDA', 'TRANSFERENCIA'].includes(tipo.toUpperCase())) {
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
   * Resumo para gráfico de fluxo semanal
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
        COALESCE(SUM(CASE WHEN m.tipo IN ('ENTRADA', 'TRANSFERENCIA') THEN m.quantidade ELSE 0 END), 0) AS total_entradas,
        COALESCE(SUM(CASE WHEN m.tipo = 'SAIDA' THEN m.quantidade ELSE 0 END), 0) AS total_saidas
      FROM dates d
      LEFT JOIN movimentacoes m ON date(m.criado_em) = d.dia
      GROUP BY d.dia
      ORDER BY d.dia ASC
    `;

    return db.prepare(query).all(dias);
  }

  /**
   * Produtos mais requisitados
   */
  static getMaisMovimentados(limite = 5) {
    const query = `
      SELECT 
        p.id,
        p.nome,
        p.sku,
        p.tag,
        p.categoria,
        p.unidade_medida,
        COALESCE(SUM(m.quantidade), 0) AS total_saidas
      FROM produtos p
      JOIN movimentacoes m ON p.id = m.produto_id
      WHERE m.tipo IN ('SAIDA', 'TRANSFERENCIA')
      GROUP BY p.id
      ORDER BY total_saidas DESC
      LIMIT ?
    `;

    return db.prepare(query).all(limite);
  }

  /**
   * Distribuição por categoria
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
   * Relatório de consumo mensal
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
