const db = require('../../config/database');

class Movimentacao {
  /**
   * Lista histórico de movimentações com filtros opcionais
   */
  static findAll({ produto_id, tipo, data_inicio, data_fim, limite = 100 } = {}) {
    let sql = `
      SELECT 
        m.*,
        p.nome as produto_nome,
        p.sku as produto_sku,
        p.unidade_medida as produto_unidade,
        p.preco_unitario as produto_preco,
        (m.quantidade * p.preco_unitario) as valor_movimentado
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      WHERE 1=1
    `;
    const params = {};

    if (produto_id) {
      sql += ` AND m.produto_id = @produto_id`;
      params.produto_id = produto_id;
    }

    if (tipo && (tipo === 'ENTRADA' || tipo === 'SAIDA')) {
      sql += ` AND m.tipo = @tipo`;
      params.tipo = tipo;
    }

    if (data_inicio) {
      sql += ` AND date(m.criado_em) >= date(@data_inicio)`;
      params.data_inicio = data_inicio;
    }

    if (data_fim) {
      sql += ` AND date(m.criado_em) <= date(@data_fim)`;
      params.data_fim = data_fim;
    }

    sql += ` ORDER BY m.id DESC LIMIT @limite`;
    params.limite = limite;

    return db.prepare(sql).all(params);
  }

  /**
   * Registra uma movimentação atômica (Entrada ou Saída)
   * Atualiza imediatamente o saldo de estoque do produto.
   */
  static registrar({ produto_id, tipo, quantidade, motivo, responsavel, documento_ref }) {
    const qtd = parseInt(quantidade, 10);
    if (!qtd || qtd <= 0) {
      throw new Error('A quantidade deve ser um número inteiro maior que zero.');
    }

    if (!['ENTRADA', 'SAIDA'].includes(tipo)) {
      throw new Error('Tipo de movimentação inválido. Deve ser ENTRADA ou SAIDA.');
    }

    const tx = db.transaction(() => {
      // 1. Verifica produto e saldo atual
      const produto = db.prepare('SELECT id, nome, quantidade FROM produtos WHERE id = ?').get(produto_id);
      if (!produto) {
        throw new Error('Produto selecionado não existe.');
      }

      // 2. Valida saldo se for saída
      if (tipo === 'SAIDA' && produto.quantidade < qtd) {
        throw new Error(`Saldo insuficiente para o produto "${produto.nome}". Saldo atual: ${produto.quantidade}, solicitado: ${qtd}.`);
      }

      // 3. Atualiza saldo no produto
      const fator = tipo === 'ENTRADA' ? 1 : -1;
      const novoSaldo = produto.quantidade + (qtd * fator);

      db.prepare(`
        UPDATE produtos 
        SET quantidade = ?, atualizado_em = datetime('now', 'localtime') 
        WHERE id = ?
      `).run(novoSaldo, produto_id);

      // 4. Grava registro no histórico de movimentações
      const insertStmt = db.prepare(`
        INSERT INTO movimentacoes (
          produto_id, tipo, quantidade, motivo, responsavel, documento_ref
        ) VALUES (
          @produto_id, @tipo, @quantidade, @motivo, @responsavel, @documento_ref
        )
      `);

      const res = insertStmt.run({
        produto_id,
        tipo,
        quantidade: qtd,
        motivo: motivo ? motivo.trim() : (tipo === 'ENTRADA' ? 'Entrada no estoque' : 'Baixa de material'),
        responsavel: responsavel ? responsavel.trim() : 'Não informado',
        documento_ref: documento_ref ? documento_ref.trim() : null
      });

      return {
        id: res.lastInsertRowid,
        produto_id,
        produto_nome: produto.nome,
        novo_saldo: novoSaldo
      };
    });

    return tx();
  }
}

module.exports = Movimentacao;
