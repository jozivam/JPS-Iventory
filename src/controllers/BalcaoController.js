const Produto = require('../models/Produto');
const Movimentacao = require('../models/Movimentacao');
const Colaborador = require('../models/Colaborador');

class BalcaoController {
  /**
   * Página Principal do Balcão de Atendimento
   */
  static async index(req, res) {
    try {
      const { tipo, produto_id, colaborador_id, sucesso, erro } = req.query;

      const [produtos, emprestimosPendentes, estatisticas, ultimosAtendimentos, colaboradores] = await Promise.all([
        Produto.findAll(),
        Movimentacao.findEmprestimosPendentes(),
        Movimentacao.getEstatisticasBalcao(),
        Movimentacao.findAll({ limite: 10 }),
        Colaborador.findAll({ status: 'ATIVO' })
      ]);

      let produtoPreSelecionado = null;
      if (produto_id) {
        produtoPreSelecionado = await Produto.findById(produto_id);
      }

      let colaboradorPreSelecionado = null;
      if (colaborador_id) {
        colaboradorPreSelecionado = await Colaborador.findById(colaborador_id);
      }

      res.render('balcao/index', {
        title: 'Balcão de Atendimento e Lançamentos',
        currentPage: 'balcao',
        produtos,
        colaboradores,
        emprestimosPendentes,
        estatisticas,
        ultimosAtendimentos,
        tipoPreSelecionado: tipo || 'SAIDA',
        produtoPreSelecionado,
        colaboradorPreSelecionado,
        sucesso: sucesso || null,
        erro: erro || null
      });
    } catch (error) {
      console.error('Erro ao carregar o Balcão:', error);
      res.status(500).render('layouts/erro', {
        title: 'Erro no Balcão',
        currentPage: 'balcao',
        mensagem: 'Não foi possível carregar a página do Balcão.',
        detalhes: error.message
      });
    }
  }

  /**
   * Processa o lançamento de uma operação no Balcão
   */
  static async registrar(req, res) {
    try {
      const { 
        produto_id, tipo, quantidade, colaborador, colaborador_id, responsavel, motivo, documento_ref 
      } = req.body;

      if (!produto_id) {
        throw new Error('Por favor, selecione um produto para realizar o lançamento.');
      }

      const qtd = parseInt(quantidade, 10);
      if (!qtd || qtd <= 0) {
        throw new Error('A quantidade deve ser um número maior que zero.');
      }

      // Validação estrita: impede saída ou empréstimo de produto zerado ou saldo insuficiente
      if (tipo === 'SAIDA' || tipo === 'EMPRESTIMO') {
        const prod = await Produto.findById(parseInt(produto_id, 10));
        if (!prod) {
          throw new Error('Produto selecionado não foi encontrado no inventário.');
        }
        const un = prod.unidade_medida || 'UN';
        const op = tipo === 'EMPRESTIMO' ? 'empréstimo' : 'saída';
        if (Number(prod.quantidade) <= 0) {
          throw new Error(`Operação Bloqueada: O produto "${prod.nome}" está com estoque ZERADO (0 ${un}). Não é permitido realizar ${op} de itens zerados. Realize primeiro uma operação de Entrada para repor o estoque.`);
        }
        if (Number(prod.quantidade) < qtd) {
          throw new Error(`Saldo insuficiente para ${op}: O produto "${prod.nome}" possui apenas ${prod.quantidade} ${un} disponíveis em estoque, mas foi solicitada a movimentação de ${qtd} ${un}.`);
        }
      }

      const colabFinal = (colaborador && colaborador.trim()) ? colaborador.trim() : 'Balcão';

      const resultado = await Movimentacao.registrar({
        produto_id: parseInt(produto_id, 10),
        tipo,
        quantidade: qtd,
        colaborador: colabFinal,
        colaborador_id: colaborador_id ? parseInt(colaborador_id, 10) : null,
        responsavel: responsavel ? responsavel.trim() : 'Almoxarife',
        motivo: motivo ? motivo.trim() : null,
        documento_ref: documento_ref ? documento_ref.trim() : null
      });

      let textoSucesso = '';
      if (tipo === 'EMPRESTIMO') {
        textoSucesso = `Empréstimo de ${qtd} item(ns) de "${resultado.produto_nome}" registrado com sucesso para ${colabFinal}!`;
      } else if (tipo === 'DEVOLUCAO') {
        textoSucesso = `Devolução de ${qtd} item(ns) de "${resultado.produto_nome}" registrada com sucesso! Saldo restaurado: ${resultado.novo_saldo}.`;
      } else if (tipo === 'ENTRADA') {
        textoSucesso = `Entrada de ${qtd} item(ns) de "${resultado.produto_nome}" registrada com sucesso! Novo saldo: ${resultado.novo_saldo}.`;
      } else if (tipo === 'SAIDA') {
        textoSucesso = `Saída de ${qtd} item(ns) de "${resultado.produto_nome}" registrada com sucesso! Saldo restante: ${resultado.novo_saldo}.`;
      } else if (tipo === 'TROCA') {
        textoSucesso = `Troca de "${resultado.produto_nome}" registrada com sucesso no balcão!`;
      } else {
        textoSucesso = `Operação de ${tipo} realizada com sucesso para "${resultado.produto_nome}"!`;
      }

      res.redirect('/balcao?sucesso=' + encodeURIComponent(textoSucesso));
    } catch (error) {
      console.error('Erro ao processar atendimento no Balcão:', error);
      res.redirect('/balcao?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Dá baixa direta em um empréstimo ativo (devolução com 1 clique)
   */
  static async devolver(req, res) {
    try {
      const { id } = req.params;
      const { responsavel, motivo, documento_ref } = req.body;

      const resultado = await Movimentacao.devolverEmprestimo(id, {
        responsavel: responsavel ? responsavel.trim() : 'Atendente do Balcão',
        motivo: motivo ? motivo.trim() : 'Devolução de ferramenta no balcão',
        documento_ref: documento_ref ? documento_ref.trim() : null
      });

      res.redirect('/balcao?sucesso=' + encodeURIComponent(`Devolução da ferramenta "${resultado.produto_nome}" confirmada com sucesso! O estoque foi restaurado (Saldo: ${resultado.novo_saldo}).`));
    } catch (error) {
      console.error('Erro ao devolver empréstimo no Balcão:', error);
      res.redirect('/balcao?erro=' + encodeURIComponent(error.message));
    }
  }
}

module.exports = BalcaoController;
