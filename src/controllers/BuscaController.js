const Produto = require('../models/Produto');
const Movimentacao = require('../models/Movimentacao');
const db = require('../../config/database');

class BuscaController {
  /**
   * Busca Geral no Sistema (Varre Inventário e Movimentações)
   */
  static async index(req, res) {
    try {
      const q = req.query.q ? req.query.q.trim() : '';

      let produtos = [];
      let movimentacoes = [];

      if (q) {
        // 1. Busca ampla nos Produtos
        produtos = Produto.findAll({ busca: q });

        // 2. Busca ampla nas Movimentações (responsável, motivo, documento ou nome/sku do produto)
        const sqlMov = `
          SELECT 
            m.*,
            p.nome as produto_nome,
            p.sku as produto_sku,
            p.unidade_medida as produto_unidade
          FROM movimentacoes m
          JOIN produtos p ON m.produto_id = p.id
          WHERE (
            m.responsavel LIKE @q
            OR m.motivo LIKE @q
            OR m.documento_ref LIKE @q
            OR p.nome LIKE @q
            OR p.sku LIKE @q
            OR p.marca LIKE @q
            OR p.tag LIKE @q
            OR p.patrimonio LIKE @q
          )
          ORDER BY m.id DESC
          LIMIT 50
        `;
        movimentacoes = db.prepare(sqlMov).all({ q: `%${q}%` });
      }

      res.render('busca/index', {
        title: q ? `Busca Geral: "${q}"` : 'Busca Geral no Sistema',
        currentPage: 'busca',
        queryBuscaGeral: q,
        q,
        produtos,
        movimentacoes,
        totalResultados: produtos.length + movimentacoes.length
      });
    } catch (error) {
      console.error('Erro na Busca Geral:', error);
      res.status(500).render('layouts/erro', {
        title: 'Erro na Busca',
        currentPage: 'busca',
        mensagem: 'Não foi possível realizar a pesquisa geral.',
        detalhes: error.message
      });
    }
  }
}

module.exports = BuscaController;
