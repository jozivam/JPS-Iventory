const Movimentacao = require('../models/Movimentacao');
const Produto = require('../models/Produto');

class EstoqueController {
  /**
   * Histórico de Movimentações (Entradas e Saídas)
   */
  static async index(req, res) {
    try {
      const { produto_id, tipo, data_inicio, data_fim, sucesso, erro } = req.query;

      const filtros = {
        produto_id: produto_id ? parseInt(produto_id, 10) : '',
        tipo: tipo || '',
        data_inicio: data_inicio || '',
        data_fim: data_fim || ''
      };

      const movimentacoes = Movimentacao.findAll(filtros);
      const produtos = Produto.findAll();

      res.render('movimentacoes/index', {
        title: 'Movimentações de Estoque',
        currentPage: 'movimentacoes',
        movimentacoes,
        produtos,
        filtros,
        sucesso: sucesso || null,
        erro: erro || null
      });
    } catch (error) {
      console.error('Erro ao carregar movimentações:', error);
      res.status(500).render('layouts/erro', {
        title: 'Erro nas Movimentações',
        currentPage: 'movimentacoes',
        mensagem: 'Não foi possível carregar o histórico de movimentações.',
        detalhes: error.message
      });
    }
  }

  /**
   * Formulário de Registro de Nova Movimentação
   */
  static async create(req, res) {
    try {
      const { produto_id, tipo } = req.query;
      const produtos = Produto.findAll();

      let produtoPreSelecionado = null;
      if (produto_id) {
        produtoPreSelecionado = Produto.findById(produto_id);
      }

      const tipoPadrao = (tipo === 'ENTRADA' || tipo === 'SAIDA') ? tipo : 'SAIDA';

      res.render('movimentacoes/create', {
        title: 'Registrar Movimentação',
        currentPage: 'movimentacoes',
        produtos,
        produtoPreSelecionado,
        tipoPadrao,
        retornoProdutoId: produto_id || '',
        erro: null
      });
    } catch (error) {
      console.error('Erro ao abrir tela de movimentação:', error);
      res.redirect('/movimentacoes?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Processa o registro da movimentação
   */
  static async registrar(req, res) {
    try {
      const { produto_id, tipo, quantidade, motivo, responsavel, documento_ref } = req.body;

      if (!produto_id) {
        throw new Error('Selecione um produto para movimentar.');
      }

      const qtd = parseInt(quantidade, 10);
      if (!qtd || qtd <= 0) {
        throw new Error('A quantidade deve ser maior que zero.');
      }

      if (!responsavel || !responsavel.trim()) {
        throw new Error('Informe o nome do responsável pela movimentação.');
      }

      const resultado = Movimentacao.registrar({
        produto_id: parseInt(produto_id, 10),
        tipo,
        quantidade: qtd,
        motivo,
        responsavel,
        documento_ref
      });

      const mensagemSucesso = `${tipo === 'ENTRADA' ? 'Entrada' : 'Baixa'} de ${qtd} item(ns) de "${resultado.produto_nome}" realizada com sucesso! Novo saldo: ${resultado.novo_saldo}.`;

      res.redirect('/movimentacoes?sucesso=' + encodeURIComponent(mensagemSucesso));
    } catch (error) {
      console.error('Erro ao processar movimentação:', error);
      const produtos = Produto.findAll();
      const produtoPreSelecionado = req.body.produto_id ? Produto.findById(req.body.produto_id) : null;

      res.render('movimentacoes/create', {
        title: 'Registrar Movimentação',
        currentPage: 'movimentacoes',
        produtos,
        produtoPreSelecionado,
        tipoPadrao: req.body.tipo || 'SAIDA',
        retornoProdutoId: req.body.produto_id || '',
        erro: error.message
      });
    }
  }
}

module.exports = EstoqueController;
