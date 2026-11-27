const Requisicao = require('../models/Requisicao');
const Produto = require('../models/Produto');
const Colaborador = require('../models/Colaborador');

class RequisicaoController {
  /**
   * Lista todas as requisições com filtros
   */
  static async index(req, res) {
    try {
      const { status, busca, sucesso, erro } = req.query;

      const [requisicoes, produtos, colaboradores, estatisticas] = await Promise.all([
        Requisicao.findAll({ status: status || 'TODAS' }),
        Produto.findAll(),
        Colaborador.findAll({ status: 'ATIVO' }),
        Requisicao.getEstatisticas()
      ]);

      let listaFiltrada = requisicoes;
      if (busca && busca.trim()) {
        const b = busca.trim().toLowerCase();
        listaFiltrada = requisicoes.filter(r => 
          (r.codigo && r.codigo.toLowerCase().includes(b)) ||
          (r.produto_nome && r.produto_nome.toLowerCase().includes(b)) ||
          (r.colaborador_nome && r.colaborador_nome.toLowerCase().includes(b)) ||
          (r.solicitante_nome && r.solicitante_nome.toLowerCase().includes(b)) ||
          (r.motivo && r.motivo.toLowerCase().includes(b)) ||
          (r.documento_ref && r.documento_ref.toLowerCase().includes(b))
        );
      }

      res.render('requisicoes/index', {
        title: 'Requisições de Materiais e EPIs',
        currentPage: 'requisicoes',
        requisicoes: listaFiltrada,
        produtos,
        colaboradores,
        estatisticas,
        filtros: {
          status: status || 'TODAS',
          busca: busca || ''
        },
        sucesso: sucesso || null,
        erro: erro || null
      });
    } catch (error) {
      console.error('Erro ao listar requisições:', error);
      res.status(500).render('layouts/erro', {
        title: 'Erro em Requisições',
        currentPage: 'requisicoes',
        mensagem: 'Não foi possível carregar as requisições.',
        detalhes: error.message
      });
    }
  }

  /**
   * Abre nova requisição (feita por Técnico de Segurança, encarregado ou solicitante)
   */
  static async store(req, res) {
    try {
      const {
        produto_id,
        colaborador_id,
        colaborador_nome,
        solicitante_nome,
        solicitante_id,
        tipo_operacao,
        quantidade,
        motivo,
        documento_ref,
        origem // 'dashboard', 'balcao' ou 'requisicoes'
      } = req.body;

      // Solicitante: sempre prioriza o usuário autenticado na sessão atual
      let solicitanteFinal = (req.user && req.user.nome)
        ? `${req.user.nome}${req.user.cargo ? ' (' + req.user.cargo + ')' : ''}`
        : (solicitante_nome ? solicitante_nome.trim() : 'Usuário do Sistema');
      let solicitanteIdFinal = (req.user && req.user.id) ? req.user.id : (solicitante_id ? parseInt(solicitante_id, 10) : null);

      let nomeColabFinal = (colaborador_nome || '').trim();
      let colabIdFinal = colaborador_id ? parseInt(colaborador_id, 10) : null;

      // Se for destinado ao Balcão ou estiver em branco, atribui ao Balcão sem ficha individual
      if (!nomeColabFinal || nomeColabFinal.toLowerCase() === 'balcão' || nomeColabFinal.toLowerCase() === 'balcao') {
        nomeColabFinal = 'Balcão';
        colabIdFinal = null;
      } else if (colabIdFinal) {
        // Colaborador cadastrado no sistema
        const c = await Colaborador.findById(colabIdFinal);
        if (c) {
          nomeColabFinal = c.nome;
        }
      }
      // Se não tiver colabIdFinal mas tiver nomeColabFinal, é uma pessoa avulsa/não cadastrada (aceita livremente!)

      const novaReq = await Requisicao.create({
        produto_id: parseInt(produto_id, 10),
        colaborador_id: colabIdFinal,
        colaborador_nome: nomeColabFinal,
        solicitante_nome: solicitanteFinal,
        solicitante_id: solicitanteIdFinal,
        tipo_operacao: tipo_operacao || 'SAIDA',
        quantidade: parseInt(quantidade, 10) || 1,
        motivo,
        documento_ref
      });

      const rotaRedirecionamento = origem === 'dashboard' 
        ? '/' 
        : (origem === 'balcao' ? '/balcao' : '/requisicoes');

      res.redirect(`${rotaRedirecionamento}?sucesso=${encodeURIComponent(`Requisição ${novaReq.codigo} registrada com sucesso! Aguardando aceite do Almoxarife.`)}`);
    } catch (error) {
      console.error('Erro ao registrar requisição:', error);
      const origem = req.body.origem || 'requisicoes';
      const rotaRedirecionamento = origem === 'dashboard' ? '/' : (origem === 'balcao' ? '/balcao' : '/requisicoes');
      res.redirect(`${rotaRedirecionamento}?erro=${encodeURIComponent(error.message)}`);
    }
  }

