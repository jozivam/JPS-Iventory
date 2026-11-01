const db = require('../../config/database');

class Produto {
  /**
   * Lista todos os produtos com filtros opcionais e status de estoque calculado
   */
  static findAll({ busca = '', categoria = '', status = '', ordenarPor = 'nome_asc', almoxarifado_id = '' } = {}) {
    let query = `
      SELECT 
        p.*,
        f.nome AS fornecedor_nome,
        ${almoxarifado_id ? 'COALESCE(e.quantidade, 0)' : 'p.quantidade'} AS quantidade_exibida,
        (${almoxarifado_id ? 'COALESCE(e.quantidade, 0)' : 'p.quantidade'} * p.preco_unitario) AS valor_total_estoque,
        CASE
          WHEN ${almoxarifado_id ? 'COALESCE(e.quantidade, 0)' : 'p.quantidade'} <= 0 THEN 'CRITICO'
          WHEN ${almoxarifado_id ? 'COALESCE(e.quantidade, 0)' : 'p.quantidade'} <= p.estoque_minimo THEN 'BAIXO'
          ELSE 'NORMAL'
        END AS status_estoque
      FROM produtos p
      LEFT JOIN fornecedores f ON p.fornecedor_id = f.id
      ${almoxarifado_id ? 'LEFT JOIN estoques e ON p.id = e.produto_id AND e.almoxarifado_id = ?' : ''}
      WHERE 1=1
    `;

    const params = [];
    if (almoxarifado_id) {
      params.push(parseInt(almoxarifado_id, 10));
    }

    if (busca) {
      query += ` AND (p.nome LIKE ? OR p.sku LIKE ? OR p.tag LIKE ? OR p.localizacao LIKE ?)`;
      const term = `%${busca}%`;
      params.push(term, term, term, term);
    }

    if (categoria) {
      query += ` AND p.categoria = ?`;
      params.push(categoria);
    }

    if (status === 'CRITICO') {
      query += ` AND ${almoxarifado_id ? 'COALESCE(e.quantidade, 0)' : 'p.quantidade'} <= 0`;
    } else if (status === 'BAIXO') {
      query += ` AND ${almoxarifado_id ? 'COALESCE(e.quantidade, 0)' : 'p.quantidade'} > 0 AND ${almoxarifado_id ? 'COALESCE(e.quantidade, 0)' : 'p.quantidade'} <= p.estoque_minimo`;
    } else if (status === 'NORMAL') {
      query += ` AND ${almoxarifado_id ? 'COALESCE(e.quantidade, 0)' : 'p.quantidade'} > p.estoque_minimo`;
    }

    switch (ordenarPor) {
      case 'nome_desc':
        query += ` ORDER BY p.nome DESC`;
        break;
      case 'qtd_asc':
        query += ` ORDER BY quantidade_exibida ASC`;
        break;
      case 'qtd_desc':
        query += ` ORDER BY quantidade_exibida DESC`;
        break;
      case 'valor_desc':
        query += ` ORDER BY valor_total_estoque DESC`;
        break;
      default:
        query += ` ORDER BY p.nome ASC`;
    }

    return db.prepare(query).all(...params);
  }

