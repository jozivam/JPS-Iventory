const Produto = require('../models/Produto');
const Movimentacao = require('../models/Movimentacao');

class DashboardController {
  static async index(req, res) {
    try {
      const estatisticas = Produto.getEstatisticas();
      const itensCriticos = Produto.findCriticos(6);
      const movimentacoesRecentes = Movimentacao.findAll({ limite: 6 });
      const dadosGrafico = Movimentacao.getGraficoConsumo(7);
      const itensMaisMovimentados = Movimentacao.getMaisMovimentados(5);
      const distribuicaoCategorias = Movimentacao.getDistribuicaoPorCategoria();

      // Totalizadores de Entradas e Saídas recentes
      const totalEntradasVolume = dadosGrafico.reduce((acc, d) => acc + (d.total_entradas || 0), 0);
      const totalSaidasVolume = dadosGrafico.reduce((acc, d) => acc + (d.total_saidas || 0), 0);

      // Taxa de eficiência e atendimento
      const taxaEficiencia = estatisticas.total_itens > 0 
        ? Math.round(((estatisticas.total_itens - estatisticas.total_em_alerta) / estatisticas.total_itens) * 100) 
        : 100;

      res.render('dashboard/index', {
        title: 'Visão Geral (Overview)',
        currentPage: 'dashboard',
        estatisticas: {
          ...estatisticas,
          totalEntradasVolume,
          totalSaidasVolume,
          taxaEficiencia
        },
        itensCriticos,
        movimentacoesRecentes,
        dadosGraficoJson: JSON.stringify(dadosGrafico),
        distribuicaoCategoriasJson: JSON.stringify(distribuicaoCategorias),
        itensMaisMovimentados
      });
    } catch (error) {
      console.error('Erro ao carregar Dashboard:', error);
      res.status(500).render('layouts/erro', { 
        title: 'Erro no Sistema',
        mensagem: 'Não foi possível carregar as métricas do painel.',
        detalhes: error.message 
      });
    }
  }
}

module.exports = DashboardController;