  /**
   * Almoxarife aceita e entrega a requisição (dá baixa/empréstimo no estoque)
   */
  static async aprovar(req, res) {
    try {
      const { id } = req.params;
      const { almoxarife_responsavel, motivo_atendimento, origem } = req.body;

      const resultado = await Requisicao.aprovar(id, {
        almoxarife_responsavel: almoxarife_responsavel || 'Jozivam Silva',
        motivo_atendimento
      });

      const rotaRedirecionamento = origem === 'dashboard' ? '/' : '/requisicoes';
      res.redirect(`${rotaRedirecionamento}?sucesso=${encodeURIComponent(`Requisição ${resultado.requisicao.codigo} ACEITA e entregue com sucesso! Saldo restante de "${resultado.movimentacao.produto_nome}": ${resultado.novo_saldo}.`)}`);
    } catch (error) {
      console.error('Erro ao aprovar requisição:', error);
      const origem = req.body.origem || 'requisicoes';
      const rotaRedirecionamento = origem === 'dashboard' ? '/' : '/requisicoes';
      res.redirect(`${rotaRedirecionamento}?erro=${encodeURIComponent(error.message)}`);
    }
  }

  /**
   * Almoxarife recusa a requisição com justificativa
   */
  static async recusar(req, res) {
    try {
      const { id } = req.params;
      const { almoxarife_responsavel, motivo_recusa, origem } = req.body;

      const resultado = await Requisicao.recusar(id, {
        almoxarife_responsavel: almoxarife_responsavel || 'Jozivam Silva',
        motivo_recusa
      });

      const rotaRedirecionamento = origem === 'dashboard' ? '/' : '/requisicoes';
      res.redirect(`${rotaRedirecionamento}?sucesso=${encodeURIComponent(`Requisição ${resultado.codigo} recusada com justificativa registrada.`)}`);
    } catch (error) {
      console.error('Erro ao recusar requisição:', error);
      const origem = req.body.origem || 'requisicoes';
      const rotaRedirecionamento = origem === 'dashboard' ? '/' : '/requisicoes';
      res.redirect(`${rotaRedirecionamento}?erro=${encodeURIComponent(error.message)}`);
    }
  }

  /**
   * Solicitante cancela requisição pendente
   */
  static async cancelar(req, res) {
    try {
      const { id } = req.params;
      const { solicitante_nome, origem } = req.body;

      const resultado = await Requisicao.cancelar(id, { solicitante_nome });
      const rotaRedirecionamento = origem === 'dashboard' ? '/' : '/requisicoes';
      res.redirect(`${rotaRedirecionamento}?sucesso=${encodeURIComponent(`Requisição ${resultado.codigo} cancelada.`)}`);
    } catch (error) {
      console.error('Erro ao cancelar requisição:', error);
      const origem = req.body.origem || 'requisicoes';
      const rotaRedirecionamento = origem === 'dashboard' ? '/' : '/requisicoes';
      res.redirect(`${rotaRedirecionamento}?erro=${encodeURIComponent(error.message)}`);
    }
  }
}

module.exports = RequisicaoController;
