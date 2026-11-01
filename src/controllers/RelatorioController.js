const Produto = require('../models/Produto');
const Movimentacao = require('../models/Movimentacao');

class RelatorioController {
  /**
   * Tela consolidada de relatórios de consumo, giro e custos
   */
  static async index(req, res) {
    try {
      const { ano = new Date().getFullYear(), mes = '', categoria = '' } = req.query;

      const estatisticas = Produto.getEstatisticas();
      let itensCriticos = Produto.findCriticos(100);
      const maisConsumidos = Movimentacao.getMaisMovimentados(10);
      const distribuicaoCategorias = Movimentacao.getDistribuicaoPorCategoria();
      const resumoMensal = Movimentacao.getRelatorioConsumo({ ano, mes });
      const categorias = Produto.getCategorias();

      // Filtro opcional por categoria na lista de críticos
      if (categoria) {
        itensCriticos = itensCriticos.filter(item => item.categoria === categoria);
      }

      // Cálculos agregados para os KPIs executivos
      const custoTotalRecomposicao = itensCriticos.reduce((acc, item) => acc + (item.deficit * (item.preco_unitario || 0)), 0);
      const volumeTotalMovimentado = resumoMensal.reduce((acc, r) => acc + (r.volume_unidades || 0), 0);
      const totalFinanceiroMovimentado = resumoMensal.reduce((acc, r) => acc + (r.valor_financeiro || 0), 0);

      res.render('relatorios/index', {
        title: 'Relatórios & Auditoria',
        currentPage: 'relatorios',
        estatisticas,
        itensCriticos,
        maisConsumidos,
        distribuicaoCategorias,
        distribuicaoCategoriasJson: JSON.stringify(distribuicaoCategorias),
        resumoMensal,
        resumoMensalJson: JSON.stringify(resumoMensal),
        categorias,
        metricas: {
          custoTotalRecomposicao,
          volumeTotalMovimentado,
          totalFinanceiroMovimentado
        },
        filtros: { ano, mes, categoria }
      });
    } catch (error) {
      console.error('Erro ao gerar relatórios:', error);
      res.redirect(`/?erro=${encodeURIComponent(error.message)}`);
    }
  }
}

module.exports = RelatorioController;
