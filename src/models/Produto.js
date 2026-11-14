const db = require('../../config/database');

class Produto {
  /**
   * Lista todos os produtos com filtros opcionais
   */
  static findAll({ busca, categoria, status } = {}) {
    let sql = `
      SELECT 
        p.*,
        CASE 
          WHEN p.quantidade = 0 THEN 'CRITICO'
          WHEN p.quantidade <= p.estoque_minimo THEN 'BAIXO'
          ELSE 'NORMAL'
        END as status_estoque
      FROM produtos p
      WHERE 1=1
    `;
    const params = {};

    if (busca && busca.trim()) {
      sql += ` AND (p.nome LIKE @busca OR p.sku LIKE @busca OR p.localizacao LIKE @busca)`;
      params.busca = `%${busca.trim()}%`;
    }

    if (categoria && categoria.trim()) {
      sql += ` AND p.categoria = @categoria`;
      params.categoria = categoria.trim();
    }

    if (status) {
      if (status === 'NORMAL') {
        sql += ` AND p.quantidade > p.estoque_minimo`;
      } else if (status === 'BAIXO') {
        sql += ` AND p.quantidade > 0 AND p.quantidade <= p.estoque_minimo`;
      } else if (status === 'CRITICO') {
        sql += ` AND p.quantidade = 0`;
      }
    }

    sql += ` ORDER BY p.nome ASC`;

    return db.prepare(sql).all(params);
  }

  /**
   * Busca um produto por ID
   */
  static findById(id) {
    const sql = `
      SELECT 
        p.*,
        CASE 
          WHEN p.quantidade = 0 THEN 'CRITICO'
          WHEN p.quantidade <= p.estoque_minimo THEN 'BAIXO'
          ELSE 'NORMAL'
        END as status_estoque
      FROM produtos p
      WHERE p.id = ?
    `;
    return db.prepare(sql).get(id);
  }

  /**
   * Busca produto por código SKU
   */
  static findBySku(sku) {
    return db.prepare('SELECT * FROM produtos WHERE sku = ?').get(sku);
  }

  /**
   * Cadastra um novo produto
   */
  static create(dados) {
    const stmt = db.prepare(`
      INSERT INTO produtos (
        sku, nome, categoria, unidade_medida, quantidade, 
        estoque_minimo, preco_unitario, localizacao
      ) VALUES (
        @sku, @nome, @categoria, @unidade_medida, @quantidade, 
        @estoque_minimo, @preco_unitario, @localizacao
      )
    `);

    const result = stmt.run({
      sku: dados.sku ? dados.sku.trim().toUpperCase() : Produto.gerarSku(dados.categoria),
      nome: dados.nome.trim(),
      categoria: dados.categoria ? dados.categoria.trim() : 'Geral',
      unidade_medida: dados.unidade_medida ? dados.unidade_medida.trim().toUpperCase() : 'UN',
      quantidade: parseInt(dados.quantidade, 10) || 0,
      estoque_minimo: parseInt(dados.estoque_minimo, 10) || 0,
      preco_unitario: parseFloat(dados.preco_unitario) || 0.0,
      localizacao: dados.localizacao ? dados.localizacao.trim() : null
    });

    return result.lastInsertRowid;
  }

  /**
   * Atualiza um produto existente
   */
  static update(id, dados) {
    const stmt = db.prepare(`
      UPDATE produtos SET
        sku = @sku,
        nome = @nome,
        categoria = @categoria,
        unidade_medida = @unidade_medida,
        quantidade = @quantidade,
        estoque_minimo = @estoque_minimo,
        preco_unitario = @preco_unitario,
        localizacao = @localizacao,
        atualizado_em = datetime('now', 'localtime')
      WHERE id = @id
    `);

    return stmt.run({
      id,
      sku: dados.sku ? dados.sku.trim().toUpperCase() : dados.sku_atual,
      nome: dados.nome.trim(),
      categoria: dados.categoria ? dados.categoria.trim() : 'Geral',
      unidade_medida: dados.unidade_medida ? dados.unidade_medida.trim().toUpperCase() : 'UN',
      quantidade: parseInt(dados.quantidade, 10) || 0,
      estoque_minimo: parseInt(dados.estoque_minimo, 10) || 0,
      preco_unitario: parseFloat(dados.preco_unitario) || 0.0,
      localizacao: dados.localizacao ? dados.localizacao.trim() : null
    });
  }

  /**
   * Remove um produto pelo ID
   */
  static delete(id) {
    return db.prepare('DELETE FROM produtos WHERE id = ?').run(id);
  }

  /**
   * Retorna estatísticas gerais do inventário
   */
  static getEstatisticas() {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_itens,
        COALESCE(SUM(quantidade), 0) as total_unidades,
        COALESCE(SUM(quantidade * preco_unitario), 0) as valor_patrimonial,
        COALESCE(SUM(CASE WHEN quantidade > estoque_minimo THEN 1 ELSE 0 END), 0) as inStockCount,
        COALESCE(SUM(CASE WHEN quantidade > 0 AND quantidade <= estoque_minimo THEN 1 ELSE 0 END), 0) as lowStockCount,
        COALESCE(SUM(CASE WHEN quantidade = 0 THEN 1 ELSE 0 END), 0) as outOfStockCount
      FROM produtos
    `).get();

    return stats;
  }

  /**
   * Retorna lista de categorias cadastradas
   */
  static getCategorias() {
    const rows = db.prepare('SELECT DISTINCT categoria FROM produtos WHERE categoria IS NOT NULL ORDER BY categoria ASC').all();
    return rows.map(r => r.categoria);
  }

  /**
   * Gerador automático de SKU simples e elegante
   */
  static gerarSku(categoria = 'GER') {
    const prefixo = categoria ? categoria.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'ITM') : 'ITM';
    const randomNum = Math.floor(100 + Math.random() * 900);
    return `${prefixo}-${randomNum}`;
  }
}

module.exports = Produto;
