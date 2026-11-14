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
      sql += ` AND (
        p.nome LIKE @busca 
        OR p.sku LIKE @busca 
        OR p.localizacao LIKE @busca
        OR p.tag LIKE @busca
        OR p.patrimonio LIKE @busca
        OR p.numero_serie LIKE @busca
        OR p.ca LIKE @busca
      )`;
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

    sql += ` ORDER BY p.id DESC`;

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
    return db.prepare('SELECT * FROM produtos WHERE UPPER(sku) = UPPER(?)').get(sku);
  }

  /**
   * Cadastra um novo produto (todos os campos flexíveis/opcionais)
   */
  static create(dados) {
    const stmt = db.prepare(`
      INSERT INTO produtos (
        sku, nome, categoria, unidade_medida, quantidade, 
        estoque_minimo, preco_unitario, localizacao,
        tamanho, cor, peso, numero_serie, ca, patrimonio, tag
      ) VALUES (
        @sku, @nome, @categoria, @unidade_medida, @quantidade, 
        @estoque_minimo, @preco_unitario, @localizacao,
        @tamanho, @cor, @peso, @numero_serie, @ca, @patrimonio, @tag
      )
    `);

    const nomeFormatado = dados.nome && dados.nome.trim() ? dados.nome.trim() : 'Item sem descrição';
    const skuFormatado = dados.sku && dados.sku.trim() 
      ? dados.sku.trim().toUpperCase() 
      : Produto.gerarSku(dados.categoria);

    const result = stmt.run({
      sku: skuFormatado,
      nome: nomeFormatado,
      categoria: dados.categoria && dados.categoria.trim() ? dados.categoria.trim() : 'Outros',
      unidade_medida: dados.unidade_medida && dados.unidade_medida.trim() ? dados.unidade_medida.trim().toUpperCase() : 'UN',
      quantidade: parseInt(dados.quantidade, 10) || 0,
      estoque_minimo: parseInt(dados.estoque_minimo, 10) || 0,
      preco_unitario: parseFloat(dados.preco_unitario) || 0.0,
      localizacao: dados.localizacao && dados.localizacao.trim() ? dados.localizacao.trim() : null,
      tamanho: dados.tamanho && dados.tamanho.trim() ? dados.tamanho.trim() : null,
      cor: dados.cor && dados.cor.trim() ? dados.cor.trim() : null,
      peso: dados.peso && dados.peso.trim() ? dados.peso.trim() : null,
      numero_serie: dados.numero_serie && dados.numero_serie.trim() ? dados.numero_serie.trim() : null,
      ca: dados.ca && dados.ca.trim() ? dados.ca.trim() : null,
      patrimonio: dados.patrimonio && dados.patrimonio.trim() ? dados.patrimonio.trim() : null,
      tag: dados.tag && dados.tag.trim() ? dados.tag.trim().toUpperCase() : null
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
        tamanho = @tamanho,
        cor = @cor,
        peso = @peso,
        numero_serie = @numero_serie,
        ca = @ca,
        patrimonio = @patrimonio,
        tag = @tag,
        atualizado_em = datetime('now', 'localtime')
      WHERE id = @id
    `);

    const nomeFormatado = dados.nome && dados.nome.trim() ? dados.nome.trim() : 'Item sem descrição';

    return stmt.run({
      id,
      sku: dados.sku && dados.sku.trim() ? dados.sku.trim().toUpperCase() : dados.sku_atual,
      nome: nomeFormatado,
      categoria: dados.categoria && dados.categoria.trim() ? dados.categoria.trim() : 'Outros',
      unidade_medida: dados.unidade_medida && dados.unidade_medida.trim() ? dados.unidade_medida.trim().toUpperCase() : 'UN',
      quantidade: parseInt(dados.quantidade, 10) || 0,
      estoque_minimo: parseInt(dados.estoque_minimo, 10) || 0,
      preco_unitario: parseFloat(dados.preco_unitario) || 0.0,
      localizacao: dados.localizacao && dados.localizacao.trim() ? dados.localizacao.trim() : null,
      tamanho: dados.tamanho && dados.tamanho.trim() ? dados.tamanho.trim() : null,
      cor: dados.cor && dados.cor.trim() ? dados.cor.trim() : null,
      peso: dados.peso && dados.peso.trim() ? dados.peso.trim() : null,
      numero_serie: dados.numero_serie && dados.numero_serie.trim() ? dados.numero_serie.trim() : null,
      ca: dados.ca && dados.ca.trim() ? dados.ca.trim() : null,
      patrimonio: dados.patrimonio && dados.patrimonio.trim() ? dados.patrimonio.trim() : null,
      tag: dados.tag && dados.tag.trim() ? dados.tag.trim().toUpperCase() : null
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
   * Retorna lista de categorias cadastradas, sempre incluindo "Outros"
   */
  static getCategorias() {
    const categoriasBase = [
      'Ferramentas',
      'EPI / Segurança',
      'Elétrica e TI',
      'Hidráulica',
      'Pintura e Acabamento',
      'Suprimentos Gerais'
    ];

    const rows = db.prepare(`
      SELECT DISTINCT categoria 
      FROM produtos 
      WHERE categoria IS NOT NULL AND TRIM(categoria) != ''
      ORDER BY categoria ASC
    `).all();

    const doBanco = rows.map(r => r.categoria).filter(c => c !== 'Outros');
    const todas = Array.from(new Set([...categoriasBase, ...doBanco]));

    // "Outros" sempre disponível no final
    return [...todas, 'Outros'];
  }

  /**
   * Gerador automático de SKU
   */
  static gerarSku(categoria = 'GER') {
    const prefixo = categoria ? categoria.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'ITM') : 'ITM';
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `${prefixo}-${randomNum}`;
  }
}

module.exports = Produto;
