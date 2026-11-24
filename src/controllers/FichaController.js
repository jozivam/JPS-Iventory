const xlsx = require('xlsx');
const Colaborador = require('../models/Colaborador');
const Movimentacao = require('../models/Movimentacao');

function filtrarMovimentacoesFicha(movimentacoes = [], { busca, tipo } = {}) {
  let lista = Array.isArray(movimentacoes) ? [...movimentacoes] : [];

  if (tipo && String(tipo).trim()) {
    const t = String(tipo).trim();
    lista = lista.filter(m => m.tipo === t);
  }

  if (busca && String(busca).trim()) {
    const b = String(busca).trim().toLowerCase();
    lista = lista.filter(m =>
      (m.produto_nome && m.produto_nome.toLowerCase().includes(b)) ||
      (m.produto_sku && m.produto_sku.toLowerCase().includes(b)) ||
      (m.motivo && m.motivo.toLowerCase().includes(b)) ||
      (m.documento_ref && m.documento_ref.toLowerCase().includes(b)) ||
      (m.responsavel && m.responsavel.toLowerCase().includes(b))
    );
  }

  return lista;
}

function formatarDataHoraBR(dateStr) {
  if (!dateStr) return '-';
  const str = String(dateStr).trim();
  if (!str.includes('T') && !str.includes('Z') && !str.includes('+') && str.length >= 16) {
    return `${str.substring(8, 10)}/${str.substring(5, 7)}/${str.substring(0, 4)} ${str.substring(11, 16)}`;
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  const tz = process.env.APP_TIMEZONE || 'America/Cuiaba';
  try {
    return d.toLocaleDateString('pt-BR', { timeZone: tz }) + ' ' +
      d.toLocaleTimeString('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
}

function slugArquivo(texto) {
  return String(texto || 'colaborador')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .substring(0, 40) || 'colaborador';
}

function statusCautelaTexto(m) {
  if (m.tipo === 'EMPRESTIMO') {
    return m.status_emprestimo === 'PENDENTE' ? 'Em Posse (Pendente)' : 'Devolvido';
  }
  if (m.tipo === 'SAIDA') return 'Consumido / Baixado';
  if (m.tipo === 'DEVOLUCAO') return 'Retorno ao Estoque';
  if (m.tipo === 'TROCA') return 'Troca Concluída';
  return 'Concluído';
}

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

      // 2. Determina se uma ficha individual específica foi aberta
      let colaboradorIdAlvo = colaborador_id ? String(colaborador_id).trim() : null;
      let dadosFicha = null;

      if (colaboradorIdAlvo) {
        dadosFicha = await Colaborador.getFicha(colaboradorIdAlvo);
        if (dadosFicha && dadosFicha.movimentacoes) {
          dadosFicha.movimentacoes = filtrarMovimentacoesFicha(dadosFicha.movimentacoes, { busca, tipo });
        }
      }

      res.render('fichas/index', {
        title: (dadosFicha && dadosFicha.colaborador) ? `Ficha de ${dadosFicha.colaborador.nome} - Almoxarifado` : 'Controle de Ficha de Colaboradores',
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

  /**
   * Versão Oficial A4 da Ficha do Colaborador (Exportar PDF / Imprimir e Assinar)
   */
  static async pdf(req, res) {
    try {
      const colaboradorId = req.params.colaborador_id;
      const { busca, tipo, auto_print } = req.query;

      const dadosFicha = await Colaborador.getFicha(colaboradorId);
      const movimentacoes = filtrarMovimentacoesFicha(dadosFicha.movimentacoes, { busca, tipo });

      const tz = process.env.APP_TIMEZONE || 'America/Cuiaba';
      const agora = new Date();
      let emitidoEm = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      try {
        emitidoEm = agora.toLocaleDateString('pt-BR', { timeZone: tz }) + ' ' +
          agora.toLocaleTimeString('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
      } catch (_) {}

      res.render('fichas/pdf', {
        title: `Ficha de ${dadosFicha.colaborador.nome} — PDF`,
        colaborador: dadosFicha.colaborador,
        estatisticasFicha: dadosFicha.estatisticasFicha,
        emprestimosAtivos: dadosFicha.emprestimosAtivos || [],
        movimentacoes,
        filtros: {
          busca: busca || '',
          tipo: tipo || ''
        },
        emitidoEm,
        emitidoPor: req.user ? req.user.nome : 'Gestão de Almoxarifado',
        autoPrint: auto_print === '1',
        podeAssinar: !!(req.user && ['ADMIN', 'ALMOXARIFE', 'OPERADOR_FICHAS'].includes(req.user.nivel_acesso))
      });
    } catch (error) {
      console.error('Erro ao gerar PDF da ficha do colaborador:', error);
      res.redirect('/fichas?erro=' + encodeURIComponent('Não foi possível abrir o PDF da ficha: ' + error.message));
    }
  }

  /**
   * Exporta a Ficha Individual do Colaborador em Excel (.xlsx) com 3 abas organizadas
   */
  static async exportarExcel(req, res) {
    try {
      const colaboradorId = req.params.colaborador_id;
      const { busca, tipo } = req.query;

      const dadosFicha = await Colaborador.getFicha(colaboradorId);
      const colab = dadosFicha.colaborador;
      const est = dadosFicha.estatisticasFicha || {};
      const emprestimosAtivos = dadosFicha.emprestimosAtivos || [];
      const movimentacoes = filtrarMovimentacoesFicha(dadosFicha.movimentacoes, { busca, tipo });

      const wb = xlsx.utils.book_new();
      const addSheet = (nome, rows, widths) => {
        const safe = rows.length > 0 ? rows : [{ 'Aviso': 'Nenhum registro nesta seção.' }];
        const ws = xlsx.utils.json_to_sheet(safe);
        if (widths) ws['!cols'] = widths.map(wch => ({ wch }));
        xlsx.utils.book_append_sheet(wb, ws, nome.substring(0, 31));
      };

      const resumoRows = [
        { 'Campo': 'Documento', 'Informação': 'Ficha Individual de Cautela e Entrega de Materiais / EPIs' },
        { 'Campo': 'Código da Ficha', 'Informação': `FICHA-${String(colab.id).padStart(4, '0')}` },
        { 'Campo': 'Colaborador', 'Informação': colab.nome || '' },
        { 'Campo': 'Matrícula', 'Informação': colab.matricula || 'Não informada' },
        { 'Campo': 'CPF / RG', 'Informação': colab.cpf_rg || 'Não informado' },
        { 'Campo': 'Cargo / Função', 'Informação': colab.cargo || 'Não informado' },
        { 'Campo': 'Departamento / Setor', 'Informação': colab.departamento || 'Geral' },
        { 'Campo': 'Status', 'Informação': colab.status || 'ATIVO' },
        { 'Campo': 'Telefone / WhatsApp', 'Informação': colab.telefone || '-' },
        { 'Campo': 'E-mail', 'Informação': colab.email || '-' },
        { 'Campo': '---', 'Informação': '---' },
        { 'Campo': 'Ferramentas em Posse (Cautela Ativa)', 'Informação': `${est.totalEmprestimosAtivosQtd || 0} un. (${est.totalEmprestimosPendentesCount || 0} cautela(s))` },
        { 'Campo': 'Baixas / Consumo (EPIs e Materiais)', 'Informação': `${est.totalSaidasQtd || 0} item(ns)` },
        { 'Campo': 'Devoluções Realizadas', 'Informação': `${est.totalDevolucoesQtd || 0} item(ns)` },
        { 'Campo': 'Total de Lançamentos Listados', 'Informação': movimentacoes.length },
        { 'Campo': '---', 'Informação': '---' },
        { 'Campo': 'Assinatura Digital do Colaborador', 'Informação': colab.assinatura_colaborador ? `Assinado em ${formatarDataHoraBR(colab.assinatura_colaborador_em)}` : 'Pendente / Assinar no PDF' },
        { 'Campo': 'Assinatura Digital do Responsável', 'Informação': colab.assinatura_responsavel ? `${colab.assinatura_responsavel_nome || 'Almoxarifado'} em ${formatarDataHoraBR(colab.assinatura_responsavel_em)}` : 'Pendente / Assinar no PDF' },
        { 'Campo': 'Emitido Por', 'Informação': req.user ? req.user.nome : 'Almoxarifado' },
        { 'Campo': 'Data / Hora de Emissão', 'Informação': formatarDataHoraBR(new Date().toISOString()) }
      ];

      const cautelasRows = emprestimosAtivos.map(emp => ({
        'Data Retirada': formatarDataHoraBR(emp.criado_em),
        'SKU': emp.produto_sku || '',
        'Ferramenta / Equipamento': emp.produto_nome || '',
        'Categoria': emp.produto_categoria || '',
        'Marca': emp.produto_marca || '',
        'Quantidade': Number(emp.quantidade || 0),
        'Unidade': emp.produto_unidade || 'UN',
        'Atendente': emp.responsavel || 'Almoxarife',
        'Motivo / Obra': emp.motivo || '',
        'Documento Ref.': emp.documento_ref || ''
      }));

      const extratoRows = movimentacoes.map(m => ({
        'Data & Hora': formatarDataHoraBR(m.criado_em),
        'Operação': m.tipo || '',
        'SKU': m.produto_sku || '',
        'Produto / Material': m.produto_nome || '',
        'Categoria': m.produto_categoria || '',
        'Marca': m.produto_marca || '',
        'Quantidade': Number(m.quantidade || 0),
        'Unidade': m.produto_unidade || 'UN',
        'Atendente': m.responsavel || 'Almoxarife',
        'Motivo / Finalidade': m.motivo || 'Atendimento de rotina',
        'Doc / NF / OS': m.documento_ref || '',
        'Situação / Cautela': statusCautelaTexto(m)
      }));

      addSheet('Resumo da Ficha', resumoRows, [38, 52]);
      addSheet('Ferramentas em Posse', cautelasRows, [18, 16, 40, 20, 16, 12, 10, 22, 30, 16]);
      addSheet('Extrato da Ficha', extratoRows, [18, 14, 16, 40, 20, 16, 12, 10, 22, 34, 16, 22]);

      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const hoje = new Date().toISOString().split('T')[0];
      const nomeSlug = slugArquivo(colab.nome);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="ficha_${nomeSlug}_${hoje}.xlsx"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(buffer);
    } catch (error) {
      console.error('Erro ao exportar ficha para Excel:', error);
      res.redirect('/fichas?erro=' + encodeURIComponent('Erro ao exportar ficha para Excel: ' + error.message));
    }
  }

  /**
   * Salva ou limpa a assinatura digital na ficha do colaborador (AJAX JSON)
   */
  static async salvarAssinatura(req, res) {
    try {
      const colaboradorId = req.params.colaborador_id;
      const { papel, assinatura_base64, cpf_rg, responsavel_nome } = req.body || {};

      const nomeResp = responsavel_nome && String(responsavel_nome).trim()
        ? String(responsavel_nome).trim()
        : (req.user ? req.user.nome : 'Gestão de Almoxarifado');

      const resultado = await Colaborador.salvarAssinatura(colaboradorId, {
        papel,
        assinatura_base64,
        cpf_rg,
        responsavel_nome: nomeResp
      });

      return res.json({
        sucesso: true,
        salvoNoBanco: resultado.salvoNoBanco,
        aviso: resultado.aviso || null,
        dados: resultado.dados,
        dataFormatada: resultado.dados.assinatura_colaborador_em
          ? formatarDataHoraBR(resultado.dados.assinatura_colaborador_em)
          : (resultado.dados.assinatura_responsavel_em ? formatarDataHoraBR(resultado.dados.assinatura_responsavel_em) : null)
      });
    } catch (error) {
      console.error('Erro ao salvar assinatura digital da ficha:', error);
      return res.status(400).json({
        sucesso: false,
        erro: error.message || 'Falha ao salvar assinatura digital.'
      });
    }
  }
}

module.exports = FichaController;
