const Movimentacao = require('../models/Movimentacao');
const Produto = require('../models/Produto');
const Almoxarifado = require('../models/Almoxarifado');

class EstoqueController {
  /**
   * Exibe o histórico de movimentações (entradas, saídas e transferências) com filtros
   */
  static async index(req, res) {
    try {
      const { produto_id = '', tipo = '', almoxarifado_id = '', data_inicio = '', data_fim = '' } = req.query;
      const movimentacoes = Movimentacao.findAll({ produto_id, tipo, almoxarifado_id, data_inicio, data_fim });
      const produtos = Produto.findAll();
      const almoxarifados = Almoxarifado.findAll();

      res.render('movimentacoes/index', {
        title: 'Histórico de Movimentações - Almoxarifado',
        currentPage: 'movimentacoes',
        movimentacoes,
        produtos,
        almoxarifados,
        filtros: { produto_id, tipo, almoxarifado_id, data_inicio, data_fim },
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
      const { produto_id = '', tipo = 'SAIDA', almoxarifado_id = '', retorno_produto_id = '' } = req.query;
      const produtos = Produto.findAll();
      const almoxarifados = Almoxarifado.findAll();
      const produtoPreSelecionado = produto_id ? Produto.findById(produto_id) : null;

      res.render('movimentacoes/create', {
        title: tipo.toUpperCase() === 'ENTRADA' ? 'Entrada de Materiais (NF / Reposição)' : 'Baixa de Materiais (Consumo em Obra)',
        currentPage: 'movimentacoes',
        produtos,
        almoxarifados,
        almoxarifadoPreSelecionado: almoxarifado_id,
        retornoProdutoId: retorno_produto_id || produto_id,
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
      const { 
        produto_id, 
        tipo, 
        quantidade, 
        motivo, 
        responsavel, 
        documento_ref, 
        almoxarifado_origem_id, 
        almoxarifado_destino_id,
        retorno_produto_id 
      } = req.body;

      const resultado = Movimentacao.registrar({
        produto_id,
        tipo,
        quantidade,
        motivo,
        responsavel,
        documento_ref,
        almoxarifado_origem_id,
        almoxarifado_destino_id
      });

      const mensagem = resultado.tipo === 'ENTRADA'
        ? `Entrada de ${quantidade} unidade(s) confirmada para "${resultado.produto_nome}". Novo saldo em estoque: ${resultado.quantidade_total_nova}.`
        : `Baixa de ${quantidade} unidade(s) realizada com sucesso para "${resultado.produto_nome}". Saldo restante: ${resultado.quantidade_total_nova}.`;

      if (retorno_produto_id) {
        return res.redirect(`/produtos/${retorno_produto_id}?sucesso=` + encodeURIComponent(mensagem));
      }

      res.redirect('/movimentacoes?sucesso=' + encodeURIComponent(mensagem));
    } catch (error) {
      console.error('Erro ao processar movimentação:', error);
      const produtos = Produto.findAll();
      const almoxarifados = Almoxarifado.findAll();
      const produtoPreSelecionado = req.body.produto_id ? Produto.findById(req.body.produto_id) : null;

      res.render('movimentacoes/create', {
        title: req.body.tipo === 'ENTRADA' ? 'Entrada de Materiais' : 'Baixa de Materiais',
        currentPage: 'movimentacoes',
        produtos,
        almoxarifados,
        almoxarifadoPreSelecionado: req.body.almoxarifado_origem_id || req.body.almoxarifado_destino_id,
        retornoProdutoId: req.body.retorno_produto_id || '',
        tipoPadrao: req.body.tipo || 'SAIDA',
        produtoPreSelecionado,
        dadosPreenchidos: req.body,
        erro: error.message
      });
    }
  }
}

module.exports = EstoqueController;
