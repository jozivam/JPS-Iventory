const Movimentacao = require('../models/Movimentacao');
const Produto = require('../models/Produto');
const xlsx = require('xlsx');

class EstoqueController {
  /**
   * Histórico de Movimentações (Acompanhamento e Auditoria com Filtros)
   */
  static async index(req, res) {
    try {
      const { produto_id, tipo, data_inicio, data_fim, periodo, sucesso, erro } = req.query;

      let dtInicio = data_inicio ? data_inicio.trim() : '';
      let dtFim = data_fim ? data_fim.trim() : '';

      // Atalhos rápidos de período
      const hoje = new Date();
      const formatYMD = (d) => d.toISOString().split('T')[0];

      if (periodo === 'hoje') {
        dtInicio = formatYMD(hoje);
        dtFim = formatYMD(hoje);
      } else if (periodo === '7dias') {
        const d7 = new Date();
        d7.setDate(d7.getDate() - 7);
        dtInicio = formatYMD(d7);
        dtFim = formatYMD(hoje);
      } else if (periodo === '30dias') {
        const d30 = new Date();
        d30.setDate(d30.getDate() - 30);
        dtInicio = formatYMD(d30);
        dtFim = formatYMD(hoje);
      } else if (periodo === 'mes') {
        const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        dtInicio = formatYMD(primeiroDiaMes);
        dtFim = formatYMD(hoje);
      }

      const filtros = {
        produto_id: produto_id ? parseInt(produto_id, 10) : '',
        tipo: tipo || '',
        data_inicio: dtInicio,
        data_fim: dtFim,
        periodo: periodo || ''
      };

      const movimentacoes = Movimentacao.findAll(filtros);
      const produtos = Produto.findAll();

      res.render('movimentacoes/index', {
        title: 'Histórico de Movimentações',
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
   * Formulário de Registro de Nova Movimentação (Acessado a partir do Inventário)
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
      res.redirect('/produtos?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Processa o registro de nova movimentação
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

      const resultado = Movimentacao.registrar({
        produto_id: parseInt(produto_id, 10),
        tipo,
        quantidade: qtd,
        motivo,
        responsavel,
        documento_ref
      });

      const mensagemSucesso = `${tipo === 'ENTRADA' ? 'Entrada' : 'Baixa'} de ${qtd} item(ns) de "${resultado.produto_nome}" registrada com sucesso! Novo saldo: ${resultado.novo_saldo}.`;

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

  /**
   * Atualiza uma movimentação e recalcula o inventário
   */
  static async update(req, res) {
    try {
      const { id } = req.params;
      const { produto_id, tipo, quantidade, motivo, responsavel, documento_ref } = req.body;

      Movimentacao.update(id, {
        produto_id,
        tipo,
        quantidade,
        motivo,
        responsavel,
        documento_ref
      });

      res.redirect('/movimentacoes?sucesso=' + encodeURIComponent(`Movimentação MOV-${String(id).padStart(4, '0')} atualizada com sucesso! O inventário foi recalculado automaticamente.`));
    } catch (error) {
      console.error('Erro ao atualizar movimentação:', error);
      res.redirect('/movimentacoes?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Exclui uma movimentação e reverte seu saldo no inventário
   */
  static async delete(req, res) {
    try {
      const { id } = req.params;
      const resultado = Movimentacao.delete(id);

      res.redirect('/movimentacoes?sucesso=' + encodeURIComponent(`Movimentação MOV-${String(id).padStart(4, '0')} excluída com sucesso! O saldo de "${resultado.produto_nome}" foi estornado no inventário.`));
    } catch (error) {
      console.error('Erro ao excluir movimentação:', error);
      res.redirect('/movimentacoes?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Exporta extrato de movimentações para Excel (.xlsx)
   */
  static async exportarExcel(req, res) {
    try {
      const { produto_id, tipo, data_inicio, data_fim, periodo } = req.query;

      let dtInicio = data_inicio ? data_inicio.trim() : '';
      let dtFim = data_fim ? data_fim.trim() : '';

      const hoje = new Date();
      const formatYMD = (d) => d.toISOString().split('T')[0];

      if (periodo === 'hoje') {
        dtInicio = formatYMD(hoje);
        dtFim = formatYMD(hoje);
      } else if (periodo === '7dias') {
        const d7 = new Date();
        d7.setDate(d7.getDate() - 7);
        dtInicio = formatYMD(d7);
        dtFim = formatYMD(hoje);
      } else if (periodo === '30dias') {
        const d30 = new Date();
        d30.setDate(d30.getDate() - 30);
        dtInicio = formatYMD(d30);
        dtFim = formatYMD(hoje);
      } else if (periodo === 'mes') {
        const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        dtInicio = formatYMD(primeiroDiaMes);
        dtFim = formatYMD(hoje);
      }

      const movimentacoes = Movimentacao.findAll({
        produto_id: produto_id ? parseInt(produto_id, 10) : '',
        tipo: tipo || '',
        data_inicio: dtInicio,
        data_fim: dtFim,
        limite: 1000
      });

      const dadosFormatados = movimentacoes.map(m => ({
        'Código': `MOV-${String(m.id).padStart(4, '0')}`,
        'Tipo': m.tipo === 'ENTRADA' ? 'Entrada' : 'Baixa',
        'Produto / Material': m.produto_nome || '',
        'SKU': m.produto_sku || '',
        'Quantidade': m.tipo === 'ENTRADA' ? m.quantidade : -m.quantidade,
        'Unidade': m.produto_unidade || 'UN',
        'Responsável': m.responsavel || '',
        'Documento / NF': m.documento_ref || '',
        'Motivo / Justificativa': m.motivo || '',
        'Data & Hora': m.criado_em || ''
      }));

      const ws = xlsx.utils.json_to_sheet(dadosFormatados);
      ws['!cols'] = [
        { wch: 14 }, // Código
        { wch: 12 }, // Tipo
        { wch: 38 }, // Produto
        { wch: 14 }, // SKU
        { wch: 14 }, // Quantidade
        { wch: 10 }, // Unidade
        { wch: 22 }, // Responsável
        { wch: 18 }, // Documento
        { wch: 32 }, // Motivo
        { wch: 20 }  // Data
      ];

      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'Movimentações');

      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const dataArquivo = hoje.toISOString().split('T')[0];

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="movimentacoes_almoxarifado_${dataArquivo}.xlsx"`);
      res.send(buffer);
    } catch (error) {
      console.error('Erro ao exportar Excel de movimentações:', error);
      res.redirect('/movimentacoes?erro=' + encodeURIComponent('Falha ao exportar movimentações: ' + error.message));
    }
  }
}

module.exports = EstoqueController;
