const db = require('../../config/database');

class Fornecedor {
  /**
   * Lista todos os fornecedores cadastrados com contagem de produtos fornecidos
   */
  static findAll() {
    const query = `
      SELECT 
        f.*,
        COUNT(p.id) AS total_produtos_fornecidos
      FROM fornecedores f
      LEFT JOIN produtos p ON f.id = p.fornecedor_id
      GROUP BY f.id
      ORDER BY f.nome ASC
    `;
    return db.prepare(query).all();
  }

  /**
   * Busca um fornecedor pelo ID e inclui a lista dos seus produtos
   */
  static findById(id) {
    const fornecedor = db.prepare('SELECT * FROM fornecedores WHERE id = ?').get(id);
    if (!fornecedor) return null;

    const produtos = db.prepare(`
      SELECT id, sku, nome, categoria, quantidade, estoque_minimo, preco_unitario 
      FROM produtos 
      WHERE fornecedor_id = ?
      ORDER BY nome ASC
    `).all(id);

    return {
      ...fornecedor,
      produtos
    };
  }

  /**
   * Cadastra novo fornecedor
   */
  static create({ nome, cnpj, email, telefone, contato }) {
    if (!nome) {
      throw new Error('A Razão Social / Nome do fornecedor é obrigatório.');
    }

    const stmt = db.prepare(`
      INSERT INTO fornecedores (nome, cnpj, email, telefone, contato)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      nome.trim(),
      cnpj ? cnpj.trim() : null,
      email ? email.trim() : null,
      telefone ? telefone.trim() : null,
      contato ? contato.trim() : null
    );

    return result.lastInsertRowid;
  }

  /**
   * Atualiza informações do fornecedor
   */
  static update(id, { nome, cnpj, email, telefone, contato }) {
    if (!nome) {
      throw new Error('O nome do fornecedor é obrigatório.');
    }

    const stmt = db.prepare(`
      UPDATE fornecedores
      SET nome = ?, cnpj = ?, email = ?, telefone = ?, contato = ?
      WHERE id = ?
    `);

    stmt.run(
      nome.trim(),
      cnpj ? cnpj.trim() : null,
      email ? email.trim() : null,
      telefone ? telefone.trim() : null,
      contato ? contato.trim() : null,
      id
    );

    return true;
  }

  /**
   * Remove fornecedor desvinculando produtos caso existam
   */
  static delete(id) {
    const stmt = db.prepare('DELETE FROM fornecedores WHERE id = ?');
    stmt.run(id);
    return true;
  }
}

module.exports = Fornecedor;
