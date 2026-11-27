const Dashboard = require('../models/Dashboard');
const Produto = require('../models/Produto');
const Colaborador = require('../models/Colaborador');

class DashboardController {
  /**
   * Página Principal do Sistema - Visão Geral, Saúde do Estoque e Requisições
   */
  static async index(req, res) {
    try {
      const { sucesso, erro } = req.query;

      const [metricas, produtos, colaboradores] = await Promise.all([
        Dashboard.getMetricasCompletas(),
        Produto.findAll(),
        Colaborador.findAll({ status: 'ATIVO' })
      ]);

      res.render('dashboard/index', {
        title: 'Dashboard - Saúde do Estoque e Requisições',
        currentPage: 'dashboard',
        metricas,
        produtos,
        colaboradores,
        sucesso: sucesso || null,
        erro: erro || null
      });
    } catch (error) {
      console.error('Erro ao carregar Dashboard:', error);
      res.status(500).render('layouts/erro', {
        title: 'Erro no Dashboard',
        currentPage: 'dashboard',
        mensagem: 'Não foi possível carregar os dados do Dashboard.',
        detalhes: error.message
      });
    }
  }
}

module.exports = DashboardController;