  /**
   * Busca a ficha completa do produto com estoques por canteiro de obras e histórico
   */
  static findByIdWithEstoques(id) {
    const produto = this.findById(id);
    if (!produto) return null;

    // Distribuição de estoque em cada almoxarifado / canteiro de obra
    const estoquesObras = db.prepare(`
      SELECT 
        a.id AS almoxarifado_id,
        a.codigo AS almoxarifado_codigo,
        a.nome AS almoxarifado_nome,
        a.tipo AS almoxarifado_tipo,
        a.responsavel AS almoxarifado_responsavel,
        COALESCE(e.quantidade, 0) AS quantidade,
        e.localizacao
      FROM almoxarifados a
      LEFT JOIN estoques e ON a.id = e.almoxarifado_id AND e.produto_id = ?
      ORDER BY CASE WHEN a.tipo = 'CENTRAL' THEN 0 ELSE 1 END, a.nome ASC
    `).all(id);

    // Histórico de movimentações deste produto específico
    const historicoMovimentacoes = db.prepare(`
      SELECT 
        m.*,
        ao.nome AS almoxarifado_origem_nome,
        ao.codigo AS almoxarifado_origem_codigo,
        ad.nome AS almoxarifado_destino_nome,
        ad.codigo AS almoxarifado_destino_codigo
      FROM movimentacoes m
      LEFT JOIN almoxarifados ao ON m.almoxarifado_origem_id = ao.id
      LEFT JOIN almoxarifados ad ON m.almoxarifado_destino_id = ad.id
      WHERE m.produto_id = ?
      ORDER BY m.criado_em DESC, m.id DESC
      LIMIT 25
    `).all(id);

    return {
      ...produto,
      estoquesObras,
      historicoMovimentacoes
    };
  }

  /**
   * Busca um produto pelo ID com dados complementares
   */
  static findById(id) {
    const query = `
      SELECT 
        p.*,
        f.nome AS fornecedor_nome,
        f.contato AS fornecedor_contato,
        f.telefone AS fornecedor_telefone,
        (p.quantidade * p.preco_unitario) AS valor_total_estoque,
        CASE
          WHEN p.quantidade <= 0 THEN 'CRITICO'
          WHEN p.quantidade <= p.estoque_minimo THEN 'BAIXO'
          ELSE 'NORMAL'
        END AS status_estoque
      FROM produtos p
      LEFT JOIN fornecedores f ON p.fornecedor_id = f.id
      WHERE p.id = ?
    `;
    return db.prepare(query).get(id);
  }

  /**
   * Busca produto pelo código SKU único
   */
  static findBySku(sku) {
    if (!sku) return null;
    return db.prepare('SELECT * FROM produtos WHERE sku = ?').get(sku);
  }

  /**
   * Lista apenas produtos que atingiram ou estão abaixo do estoque mínimo
   */
  static findCriticos(limite = 10) {
    const query = `
      SELECT 
        p.*,
        f.nome AS fornecedor_nome,
        (p.estoque_minimo - p.quantidade) AS deficit,
        CASE
          WHEN p.quantidade <= 0 THEN 'CRITICO'
          ELSE 'BAIXO'
        END AS status_estoque
      FROM produtos p
      LEFT JOIN fornecedores f ON p.fornecedor_id = f.id
      WHERE p.quantidade <= p.estoque_minimo
      ORDER BY (p.quantidade * 1.0 / NULLIF(p.estoque_minimo, 0)) ASC, p.quantidade ASC
      LIMIT ?
    `;
    return db.prepare(query).all(limite);
  }

