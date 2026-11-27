const Produto = require('./Produto');
const Movimentacao = require('./Movimentacao');
const Colaborador = require('./Colaborador');
const Requisicao = require('./Requisicao');

class Dashboard {
  /**
   * Coleta e calcula todas as métricas essenciais de saúde do estoque e do almoxarifado
   */
  static async getMetricasCompletas() {
    const [
      produtos,
      estatisticasBalcao,
      emprestimosPendentes,
      ultimasMovimentacoes,
      requisicoesPendentes,
      estatisticasRequisicoes,
      colaboradores
    ] = await Promise.all([
      Produto.findAll(),
      Movimentacao.getEstatisticasBalcao(),
      Movimentacao.findEmprestimosPendentes(),
      Movimentacao.findAll({ limite: 8 }),
      Requisicao.findPendentes(15),
      Requisicao.getEstatisticas(),
      Colaborador.findAll({ status: 'ATIVO' })
    ]);

    // Análise da Saúde do Estoque
    let totalItens = produtos.length;
    let totalUnidadesFisicas = 0;
    let itensNormais = 0;
    let itensBaixo = 0;
    let itensZerados = 0;
    const itensCriticos = [];

    // Distribuição por categoria
    const categoriasMap = {};

    produtos.forEach(p => {
      const qtd = Number(p.quantidade) || 0;
      const min = Number(p.estoque_minimo) || 0;
      totalUnidadesFisicas += qtd;

      const cat = p.categoria || 'Geral';
      if (!categoriasMap[cat]) {
        categoriasMap[cat] = { nome: cat, itens: 0, unidades: 0 };
      }
      categoriasMap[cat].itens += 1;
      categoriasMap[cat].unidades += qtd;

      if (qtd <= 0) {
        itensZerados++;
        itensCriticos.push({
          ...p,
          statusCritico: 'ZERADO',
          prioridade: 1
        });
      } else if (qtd <= min) {
        itensBaixo++;
        itensCriticos.push({
          ...p,
          statusCritico: 'BAIXO',
          prioridade: 2
        });
      } else {
        itensNormais++;
      }
    });

    // Ordena itens críticos: primeiro os zerados, depois os baixos
    itensCriticos.sort((a, b) => a.prioridade - b.prioridade || a.quantidade - b.quantidade);

    // % de Saúde do Estoque (0 a 100%)
    const percentualSaude = totalItens > 0 
      ? Math.round((itensNormais / totalItens) * 100) 
      : 100;

    let nivelSaude = 'EXCELENTE';
    let corSaude = '#10B981'; // verde
    if (percentualSaude < 70) {
      nivelSaude = 'CRÍTICO';
      corSaude = '#EF4444'; // vermelho
    } else if (percentualSaude < 85) {
      nivelSaude = 'ATENÇÃO';
      corSaude = '#F59E0B'; // amarelo/laranja
    } else if (percentualSaude < 95) {
      nivelSaude = 'BOM';
      corSaude = '#3B82F6'; // azul
    }

    const categoriasOrdenadas = Object.values(categoriasMap)
      .sort((a, b) => b.unidades - a.unidades)
      .slice(0, 6);

    return {
      saudeEstoque: {
        totalItens,
        totalUnidadesFisicas,
        itensNormais,
        itensBaixo,
        itensZerados,
        percentualSaude,
        nivelSaude,
        corSaude,
        itensCriticos: itensCriticos.slice(0, 8)
      },
      requisicoes: {
        pendentes: requisicoesPendentes,
        estatisticas: estatisticasRequisicoes
      },
      cautelas: {
        totalFerramentasEmCampo: emprestimosPendentes.reduce((acc, e) => acc + (Number(e.quantidade) || 0), 0),
        totalCautelasAtivas: emprestimosPendentes.length,
        ultimasCautelas: emprestimosPendentes.slice(0, 6)
      },
      atendimentosHoje: estatisticasBalcao,
      ultimasMovimentacoes,
      categoriasDestaque: categoriasOrdenadas,
      totalColaboradoresAtivos: colaboradores.length
    };
  }
}

module.exports = Dashboard;
