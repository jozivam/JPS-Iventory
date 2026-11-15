const Colaborador = require('../models/Colaborador');
const Movimentacao = require('../models/Movimentacao');

class FichaController {
  /**
   * Página Principal de Controle de Fichas de Colaboradores
   */
  static async index(req, res) {
    try {
      const { colaborador_id, busca, filtro_pendencia, tipo, sucesso, erro } = req.query;

      // 1. Lista todos os colaboradores com resumos individuais
      const colaboradoresComResumo = await Colaborador.listarComResumoFicha();

      // Estatísticas gerais consolidadas do módulo de Fichas
      const totalColaboradores = colaboradoresComResumo.length;
      const comPendencia = colaboradoresComResumo.filter(c => c.temPendencia).length;
      const totalFerramentasCauteladas = colaboradoresComResumo.reduce((acc, c) => acc + c.ferramentasEmAberto, 0);
      const totalSaidasRegistradas = colaboradoresComResumo.reduce((acc, c) => acc + c.totalSaidas, 0);

      const estatisticasGerais = {
        totalColaboradores,
        comPendencia,
        totalFerramentasCauteladas,
        totalSaidasRegistradas
      };

      // 2. Determina qual colaborador está com a ficha aberta
      let colaboradorIdAlvo = colaborador_id;
      if (!colaboradorIdAlvo && colaboradoresComResumo.length > 0) {
        // Se houver alguém com ferramentas em posse (pendência ativa), prioriza ele para visualização imediata
        const prioritario = colaboradoresComResumo.find(c => c.temPendencia) || colaboradoresComResumo[0];
        colaboradorIdAlvo = prioritario.id;
      }

      let dadosFicha = null;
      if (colaboradorIdAlvo) {
        dadosFicha = await Colaborador.getFicha(colaboradorIdAlvo);

        // Aplica filtros opcionais dentro do extrato da ficha selecionada
        if (dadosFicha && dadosFicha.movimentacoes) {
          if (tipo && tipo.trim()) {
            dadosFicha.movimentacoes = dadosFicha.movimentacoes.filter(m => m.tipo === tipo.trim());
          }

          if (busca && busca.trim()) {
            const b = busca.trim().toLowerCase();
            dadosFicha.movimentacoes = dadosFicha.movimentacoes.filter(m =>
              (m.produto_nome && m.produto_nome.toLowerCase().includes(b)) ||
              (m.produto_sku && m.produto_sku.toLowerCase().includes(b)) ||
              (m.motivo && m.motivo.toLowerCase().includes(b)) ||
              (m.documento_ref && m.documento_ref.toLowerCase().includes(b)) ||
              (m.responsavel && m.responsavel.toLowerCase().includes(b))
            );
          }
        }
      }

      res.render('fichas/index', {
        title: 'Controle de Ficha de Colaboradores',
        currentPage: 'fichas',
        colaboradores: colaboradoresComResumo,
        colaboradorAtual: dadosFicha ? dadosFicha.colaborador : null,
        estatisticasFicha: dadosFicha ? dadosFicha.estatisticasFicha : null,
        emprestimosAtivos: dadosFicha ? dadosFicha.emprestimosAtivos : [],
        movimentacoes: dadosFicha ? dadosFicha.movimentacoes : [],
        estatisticasGerais,
        filtros: {
          colaborador_id: colaboradorIdAlvo || '',
          busca: busca || '',
          tipo: tipo || '',
          filtro_pendencia: filtro_pendencia || ''
        },
        sucesso: sucesso || null,
        erro: erro || null
      });
    } catch (error) {
      console.error('Erro ao carregar controle de fichas:', error);
      res.status(500).render('layouts/erro', {
        title: 'Erro no Controle de Fichas',
        currentPage: 'fichas',
        mensagem: 'Não foi possível carregar a página de Fichas de Colaboradores.',
        detalhes: error.message
      });
    }
  }
}

module.exports = FichaController;
