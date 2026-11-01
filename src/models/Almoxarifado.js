const db = require('../../config/database');

class Almoxarifado {
  /**
   * Lista todos os almoxarifados / canteiros de obras com métricas de estoque
   */
  static findAll() {
    const query = `
      SELECT 
        a.*,
        COUNT(DISTINCT e.produto_id) AS total_itens_distintos,
        COALESCE(SUM(e.quantidade), 0) AS total_unidades,
        COALESCE(SUM(e.quantidade * p.preco_unitario), 0) AS valor_patrimonial,
        (
          SELECT COUNT(*) 
          FROM requisicoes_obras r 
          WHERE (r.almoxarifado_origem_id = a.id OR r.almoxarifado_destino_id = a.id) 
            AND r.status = 'PENDENTE'
        ) AS requisicoes_pendentes
      FROM almoxarifados a
      LEFT JOIN estoques e ON a.id = e.almoxarifado_id
      LEFT JOIN produtos p ON e.produto_id = p.id
      GROUP BY a.id
      ORDER BY 
        CASE WHEN a.tipo = 'CENTRAL' THEN 0 ELSE 1 END,
        a.nome ASC
    `;
    return db.prepare(query).all();
  }

  /**
   * Busca um almoxarifado pelo ID com estatísticas específicas
   */
  static findById(id) {
    const query = `
      SELECT 
        a.*,
        COUNT(DISTINCT e.produto_id) AS total_itens_distintos,
        COALESCE(SUM(e.quantidade), 0) AS total_unidades,
        COALESCE(SUM(e.quantidade * p.preco_unitario), 0) AS valor_patrimonial
      FROM almoxarifados a
      LEFT JOIN estoques e ON a.id = e.almoxarifado_id
      LEFT JOIN produtos p ON e.produto_id = p.id
      WHERE a.id = ?
      GROUP BY a.id
    `;
    return db.prepare(query).get(id);
  }

  /**
   * Busca por código único
   */
  static findByCodigo(codigo) {
    return db.prepare('SELECT * FROM almoxarifados WHERE codigo = ?').get(codigo);
  }

  /**
   * Cadastra novo almoxarifado ou canteiro de obras
   */
  static create({ codigo, nome, tipo, endereco, responsavel, telefone, status }) {
    if (!nome) {
      throw new Error('O nome do almoxarifado ou canteiro de obra é obrigatório.');
    }

    let finalCodigo = codigo ? codigo.trim().toUpperCase() : null;
    if (!finalCodigo) {
      finalCodigo = 'OBRA-' + Math.floor(100 + Math.random() * 900);
    }

    const exist = this.findByCodigo(finalCodigo);
    if (exist) {
      finalCodigo = `${finalCodigo}-${Math.floor(10 + Math.random() * 90)}`;
    }

    const stmt = db.prepare(`
      INSERT INTO almoxarifados (codigo, nome, tipo, endereco, responsavel, telefone, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      finalCodigo,
      nome.trim(),
      tipo || 'OBRA',
      endereco ? endereco.trim() : null,
      responsavel ? responsavel.trim() : null,
      telefone ? telefone.trim() : null,
      status || 'ATIVO'
    );

    // Inicializa a tabela de estoques com 0 para todos os produtos existentes
    const almoxarifadoId = result.lastInsertRowid;
    const produtos = db.prepare('SELECT id FROM produtos').all();
    const insertEstoque = db.prepare('INSERT OR IGNORE INTO estoques (produto_id, almoxarifado_id, quantidade) VALUES (?, ?, 0)');
    for (const p of produtos) {
      insertEstoque.run(p.id, almoxarifadoId);
    }

    return almoxarifadoId;
  }

  /**
   * Atualiza dados do almoxarifado
   */
  static update(id, { codigo, nome, tipo, endereco, responsavel, telefone, status }) {
    const atual = this.findById(id);
    if (!atual) {
      throw new Error('Almoxarifado não encontrado.');
    }

    const stmt = db.prepare(`
      UPDATE almoxarifados
      SET codigo = ?,
          nome = ?,
          tipo = ?,
          endereco = ?,
          responsavel = ?,
          telefone = ?,
          status = ?
      WHERE id = ?
    `);

    stmt.run(
      codigo ? codigo.trim().toUpperCase() : atual.codigo,
      nome ? nome.trim() : atual.nome,
      tipo || atual.tipo,
      endereco !== undefined ? (endereco ? endereco.trim() : null) : atual.endereco,
      responsavel !== undefined ? (responsavel ? responsavel.trim() : null) : atual.responsavel,
      telefone !== undefined ? (telefone ? telefone.trim() : null) : atual.telefone,
      status || atual.status,
      id
    );

    return true;
  }

  /**
   * Obtém todo o estoque físico deste almoxarifado específico
   */
  static getEstoqueCompleto(almoxarifado_id) {
    const query = `
      SELECT 
        p.*,
        e.id AS estoque_id,
        COALESCE(e.quantidade, 0) AS quantidade_obra,
        e.localizacao AS localizacao_obra,
        (COALESCE(e.quantidade, 0) * p.preco_unitario) AS valor_estoque_obra
      FROM produtos p
      LEFT JOIN estoques e ON p.id = e.produto_id AND e.almoxarifado_id = ?
      ORDER BY p.nome ASC
    `;
    return db.prepare(query).all(almoxarifado_id);
  }
}

module.exports = Almoxarifado;
