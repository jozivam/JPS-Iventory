const Produto = require('../models/Produto');
const Movimentacao = require('../models/Movimentacao');

class RelatorioController {
  /**
   * Tela consolidada de relatórios de consumo, giro e custos
   */
  static async index(req, res) {
    try {
      const { ano = new Date().getFullYear(), mes = '' } = req.query;

      const estatisticas = Produto.getEstatisticas();
      const itensCriticos = Produto.findCriticos(50);
      const maisConsumidos = Movimentacao.getMaisMovimentados(10);
      const distribuicaoCategorias = Movimentacao.getDistribuicaoPorCategoria();
      const resumoMensal = Movimentacao.getRelatorioConsumo({ ano, mes });

      res.render('relatorios/index', {
        title: 'Relatórios de Consumo e Indicadores - Almoxarifado',
        currentPage: 'relatorios',
        estatisticas,
        itensCriticos,
        maisConsumidos,
        distribuicaoCategorias,
        resumoMensal,
        filtros: { ano, mes }
      });
    } catch (error) {
      console.error('Erro ao gerar relatórios:', error);
      res.redirect(`/?erro=${encodeURIComponent(error.message)}`);
    }
  }
}

module.exports = RelatorioController;
