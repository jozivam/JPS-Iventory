const db = require('../../config/database');
const Movimentacao = require('./Movimentacao');

class Requisicao {
  /**
   * Lista todas as requisições entre obras com dados completos
   */
  static findAll({ status = '', almoxarifado_destino_id = '' } = {}) {
    let query = `
      SELECT 
        r.*,
        p.nome AS produto_nome,
        p.sku AS produto_sku,
        p.tag AS produto_tag,
        p.unidade_medida AS produto_unidade,
        ao.nome AS origem_nome,
        ao.nome AS almoxarifado_origem_nome,
        ao.codigo AS origem_codigo,
        ao.codigo AS almoxarifado_origem_codigo,
        ad.nome AS destino_nome,
        ad.nome AS almoxarifado_destino_nome,
        ad.codigo AS destino_codigo,
        ad.codigo AS almoxarifado_destino_codigo
      FROM requisicoes_obras r
      LEFT JOIN produtos p ON r.produto_id = p.id
      LEFT JOIN almoxarifados ao ON r.almoxarifado_origem_id = ao.id
      LEFT JOIN almoxarifados ad ON r.almoxarifado_destino_id = ad.id
      WHERE 1=1
    `;

    const params = [];

    if (status) {
      query += ` AND r.status = ?`;
      params.push(status);
    }

    if (almoxarifado_destino_id) {
      query += ` AND r.almoxarifado_destino_id = ?`;
      params.push(almoxarifado_destino_id);
    }

    query += ` ORDER BY r.criado_em DESC, r.id DESC`;

    return db.prepare(query).all(...params);
  }

  /**
   * Busca requisição por ID
   */
  static findById(id) {
    const query = `
      SELECT 
        r.*,
        p.nome AS produto_nome,
        p.sku AS produto_sku,
        p.tag AS produto_tag,
        p.unidade_medida AS produto_unidade,
        ao.nome AS origem_nome,
        ao.nome AS almoxarifado_origem_nome,
        ao.codigo AS origem_codigo,
        ao.codigo AS almoxarifado_origem_codigo,
        ad.nome AS destino_nome,
        ad.nome AS almoxarifado_destino_nome,
        ad.codigo AS destino_codigo,
        ad.codigo AS almoxarifado_destino_codigo
      FROM requisicoes_obras r
      LEFT JOIN produtos p ON r.produto_id = p.id
      LEFT JOIN almoxarifados ao ON r.almoxarifado_origem_id = ao.id
      LEFT JOIN almoxarifados ad ON r.almoxarifado_destino_id = ad.id
      WHERE r.id = ?
    `;
    return db.prepare(query).get(id);
  }

  /**
   * Cria nova solicitação/requisição de material entre canteiros de obras
   */
  static create({ almoxarifado_origem_id, almoxarifado_destino_id, produto_id, quantidade, solicitante, motivo, observacoes }) {
    if (!almoxarifado_origem_id || !almoxarifado_destino_id || !produto_id || !quantidade || !solicitante) {
      throw new Error('Origem, Destino, Produto, Quantidade e Solicitante são obrigatórios.');
    }

    if (parseInt(almoxarifado_origem_id, 10) === parseInt(almoxarifado_destino_id, 10)) {
      throw new Error('A obra de origem e a obra de destino não podem ser as mesmas.');
    }

    const codigo = 'REQ-' + Math.floor(1000 + Math.random() * 9000);

    const stmt = db.prepare(`
      INSERT INTO requisicoes_obras (codigo, almoxarifado_origem_id, almoxarifado_destino_id, produto_id, quantidade, solicitante, motivo, observacoes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE')
    `);

    const result = stmt.run(
      codigo,
      parseInt(almoxarifado_origem_id, 10),
      parseInt(almoxarifado_destino_id, 10),
      parseInt(produto_id, 10),
      parseInt(quantidade, 10),
      solicitante.trim(),
      motivo ? motivo.trim() : 'Transferência entre obras',
      observacoes ? observacoes.trim() : null
    );

    return result.lastInsertRowid;
  }

  /**
   * Atende a requisição: atualiza status para ATENDIDA e realiza a transferência automática de estoque
   */
  static atender(id, responsavelAtendimento = 'Almoxarife Responsável') {
    const requisicao = this.findById(id);
    if (!requisicao) {
      throw new Error('Requisição não encontrada.');
    }

    if (requisicao.status === 'FINALIZADA') {
      throw new Error('Esta requisição já foi atendida e finalizada.');
    }

    const executarAtendimento = db.transaction(() => {
      // Realiza a transferência atômica entre as obras
      Movimentacao.registrar({
        produto_id: requisicao.produto_id,
        tipo: 'TRANSFERENCIA',
        quantidade: requisicao.quantidade,
        motivo: `Atendimento Requisição ${requisicao.codigo}: ${requisicao.motivo || 'Suprimento de Obra'}`,
        responsavel: responsavelAtendimento,
        documento_ref: requisicao.codigo,
        almoxarifado_origem_id: requisicao.almoxarifado_origem_id,
        almoxarifado_destino_id: requisicao.almoxarifado_destino_id
      });

      // Atualiza status da requisição
      db.prepare(`
        UPDATE requisicoes_obras 
        SET status = 'FINALIZADA', atualizado_em = (datetime('now', 'localtime')) 
        WHERE id = ?
      `).run(id);

      return true;
    });

    return executarAtendimento();
  }

  /**
   * Cancela uma requisição pendente
   */
  static cancelar(id) {
    db.prepare(`UPDATE requisicoes_obras SET status = 'CANCELADA', atualizado_em = (datetime('now', 'localtime')) WHERE id = ?`).run(id);
    return true;
  }
}

module.exports = Requisicao;
