const Movimentacao = require('../models/Movimentacao');
const Produto = require('../models/Produto');

class EstoqueController {
  /**
   * Exibe o histórico de movimentações (entradas e saídas) com filtros
   */
  static async index(req, res) {
    try {
      const { produto_id = '', tipo = '', data_inicio = '', data_fim = '' } = req.query;
      const movimentacoes = Movimentacao.findAll({ produto_id, tipo, data_inicio, data_fim });
      const produtos = Produto.findAll();

      res.render('movimentacoes/index', {
        title: 'Histórico de Movimentações - Almoxarifado',
        currentPage: 'movimentacoes',
        movimentacoes,
        produtos,
        filtros: { produto_id, tipo, data_inicio, data_fim },
        sucesso: req.query.sucesso || null,
        erro: req.query.erro || null
      });
    } catch (error) {
      console.error('Erro ao listar movimentações:', error);
      res.redirect(`/?erro=${encodeURIComponent(error.message)}`);
    }
  }

  /**
   * Tela para o operador realizar a baixa de materiais ou entrada de estoque
   */
  static async create(req, res) {
    try {
      const { produto_id = '', tipo = 'SAIDA' } = req.query;
      const produtos = Produto.findAll();
      const produtoPreSelecionado = produto_id ? Produto.findById(produto_id) : null;

      res.render('movimentacoes/create', {
        title: tipo === 'ENTRADA' ? 'Entrada de Materiais (NF / Reposição)' : 'Baixa de Materiais (Requisição)',
        currentPage: 'movimentacoes',
        produtos,
        tipoPadrao: ['ENTRADA', 'SAIDA'].includes(tipo.toUpperCase()) ? tipo.toUpperCase() : 'SAIDA',
        produtoPreSelecionado,
        erro: req.query.erro || null
      });
    } catch (error) {
      console.error('Erro ao abrir formulário de movimentação:', error);
      res.redirect('/movimentacoes?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Processa a baixa ou entrada de estoque com validações em tempo real
   */
  static async registrar(req, res) {
    try {
      const { produto_id, tipo, quantidade, motivo, responsavel, documento_ref } = req.body;

      const resultado = Movimentacao.registrar({
        produto_id,
        tipo,
        quantidade,
        motivo,
        responsavel,
        documento_ref
      });

      const mensagem = resultado.tipo === 'ENTRADA'
        ? `Entrada de ${quantidade} unidade(s) confirmada para "${resultado.produto_nome}". Novo saldo em estoque: ${resultado.quantidade_nova}.`
        : `Baixa de ${quantidade} unidade(s) realizada com sucesso para "${resultado.produto_nome}". Saldo restante: ${resultado.quantidade_nova}.`;

      res.redirect('/movimentacoes?sucesso=' + encodeURIComponent(mensagem));
    } catch (error) {
      console.error('Erro ao processar movimentação:', error);
      const produtos = Produto.findAll();
      const produtoPreSelecionado = req.body.produto_id ? Produto.findById(req.body.produto_id) : null;

      res.render('movimentacoes/create', {
        title: req.body.tipo === 'ENTRADA' ? 'Entrada de Materiais' : 'Baixa de Materiais',
        currentPage: 'movimentacoes',
        produtos,
        tipoPadrao: req.body.tipo || 'SAIDA',
        produtoPreSelecionado,
        dadosPreenchidos: req.body,
        erro: error.message
      });
    }
  }
}

module.exports = EstoqueController;
