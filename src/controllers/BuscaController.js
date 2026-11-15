const Produto = require('../models/Produto');
const Movimentacao = require('../models/Movimentacao');

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
        produtos = await Produto.findAll({ busca: q });
        movimentacoes = await Movimentacao.findAll({ busca: q, limite: 50 });
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
