const Almoxarifado = require('../models/Almoxarifado');
const Produto = require('../models/Produto');
const Movimentacao = require('../models/Movimentacao');
const Requisicao = require('../models/Requisicao');

class TransferenciaController {
  /**
   * Painel de transferências e requisições inter-obras
   */
  static async index(req, res) {
    try {
      const requisicoes = Requisicao.findAll();
      const transferencias = Movimentacao.findAll({ tipo: 'TRANSFERENCIA', limite: 50 });
      const almoxarifados = Almoxarifado.findAll();

      res.render('transferencias/index', {
        title: 'Transferências & Requisições entre Obras',
        currentPage: 'transferencias',
        requisicoes,
        transferencias,
        almoxarifados,
        sucesso: req.query.sucesso || null,
        erro: req.query.erro || null
      });
    } catch (error) {
      console.error('Erro ao listar transferências:', error);
      res.redirect(`/?erro=${encodeURIComponent(error.message)}`);
    }
  }

  /**
   * Tela para realizar transferência imediata ou abrir requisição entre obras
   */
  static async create(req, res) {
    try {
      const { produto_id = '', origem_id = '', destino_id = '', modo = 'TRANSFERENCIA' } = req.query;
      const produtos = Produto.findAll();
      const almoxarifados = Almoxarifado.findAll();
      const produtoPreSelecionado = produto_id ? Produto.findById(produto_id) : null;

      res.render('transferencias/create', {
        title: modo === 'REQUISICAO' ? 'Requisitar Material entre Obras' : 'Transferência Direta entre Obras',
        currentPage: 'transferencias',
        produtos,
        almoxarifados,
        produtoPreSelecionado,
        origemPreSelecionada: origem_id,
        destinoPreSelecionado: destino_id,
        modoPadrao: modo === 'REQUISICAO' ? 'REQUISICAO' : 'TRANSFERENCIA',
        erro: req.query.erro || null
      });
    } catch (error) {
      console.error('Erro ao abrir formulário de transferência:', error);
      res.redirect('/transferencias?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Processa a transferência imediata ou a requisição
   */
  static async store(req, res) {
    try {
      const { modo, produto_id, almoxarifado_origem_id, almoxarifado_destino_id, quantidade, responsavel, motivo, documento_ref, observacoes } = req.body;

      if (modo === 'REQUISICAO') {
        // Cria a solicitação pendente para aprovação/atendimento
        Requisicao.create({
          almoxarifado_origem_id,
          almoxarifado_destino_id,
          produto_id,
          quantidade,
          solicitante: responsavel || req.body.solicitante || 'Almoxarife Solicitante',
          motivo,
          observacoes
        });

        res.redirect('/transferencias?sucesso=' + encodeURIComponent('Requisição de material enviada com sucesso! Aguardando atendimento do almoxarifado de origem.'));
      } else {
        // Transferência imediata de estoque
        const resultado = Movimentacao.registrar({
          produto_id,
          tipo: 'TRANSFERENCIA',
          quantidade,
          motivo: motivo || 'Transferência de suprimento entre canteiros de obra',
          responsavel,
          documento_ref: documento_ref || 'GUIA-TRANSF',
          almoxarifado_origem_id,
          almoxarifado_destino_id
        });

        res.redirect('/transferencias?sucesso=' + encodeURIComponent(`Transferência de ${quantidade} unidade(s) de "${resultado.produto_nome}" realizada com sucesso!`));
      }
    } catch (error) {
      console.error('Erro ao processar transferência:', error);
      const produtos = Produto.findAll();
      const almoxarifados = Almoxarifado.findAll();
      const produtoPreSelecionado = req.body.produto_id ? Produto.findById(req.body.produto_id) : null;

      res.render('transferencias/create', {
        title: req.body.modo === 'REQUISICAO' ? 'Requisitar Material entre Obras' : 'Transferência Direta entre Obras',
        currentPage: 'transferencias',
        produtos,
        almoxarifados,
        produtoPreSelecionado,
        origemPreSelecionada: req.body.almoxarifado_origem_id,
        destinoPreSelecionado: req.body.almoxarifado_destino_id,
        modoPadrao: req.body.modo || 'TRANSFERENCIA',
        dadosPreenchidos: req.body,
        erro: error.message
      });
    }
  }

  /**
   * Atende uma requisição pendente transferindo o material
   */
  static async atender(req, res) {
    try {
      const { id } = req.params;
      const responsavel = (req.body && req.body.responsavel) ? req.body.responsavel : 'Almoxarife Responsável';

      Requisicao.atender(id, responsavel);
      res.redirect('/transferencias?sucesso=' + encodeURIComponent('Requisição atendida! O saldo do material foi transferido com sucesso.'));
    } catch (error) {
      console.error('Erro ao atender requisição:', error);
      res.redirect('/transferencias?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Cancela uma requisição
   */
  static async cancelar(req, res) {
    try {
      const { id } = req.params;
      Requisicao.cancelar(id);
      res.redirect('/transferencias?sucesso=' + encodeURIComponent('Requisição cancelada.'));
    } catch (error) {
      console.error('Erro ao cancelar requisição:', error);
      res.redirect('/transferencias?erro=' + encodeURIComponent(error.message));
    }
  }
}

module.exports = TransferenciaController;