  /**
   * Cria um novo produto no almoxarifado (Campos opcionais e flexíveis)
   */
  static create({ sku, tag, nome, categoria, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, fornecedor_id }) {
    let finalSku = sku ? sku.trim().toUpperCase() : null;
    let finalTag = tag ? tag.trim().toUpperCase() : null;
    let finalNome = nome ? nome.trim() : null;

    // Se SKU não foi preenchido, gera um código automático (pode utilizar a tag como base)
    if (!finalSku) {
      if (finalTag) {
        finalSku = `TAG-${finalTag}`;
      } else {
        finalSku = 'ALM-' + Math.floor(10000 + Math.random() * 90000);
      }
    }

    // Garante que o SKU seja único
    let exist = this.findBySku(finalSku);
    if (exist) {
      finalSku = `${finalSku}-${Math.floor(100 + Math.random() * 900)}`;
    }

    // Se nome não foi preenchido, define um fallback amigável
    if (!finalNome) {
      finalNome = finalTag ? `Item [${finalTag}]` : `Item ${finalSku}`;
    }

    const stmt = db.prepare(`
      INSERT INTO produtos (sku, tag, nome, categoria, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, fornecedor_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      finalSku,
      finalTag,
      finalNome,
      categoria ? categoria.trim() : 'Geral',
      unidade_medida || 'UN',
      parseInt(quantidade, 10) || 0,
      estoque_minimo !== undefined && estoque_minimo !== '' ? parseInt(estoque_minimo, 10) : 0,
      preco_unitario !== undefined && preco_unitario !== '' ? parseFloat(preco_unitario) : 0.0,
      localizacao ? localizacao.trim() : null,
      fornecedor_id ? parseInt(fornecedor_id, 10) : null
    );

    return result.lastInsertRowid;
  }

  /**
   * Atualiza dados de um produto existente (Campos opcionais e flexíveis)
   */
  static update(id, { sku, tag, nome, categoria, unidade_medida, estoque_minimo, preco_unitario, localizacao, fornecedor_id }) {
    const atual = this.findById(id);
    if (!atual) {
      throw new Error('Produto não encontrado.');
    }

    let finalSku = sku ? sku.trim().toUpperCase() : atual.sku;
    if (finalSku && finalSku !== atual.sku) {
      const exist = this.findBySku(finalSku);
      if (exist && exist.id !== parseInt(id, 10)) {
        throw new Error(`O SKU "${finalSku}" já está em uso por outro produto.`);
      }
    }

    const stmt = db.prepare(`
      UPDATE produtos
      SET sku = ?,
          tag = ?,
          nome = ?,
          categoria = ?,
          unidade_medida = ?,
          estoque_minimo = ?,
          preco_unitario = ?,
          localizacao = ?,
          fornecedor_id = ?,
          atualizado_em = (datetime('now', 'localtime'))
      WHERE id = ?
    `);

    stmt.run(
      finalSku,
      tag !== undefined ? (tag ? tag.trim().toUpperCase() : null) : atual.tag,
      nome !== undefined ? (nome ? nome.trim() : atual.nome) : atual.nome,
      categoria !== undefined ? (categoria ? categoria.trim() : 'Geral') : atual.categoria,
      unidade_medida || atual.unidade_medida,
      estoque_minimo !== undefined && estoque_minimo !== '' ? parseInt(estoque_minimo, 10) : 0,
      preco_unitario !== undefined && preco_unitario !== '' ? parseFloat(preco_unitario) : 0.0,
      localizacao !== undefined ? (localizacao ? localizacao.trim() : null) : atual.localizacao,
      fornecedor_id ? parseInt(fornecedor_id, 10) : null,
      id
    );

    return true;
  }

  /**
   * Deleta produto caso não possua movimentações históricas que violem a rastreabilidade
   */
  static delete(id) {
    const movCount = db.prepare('SELECT COUNT(*) AS total FROM movimentacoes WHERE produto_id = ?').get(id).total;
    if (movCount > 0) {
      throw new Error(`Não é possível excluir este produto pois ele possui ${movCount} movimentação(ões) registrada(s). O histórico do almoxarifado deve ser mantido.`);
    }

    const stmt = db.prepare('DELETE FROM produtos WHERE id = ?');
    stmt.run(id);
    return true;
  }

  /**
   * Lista todas as categorias distintas cadastradas
   */
  static getCategorias() {
    return db.prepare('SELECT DISTINCT categoria FROM produtos ORDER BY categoria ASC').all().map(c => c.categoria);
  }

  /**
   * Obtém métricas gerais de estoque para o Dashboard
   */
  static getEstatisticas() {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) AS total_itens,
        COALESCE(SUM(quantidade), 0) AS total_unidades,
        COALESCE(SUM(quantidade * preco_unitario), 0) AS valor_patrimonial,
        COALESCE(SUM(CASE WHEN quantidade <= 0 THEN 1 ELSE 0 END), 0) AS total_zerados,
        COALESCE(SUM(CASE WHEN quantidade > 0 AND quantidade <= estoque_minimo THEN 1 ELSE 0 END), 0) AS total_baixos
      FROM produtos
    `).get();

    stats.total_em_alerta = stats.total_zerados + stats.total_baixos;
    return stats;
  }
}

module.exports = Produto;
