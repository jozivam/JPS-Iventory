const xlsx = require('xlsx');
const db = require('../../config/database');
const { supabase } = require('../../config/supabase');
const Produto = require('../models/Produto');
const Colaborador = require('../models/Colaborador');

const isVercel = !!process.env.VERCEL;
const isSupabaseDriver = process.env.DB_DRIVER === 'supabase';
const useSupabase = isVercel || isSupabaseDriver;

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Cuiaba';

const TIPOS_RELATORIO = {
  geral: {
    id: 'geral',
    titulo: 'Resumo Geral do Almoxarifado',
    subtitulo: 'Visão gerencial consolidada de estoque, movimentações, itens mais retirados e consumo por equipe.',
    icone: 'fa-chart-pie'
  },
  movimentacoes: {
    id: 'movimentacoes',
    titulo: 'Relatório de Movimentações por Período',
    subtitulo: 'Extrato analítico de entradas, saídas, empréstimos, devoluções e trocas com totalizadores exatos.',
    icone: 'fa-clock-rotate-left'
  },
  colaboradores: {
    id: 'colaboradores',
    titulo: 'Consumo e Retiradas por Colaborador / Setor',
    subtitulo: 'Consolidado de retiradas, trocas, cautelas e devoluções por colaborador ou departamento.',
    icone: 'fa-users'
  },
  emprestimos: {
    id: 'emprestimos',
    titulo: 'Cautelas e Empréstimos de Ferramentas',
    subtitulo: 'Controle de ferramentas em posse dos colaboradores, tempo de permanência e devoluções.',
    icone: 'fa-hand-holding-hand'
  },
  inventario: {
    id: 'inventario',
    titulo: 'Posição de Inventário & Giro de Estoque',
    subtitulo: 'Auditoria física de saldos, mínimos, localização, patrimônio, C.A. e volume movimentado no período.',
    icone: 'fa-boxes-stacked'
  },
  contagem: {
    id: 'contagem',
    titulo: 'Contagem Diária (Conferência de Estoque)',
    subtitulo: 'Lista focada apenas nos itens que tiveram saída/movimentação no dia anterior (ou período), ordenada por localização.',
    icone: 'fa-list-check'
  },
  duplicidades: {
    id: 'duplicidades',
    titulo: 'Ferramentas & Duplicidades (Desmobilização)',
    subtitulo: 'Identifica ferramentas e itens duplicados (mesmo equipamento em vários TAGs/SKUs ou saldo excedente > 1) para desmobilização.',
    icone: 'fa-clone'
  },
  reposicao: {
    id: 'reposicao',
    titulo: 'Alerta de Reposição / Necessidade de Compra',
    subtitulo: 'Itens zerados ou abaixo do estoque mínimo com cálculo de déficit e sugestão de reposição.',
    icone: 'fa-cart-shopping'
  }
};

const LABELS_TIPO_MOV = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  EMPRESTIMO: 'Empréstimo',
  DEVOLUCAO: 'Devolução',
  TROCA: 'Troca'
};

/**
 * Formata uma Date para YYYY-MM-DD no fuso horário configurado
 */
function formatDateLocalYMD(dateObj) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(dateObj);
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const d = parts.find(p => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch (_) {}
  return dateObj.toISOString().split('T')[0];
}

/**
 * Extrai YYYY-MM-DD local de uma string SQL ou ISO (UTC do Supabase -> hora local)
 */
function extrairDataLocalYMD(dateStr) {
  if (!dateStr) return '';
  const str = String(dateStr).trim();
  // Formato SQL local sem timezone (ex: "2026-11-22 08:30:00")
  if (!str.includes('T') && !str.includes('Z') && !str.includes('+') && str.length >= 10) {
    return str.substring(0, 10);
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return str.substring(0, 10);
  return formatDateLocalYMD(d);
}

/**
 * Formata timestamp para dd/mm/aaaa hh:mm no fuso local (para Excel e PDF)
 */
function formatarDataHoraBR(dateStr) {
  if (!dateStr) return '-';
  const str = String(dateStr).trim();
  if (!str.includes('T') && !str.includes('Z') && !str.includes('+') && str.length >= 16) {
    return `${str.substring(8, 10)}/${str.substring(5, 7)}/${str.substring(0, 4)} ${str.substring(11, 16)}`;
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  try {
    return d.toLocaleDateString('pt-BR', { timeZone: APP_TIMEZONE }) + ' ' +
      d.toLocaleTimeString('pt-BR', { timeZone: APP_TIMEZONE, hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
}

function formatarDataCurtaBR(ymd) {
  if (!ymd || ymd.length < 10) return '-';
  return `${ymd.substring(8, 10)}/${ymd.substring(5, 7)}/${ymd.substring(0, 4)}`;
}

function calcularDiasDecorridos(dateStr) {
  if (!dateStr) return 0;
  const d = new Date(String(dateStr).includes('T') ? dateStr : String(dateStr).replace(' ', 'T'));
  if (isNaN(d.getTime())) return 0;
  const diffMs = Date.now() - d.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Normaliza o nome base de um produto/ferramenta removendo códigos de TAG/Patrimônio
 * para detectar cadastros duplicados (ex: "Lixadeira 7\" PTM-1550" e "Lixadeira 7\" PTM-1551")
 */
function normalizarNomeBase(nome) {
  if (!nome) return '';
  return String(nome)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\b[A-Z]{2,5}[-/]\d{2,6}\b/g, ' ')
    .replace(/\b[A-Z]{2,5}\d{3,6}\b/g, ' ')
    .replace(/\b(N[Oº°]?|NUM|TAG|PAT|PATRIMONIO|SERIE|SN)\s*[-:#.]?\s*\d+\b/g, ' ')
    .replace(/[^A-Z0-9"'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Carrega TODAS as movimentações sem truncar no limite padrão de 200 ou 1000 do Supabase
 */
async function buscarTodasMovimentacoesCompletas() {
  if (useSupabase && supabase) {
    const todas = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('movimentacoes')
        .select('*, produtos(id, nome, sku, categoria, marca, unidade_medida, tag, patrimonio, ca, localizacao)')
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) {
        console.error('Erro ao paginar movimentações para relatório no Supabase:', error);
        break;
      }

      if (!data || data.length === 0) break;

      for (const m of data) {
        todas.push({
          ...m,
          produto_nome: m.produtos ? m.produtos.nome : 'Item',
          produto_sku: m.produtos ? m.produtos.sku : '',
          produto_categoria: m.produtos ? (m.produtos.categoria || 'Outros') : 'Outros',
          produto_marca: m.produtos ? (m.produtos.marca || '') : '',
          produto_unidade: m.produtos ? (m.produtos.unidade_medida || 'UN') : 'UN',
          produto_tag: m.produtos ? (m.produtos.tag || '') : '',
          produto_patrimonio: m.produtos ? (m.produtos.patrimonio || '') : '',
          produto_ca: m.produtos ? (m.produtos.ca || '') : '',
          produto_localizacao: m.produtos ? (m.produtos.localizacao || '') : ''
        });
      }

      if (data.length < pageSize) break;
      from += pageSize;
      if (from >= 20000) break; // trava de segurança
    }

    return todas;
  }

  if (!db) return [];

  return db.prepare(`
    SELECT
      m.*,
      p.nome AS produto_nome,
      p.sku AS produto_sku,
      COALESCE(p.categoria, 'Outros') AS produto_categoria,
      COALESCE(p.marca, '') AS produto_marca,
      COALESCE(p.unidade_medida, 'UN') AS produto_unidade,
      COALESCE(p.tag, '') AS produto_tag,
      COALESCE(p.patrimonio, '') AS produto_patrimonio,
      COALESCE(p.ca, '') AS produto_ca,
      COALESCE(p.localizacao, '') AS produto_localizacao
    FROM movimentacoes m
    LEFT JOIN produtos p ON m.produto_id = p.id
    ORDER BY m.id DESC
  `).all();
}

/**
 * Resolve intervalo de datas baseado nos atalhos de período ou datas manuais
 */
function resolverPeriodo(query, tipoRelatorio = 'geral') {
  const hoje = new Date();
  const hojeYMD = formatDateLocalYMD(hoje);

  let periodo = (query.periodo || '').trim();
  let dataInicio = (query.data_inicio || '').trim();
  let dataFim = (query.data_fim || '').trim();

  // Padrão inteligente: Contagem Diária abre por padrão em "Ontem" (dia anterior); demais em 7 dias
  if (!periodo && !dataInicio && !dataFim) {
    periodo = tipoRelatorio === 'contagem' ? 'ontem' : '7dias';
  }

  const subtrairDias = (dias) => {
    const d = new Date(hoje.getTime() - dias * 24 * 60 * 60 * 1000);
    return formatDateLocalYMD(d);
  };

  if (periodo === 'hoje') {
    dataInicio = hojeYMD;
    dataFim = hojeYMD;
  } else if (periodo === 'ontem') {
    const ontemYMD = subtrairDias(1);
    dataInicio = ontemYMD;
    dataFim = ontemYMD;
  } else if (periodo === '7dias') {
    dataInicio = subtrairDias(6);
    dataFim = hojeYMD;
  } else if (periodo === '15dias') {
    dataInicio = subtrairDias(14);
    dataFim = hojeYMD;
  } else if (periodo === '30dias') {
    dataInicio = subtrairDias(29);
    dataFim = hojeYMD;
  } else if (periodo === 'mes') {
    dataInicio = `${hojeYMD.substring(0, 7)}-01`;
    dataFim = hojeYMD;
  } else if (periodo === 'todos') {
    dataInicio = '';
    dataFim = '';
  }

  let periodoDescricao = 'Todo o período registrado';
  if (dataInicio && dataFim) {
    periodoDescricao = dataInicio === dataFim
      ? formatarDataCurtaBR(dataInicio)
      : `${formatarDataCurtaBR(dataInicio)} até ${formatarDataCurtaBR(dataFim)}`;
  } else if (dataInicio) {
    periodoDescricao = `A partir de ${formatarDataCurtaBR(dataInicio)}`;
  } else if (dataFim) {
    periodoDescricao = `Até ${formatarDataCurtaBR(dataFim)}`;
  }

  return { periodo, dataInicio, dataFim, periodoDescricao, hojeYMD };
}

/**
 * Motor central de consolidação de dados para todos os relatórios (tela, PDF e Excel)
 */
async function montarDadosRelatorio(query = {}, usuario = null) {
  const tipoRelatorio = TIPOS_RELATORIO[query.tipo_relatorio] ? query.tipo_relatorio : 'geral';
  const metaRelatorio = TIPOS_RELATORIO[tipoRelatorio];

  const { periodo, dataInicio, dataFim, periodoDescricao, hojeYMD } = resolverPeriodo(query, tipoRelatorio);

  const filtros = {
    tipo_relatorio: tipoRelatorio,
    periodo,
    data_inicio: dataInicio,
    data_fim: dataFim,
    categoria: (query.categoria || '').trim(),
    tipo_mov: (query.tipo_mov || '').trim(),
    colaborador_id: (query.colaborador_id || '').trim(),
    produto_id: (query.produto_id || '').trim(),
    departamento: (query.departamento || '').trim(),
    status_estoque: (query.status_estoque || '').trim(),
    condicao: (query.condicao || '').trim(),
    status_emprestimo: (query.status_emprestimo || (tipoRelatorio === 'emprestimos' ? 'PENDENTE' : '')).trim(),
    somente_com_estoque: (query.somente_com_estoque || (tipoRelatorio === 'duplicidades' ? '1' : '')).trim(),
    modo_contagem: (query.modo_contagem || 'saidas').trim(),
    modo_duplicidade: (query.modo_duplicidade || 'duplicados').trim(),
    busca: (query.busca || '').trim()
  };

  // Carrega bases completas em paralelo para máxima precisão
  const [todosProdutos, todosColaboradoresRaw, todasMovimentacoes] = await Promise.all([
    Produto.findAll(),
    Colaborador.findAll(),
    buscarTodasMovimentacoesCompletas()
  ]);

  const todosColaboradores = (todosColaboradoresRaw || []).map(({ senha_hash, ...c }) => c);

  // Mapas auxiliares para resolução rápida e precisa
  const colabById = new Map();
  const colabByNomeLower = new Map();
  todosColaboradores.forEach(c => {
    colabById.set(String(c.id), c);
    if (c.nome) colabByNomeLower.set(c.nome.trim().toLowerCase(), c);
  });

  const prodById = new Map();
  todosProdutos.forEach(p => prodById.set(String(p.id), p));

  // Listas de opções para os selects de filtro
  const categorias = [...new Set(todosProdutos.map(p => p.categoria || 'Outros'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const departamentos = [...new Set(todosColaboradores.map(c => (c.departamento || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const condicoes = [...new Set(todosProdutos.map(p => (p.condicao || 'NOVO').toUpperCase()))].sort();

  // Enriquece cada movimentação com data local e metadados do colaborador
  const movsEnriquecidas = todasMovimentacoes.map(m => {
    const colabObj = (m.colaborador_id && colabById.get(String(m.colaborador_id)))
      || (m.colaborador && colabByNomeLower.get(String(m.colaborador).trim().toLowerCase()))
      || null;
    const dataYMD = extrairDataLocalYMD(m.criado_em);
    return {
      ...m,
      data_ymd: dataYMD,
      data_br: formatarDataHoraBR(m.criado_em),
      tipo_label: LABELS_TIPO_MOV[m.tipo] || m.tipo,
      colaborador_resolvido_id: colabObj ? colabObj.id : (m.colaborador_id || null),
      colaborador_nome_exibicao: colabObj ? colabObj.nome : (m.colaborador || 'Balcão'),
      colaborador_matricula: colabObj ? (colabObj.matricula || '') : '',
      colaborador_cargo: colabObj ? (colabObj.cargo || '') : '',
      colaborador_departamento: colabObj ? (colabObj.departamento || 'Geral') : 'Geral',
      dias_decorridos: calcularDiasDecorridos(m.criado_em)
    };
  });

  // Filtra movimentações pelo período + filtros dimensionais
  const movsFiltradas = movsEnriquecidas.filter(m => {
    // Em "emprestimos" com status PENDENTE e período padrão, se usuário não restringiu explicitamente a datas ou escolheu "todos", ainda respeita data se preenchida
    if (filtros.data_inicio && m.data_ymd && m.data_ymd < filtros.data_inicio) return false;
    if (filtros.data_fim && m.data_ymd && m.data_ymd > filtros.data_fim) return false;
    if (filtros.tipo_mov && m.tipo !== filtros.tipo_mov) return false;
    if (filtros.categoria && (m.produto_categoria || 'Outros') !== filtros.categoria) return false;
    if (filtros.produto_id && String(m.produto_id) !== String(filtros.produto_id)) return false;
    if (filtros.colaborador_id) {
      const alvo = colabById.get(String(filtros.colaborador_id));
      const bateId = m.colaborador_resolvido_id && String(m.colaborador_resolvido_id) === String(filtros.colaborador_id);
      const bateNome = alvo && m.colaborador && m.colaborador.trim().toLowerCase() === alvo.nome.trim().toLowerCase();
      if (!bateId && !bateNome) return false;
    }
    if (filtros.departamento && m.colaborador_departamento !== filtros.departamento) return false;
    if (filtros.busca) {
      const q = filtros.busca.toLowerCase();
      const texto = [
        `MOV-${String(m.id).padStart(4, '0')}`,
        m.produto_nome, m.produto_sku, m.produto_categoria,
        m.colaborador_nome_exibicao, m.responsavel, m.documento_ref, m.motivo
      ].join(' ').toLowerCase();
      if (!texto.includes(q)) return false;
    }
    return true;
  });

  // Totais das movimentações filtradas
  const totaisMov = {
    totalRegistros: movsFiltradas.length,
    entradasQtd: 0,
    entradasCount: 0,
    saidasQtd: 0,
    saidasCount: 0,
    emprestimosQtd: 0,
    emprestimosCount: 0,
    devolucoesQtd: 0,
    devolucoesCount: 0,
    trocasQtd: 0,
    trocasCount: 0
  };

  for (const m of movsFiltradas) {
    const q = Number(m.quantidade || 0);
    if (m.tipo === 'ENTRADA') { totaisMov.entradasQtd += q; totaisMov.entradasCount++; }
    else if (m.tipo === 'SAIDA') { totaisMov.saidasQtd += q; totaisMov.saidasCount++; }
    else if (m.tipo === 'EMPRESTIMO') { totaisMov.emprestimosQtd += q; totaisMov.emprestimosCount++; }
    else if (m.tipo === 'DEVOLUCAO') { totaisMov.devolucoesQtd += q; totaisMov.devolucoesCount++; }
    else if (m.tipo === 'TROCA') { totaisMov.trocasQtd += q; totaisMov.trocasCount++; }
  }

  // Mapa de consumo (saída + troca + empréstimo) por produto no período filtrado
  const giroPorProduto = new Map();
  for (const m of movsFiltradas) {
    const pid = String(m.produto_id);
    if (!giroPorProduto.has(pid)) {
      giroPorProduto.set(pid, {
        produto_id: m.produto_id,
        sku: m.produto_sku,
        nome: m.produto_nome,
        categoria: m.produto_categoria,
        unidade: m.produto_unidade,
        entradas: 0,
        saidas: 0,
        emprestimos: 0,
        devolucoes: 0,
        trocas: 0,
        totalConsumo: 0,
        lancamentos: 0
      });
    }
    const acc = giroPorProduto.get(pid);
    const q = Number(m.quantidade || 0);
    acc.lancamentos++;
    if (m.tipo === 'ENTRADA') acc.entradas += q;
    else if (m.tipo === 'SAIDA') { acc.saidas += q; acc.totalConsumo += q; }
    else if (m.tipo === 'TROCA') { acc.trocas += q; acc.totalConsumo += q; }
    else if (m.tipo === 'EMPRESTIMO') acc.emprestimos += q;
    else if (m.tipo === 'DEVOLUCAO') acc.devolucoes += q;
  }

  // Consumo dos últimos 30 dias (referência inteligente para o relatório de Reposição)
  const trintaDiasAtrasYMD = formatDateLocalYMD(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
  const consumo30dPorProduto = new Map();
  for (const m of movsEnriquecidas) {
    if (m.data_ymd >= trintaDiasAtrasYMD && (m.tipo === 'SAIDA' || m.tipo === 'TROCA')) {
      const pid = String(m.produto_id);
      consumo30dPorProduto.set(pid, (consumo30dPorProduto.get(pid) || 0) + Number(m.quantidade || 0));
    }
  }

  // Filtra produtos para os relatórios de Inventário, Duplicidades e Reposição
  const produtosFiltrados = todosProdutos
    .filter(p => {
      if (filtros.categoria && (p.categoria || 'Outros') !== filtros.categoria) return false;
      if (filtros.status_estoque && p.status_estoque !== filtros.status_estoque) return false;
      if (filtros.somente_com_estoque === '1' && Number(p.quantidade || 0) <= 0) return false;
      if (filtros.condicao && (p.condicao || 'NOVO').toUpperCase() !== filtros.condicao.toUpperCase()) return false;
      if (filtros.produto_id && String(p.id) !== String(filtros.produto_id)) return false;
      if (filtros.busca) {
        const q = filtros.busca.toLowerCase();
        const texto = [p.sku, p.nome, p.categoria, p.marca, p.localizacao, p.tag, p.patrimonio, p.ca].join(' ').toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return true;
    })
    .map(p => {
      const giro = giroPorProduto.get(String(p.id));
      const consumo30d = consumo30dPorProduto.get(String(p.id)) || 0;
      const qtdAtual = Number(p.quantidade || 0);
      const estMin = Number(p.estoque_minimo || 0);
      const deficitMinimo = Math.max(0, estMin - qtdAtual);
      const sugestaoCompra = qtdAtual === 0
        ? Math.max(estMin, consumo30d, 1)
        : Math.max(deficitMinimo, consumo30d > qtdAtual ? (consumo30d - qtdAtual) : 0);

      return {
        ...p,
        entradas_periodo: giro ? giro.entradas : 0,
        saidas_periodo: giro ? (giro.saidas + giro.trocas) : 0,
        emprestimos_periodo: giro ? giro.emprestimos : 0,
        consumo_30d: consumo30d,
        deficit_minimo: deficitMinimo,
        sugestao_compra: sugestaoCompra
      };
    });

  // Itens críticos / reposição (zerados ou <= estoque mínimo)
  const itensReposicao = produtosFiltrados
    .filter(p => p.status_estoque === 'CRITICO' || p.status_estoque === 'BAIXO')
    .sort((a, b) => {
      if (a.quantidade === 0 && b.quantidade > 0) return -1;
      if (b.quantidade === 0 && a.quantidade > 0) return 1;
      return b.sugestao_compra - a.sugestao_compra;
    });

  // Empréstimos / Cautelas (filtra sobre todas as movimentações do tipo EMPRESTIMO, respeitando status e dimensões)
  const emprestimosLista = movsEnriquecidas.filter(m => {
    if (m.tipo !== 'EMPRESTIMO') return false;
    if (filtros.status_emprestimo && filtros.status_emprestimo !== 'TODOS') {
      const statusAtual = m.status_emprestimo || (m.data_devolucao ? 'DEVOLVIDO' : 'PENDENTE');
      if (statusAtual !== filtros.status_emprestimo) return false;
    }
    if (filtros.data_inicio && tipoRelatorio === 'emprestimos' && filtros.periodo !== 'todos' && filtros.status_emprestimo !== 'PENDENTE') {
      if (m.data_ymd && m.data_ymd < filtros.data_inicio) return false;
    }
    if (filtros.data_fim && tipoRelatorio === 'emprestimos' && filtros.periodo !== 'todos' && filtros.status_emprestimo !== 'PENDENTE') {
      if (m.data_ymd && m.data_ymd > filtros.data_fim) return false;
    }
    if (filtros.categoria && (m.produto_categoria || 'Outros') !== filtros.categoria) return false;
    if (filtros.produto_id && String(m.produto_id) !== String(filtros.produto_id)) return false;
    if (filtros.colaborador_id) {
      const alvo = colabById.get(String(filtros.colaborador_id));
      const bateId = m.colaborador_resolvido_id && String(m.colaborador_resolvido_id) === String(filtros.colaborador_id);
      const bateNome = alvo && m.colaborador && m.colaborador.trim().toLowerCase() === alvo.nome.trim().toLowerCase();
      if (!bateId && !bateNome) return false;
    }
    if (filtros.departamento && m.colaborador_departamento !== filtros.departamento) return false;
    if (filtros.busca) {
      const q = filtros.busca.toLowerCase();
      const texto = [m.produto_nome, m.produto_sku, m.produto_tag, m.produto_patrimonio, m.colaborador_nome_exibicao, m.responsavel, m.documento_ref].join(' ').toLowerCase();
      if (!texto.includes(q)) return false;
    }
    return true;
  });

  // Todos os empréstimos pendentes globais (para o indicador de pendências reais de cada colaborador e produto)
  const pendenciasPorColabKey = new Map();
  const pendenciasPorProdutoId = new Map();
  let totalEmprestimosPendentesGlobalQtd = 0;
  let totalEmprestimosPendentesGlobalCount = 0;
  for (const m of movsEnriquecidas) {
    if (m.tipo === 'EMPRESTIMO' && (m.status_emprestimo === 'PENDENTE' || (!m.status_emprestimo && !m.data_devolucao))) {
      const q = Number(m.quantidade || 0);
      totalEmprestimosPendentesGlobalQtd += q;
      totalEmprestimosPendentesGlobalCount++;
      const key = m.colaborador_resolvido_id ? `id:${m.colaborador_resolvido_id}` : `nome:${m.colaborador_nome_exibicao.toLowerCase()}`;
      pendenciasPorColabKey.set(key, (pendenciasPorColabKey.get(key) || 0) + q);
      const pid = String(m.produto_id);
      pendenciasPorProdutoId.set(pid, (pendenciasPorProdutoId.get(pid) || 0) + q);
    }
  }

  // =========================================================================
  // RELATÓRIO DE CONTAGEM DIÁRIA (ITENS QUE SAÍRAM/MOVIMENTARAM NO DIA/PERÍODO)
  // =========================================================================
  const contagemMap = new Map();
  for (const m of movsFiltradas) {
    const isSaidaOuRetirada = m.tipo === 'SAIDA' || m.tipo === 'EMPRESTIMO' || m.tipo === 'TROCA';
    if (filtros.modo_contagem === 'saidas' && !isSaidaOuRetirada) continue;

    const pid = String(m.produto_id);
    const prodAtual = prodById.get(pid);
    if (!contagemMap.has(pid)) {
      contagemMap.set(pid, {
        produto_id: m.produto_id,
        sku: prodAtual ? prodAtual.sku : m.produto_sku,
        nome: prodAtual ? prodAtual.nome : m.produto_nome,
        categoria: prodAtual ? (prodAtual.categoria || 'Outros') : m.produto_categoria,
        marca: prodAtual ? (prodAtual.marca || '') : m.produto_marca,
        unidade_medida: prodAtual ? (prodAtual.unidade_medida || 'UN') : m.produto_unidade,
        localizacao: prodAtual ? (prodAtual.localizacao || 'Sem localização') : (m.produto_localizacao || 'Sem localização'),
        tag: prodAtual ? (prodAtual.tag || '') : m.produto_tag,
        patrimonio: prodAtual ? (prodAtual.patrimonio || '') : m.produto_patrimonio,
        saldo_atual: prodAtual ? Number(prodAtual.quantidade || 0) : 0,
        estoque_minimo: prodAtual ? Number(prodAtual.estoque_minimo || 0) : 0,
        status_estoque: prodAtual ? prodAtual.status_estoque : 'NORMAL',
        saidas_dia: 0,
        emprestimos_dia: 0,
        trocas_dia: 0,
        entradas_dia: 0,
        devolucoes_dia: 0,
        total_saidas_dia: 0,
        total_lancamentos_dia: 0,
        ultimo_colaborador: m.colaborador_nome_exibicao || ''
      });
    }
    const item = contagemMap.get(pid);
    const q = Number(m.quantidade || 0);
    item.total_lancamentos_dia++;
    if (m.tipo === 'SAIDA') { item.saidas_dia += q; item.total_saidas_dia += q; }
    else if (m.tipo === 'EMPRESTIMO') { item.emprestimos_dia += q; item.total_saidas_dia += q; }
    else if (m.tipo === 'TROCA') { item.trocas_dia += q; item.total_saidas_dia += q; }
    else if (m.tipo === 'ENTRADA') item.entradas_dia += q;
    else if (m.tipo === 'DEVOLUCAO') item.devolucoes_dia += q;
  }

  // Ordena por Localização (para facilitar a conferência física prateleira por prateleira) e depois Nome
  const itensContagemDiaria = [...contagemMap.values()].sort((a, b) => {
    const locA = (a.localizacao || 'ZZZ').toLowerCase();
    const locB = (b.localizacao || 'ZZZ').toLowerCase();
    if (locA !== locB) return locA.localeCompare(locB, 'pt-BR');
    return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
  });

  // =========================================================================
  // RELATÓRIO DE FERRAMENTAS & DUPLICIDADES PARA DESMOBILIZAÇÃO
  // =========================================================================
  const gruposDupMap = new Map();
  for (const p of produtosFiltrados) {
    const base = normalizarNomeBase(p.nome) || (p.sku || `ITEM-${p.id}`);
    if (!gruposDupMap.has(base)) {
      gruposDupMap.set(base, {
        nome_base: base,
        categoria: p.categoria || 'Outros',
        unidade_medida: p.unidade_medida || 'UN',
        registros: [],
        totalRegistros: 0,
        totalUnidadesEstoque: 0,
        totalEmprestado: 0
      });
    }
    const g = gruposDupMap.get(base);
    const empAtivo = pendenciasPorProdutoId.get(String(p.id)) || 0;
    g.registros.push({
      ...p,
      nome_base: base,
      emprestado_atual: empAtivo
    });
    g.totalRegistros++;
    g.totalUnidadesEstoque += Number(p.quantidade || 0);
    g.totalEmprestado += empAtivo;
  }

  const todosGruposDuplicidades = [...gruposDupMap.values()].map(g => {
    const temCadastroDuplicado = g.totalRegistros > 1;
    const temSaldoExcedente = g.totalUnidadesEstoque > 1;
    const isDuplicadoOuExcedente = temCadastroDuplicado || temSaldoExcedente;
    const potencialDesmobilizar = Math.max(0, g.totalUnidadesEstoque - 1);
    const tipoDuplicidade = temCadastroDuplicado && temSaldoExcedente
      ? 'Múltiplos TAGs/Cadastros + Saldo > 1'
      : temCadastroDuplicado
        ? 'Cadastros Duplicados (TAGs/SKUs)'
        : temSaldoExcedente
          ? 'Saldo Excedente (> 1 un.)'
          : 'Unidade Única';

    return {
      ...g,
      temCadastroDuplicado,
      temSaldoExcedente,
      isDuplicadoOuExcedente,
      potencialDesmobilizar,
      tipoDuplicidade
    };
  });

  const gruposDuplicidades = todosGruposDuplicidades
    .filter(g => filtros.modo_duplicidade === 'todos' ? true : g.isDuplicadoOuExcedente)
    .sort((a, b) => {
      if (a.temCadastroDuplicado !== b.temCadastroDuplicado) return a.temCadastroDuplicado ? -1 : 1;
      if (b.potencialDesmobilizar !== a.potencialDesmobilizar) return b.potencialDesmobilizar - a.potencialDesmobilizar;
      return a.nome_base.localeCompare(b.nome_base, 'pt-BR');
    });

  const itensDuplicidadesDetalhe = [];
  for (const g of gruposDuplicidades) {
    for (const r of g.registros) {
      itensDuplicidadesDetalhe.push({
        ...r,
        grupo_nome_base: g.nome_base,
        grupo_total_registros: g.totalRegistros,
        grupo_total_unidades: g.totalUnidadesEstoque,
        grupo_potencial_desmobilizar: g.potencialDesmobilizar,
        grupo_tipo_duplicidade: g.tipoDuplicidade
      });
    }
  }

  const kpisDuplicidades = {
    totalGrupos: gruposDuplicidades.length,
    totalCadastrosEnvolvidos: itensDuplicidadesDetalhe.length,
    totalUnidadesEstoque: gruposDuplicidades.reduce((acc, g) => acc + g.totalUnidadesEstoque, 0),
    potencialDesmobilizar: gruposDuplicidades.reduce((acc, g) => acc + g.potencialDesmobilizar, 0),
    gruposMultiCadastro: gruposDuplicidades.filter(g => g.temCadastroDuplicado).length
  };

  // Resumo por Colaborador no período filtrado
  const resumoColabMap = new Map();
  for (const m of movsFiltradas) {
    // Ignora entradas de estoque sem colaborador ou "Balcão" apenas no ranking se desejar, mas mantém transparência
    const key = m.colaborador_resolvido_id ? `id:${m.colaborador_resolvido_id}` : `nome:${m.colaborador_nome_exibicao.toLowerCase()}`;
    if (!resumoColabMap.has(key)) {
      resumoColabMap.set(key, {
        id: m.colaborador_resolvido_id,
        nome: m.colaborador_nome_exibicao,
        matricula: m.colaborador_matricula || '-',
        cargo: m.colaborador_cargo || '-',
        departamento: m.colaborador_departamento || 'Geral',
        saidasQtd: 0,
        trocasQtd: 0,
        emprestimosQtd: 0,
        devolucoesQtd: 0,
        entradasQtd: 0,
        totalRetirado: 0,
        totalLancamentos: 0,
        cautelasAbertas: pendenciasPorColabKey.get(key) || 0
      });
    }
    const row = resumoColabMap.get(key);
    const q = Number(m.quantidade || 0);
    row.totalLancamentos++;
    if (m.tipo === 'SAIDA') { row.saidasQtd += q; row.totalRetirado += q; }
    else if (m.tipo === 'TROCA') { row.trocasQtd += q; row.totalRetirado += q; }
    else if (m.tipo === 'EMPRESTIMO') { row.emprestimosQtd += q; row.totalRetirado += q; }
    else if (m.tipo === 'DEVOLUCAO') { row.devolucoesQtd += q; }
    else if (m.tipo === 'ENTRADA') { row.entradasQtd += q; }
  }

  const resumoColaboradores = [...resumoColabMap.values()].sort((a, b) => b.totalRetirado - a.totalRetirado || b.totalLancamentos - a.totalLancamentos);

  // Top 10 produtos mais movimentados/consumidos no período
  const topProdutosConsumo = [...giroPorProduto.values()]
    .filter(g => g.totalConsumo > 0 || g.emprestimos > 0)
    .sort((a, b) => (b.totalConsumo + b.emprestimos) - (a.totalConsumo + a.emprestimos))
    .slice(0, 15);

  // Resumo por Categoria de Estoque
  const catMap = new Map();
  for (const p of produtosFiltrados) {
    const cat = p.categoria || 'Outros';
    if (!catMap.has(cat)) {
      catMap.set(cat, { categoria: cat, totalItens: 0, totalUnidades: 0, zerados: 0, baixo: 0, saidasPeriodo: 0 });
    }
    const c = catMap.get(cat);
    c.totalItens++;
    c.totalUnidades += Number(p.quantidade || 0);
    if (p.status_estoque === 'CRITICO') c.zerados++;
    else if (p.status_estoque === 'BAIXO') c.baixo++;
    c.saidasPeriodo += Number(p.saidas_periodo || 0);
  }
  const resumoCategorias = [...catMap.values()].sort((a, b) => b.totalUnidades - a.totalUnidades);

  // Indicadores Gerais do Inventário (sobre produtos filtrados)
  const kpisInventario = {
    totalProdutos: produtosFiltrados.length,
    totalUnidades: produtosFiltrados.reduce((acc, p) => acc + Number(p.quantidade || 0), 0),
    normal: produtosFiltrados.filter(p => p.status_estoque === 'NORMAL').length,
    baixo: produtosFiltrados.filter(p => p.status_estoque === 'BAIXO').length,
    zerado: produtosFiltrados.filter(p => p.status_estoque === 'CRITICO').length
  };

  // Resumo textual dos filtros ativos (para cabeçalho do PDF e da aba Resumo no Excel)
  const filtrosAtivosTexto = [];
  if (!['inventario', 'reposicao', 'duplicidades'].includes(tipoRelatorio)) {
    filtrosAtivosTexto.push(`Período: ${periodoDescricao}`);
  }
  if (filtros.categoria) filtrosAtivosTexto.push(`Categoria: ${filtros.categoria}`);
  if (filtros.tipo_mov) filtrosAtivosTexto.push(`Operação: ${LABELS_TIPO_MOV[filtros.tipo_mov] || filtros.tipo_mov}`);
  if (filtros.colaborador_id && colabById.get(filtros.colaborador_id)) {
    filtrosAtivosTexto.push(`Colaborador: ${colabById.get(filtros.colaborador_id).nome}`);
  }
  if (filtros.departamento) filtrosAtivosTexto.push(`Setor: ${filtros.departamento}`);
  if (filtros.produto_id && prodById.get(filtros.produto_id)) {
    filtrosAtivosTexto.push(`Produto: ${prodById.get(filtros.produto_id).nome}`);
  }
  if (filtros.status_estoque) filtrosAtivosTexto.push(`Status Estoque: ${filtros.status_estoque}`);
  if (filtros.somente_com_estoque === '1') filtrosAtivosTexto.push('Apenas com estoque (> 0)');
  if (filtros.condicao) filtrosAtivosTexto.push(`Condição: ${filtros.condicao}`);
  if (tipoRelatorio === 'contagem') {
    filtrosAtivosTexto.push(filtros.modo_contagem === 'todas' ? 'Escopo: Todas movimentações' : 'Escopo: Apenas Saídas / Empréstimos / Trocas');
  }
  if (tipoRelatorio === 'duplicidades') {
    filtrosAtivosTexto.push(filtros.modo_duplicidade === 'todos' ? 'Exibição: Todos os itens' : 'Exibição: Apenas Duplicados / Excedentes (> 1)');
  }
  if (tipoRelatorio === 'emprestimos' && filtros.status_emprestimo) {
    filtrosAtivosTexto.push(`Status Cautela: ${filtros.status_emprestimo}`);
  }
  if (filtros.busca) filtrosAtivosTexto.push(`Busca: "${filtros.busca}"`);

  // Query string limpa preservando todos os filtros para links de PDF e Excel
  const qsParams = new URLSearchParams();
  Object.entries(filtros).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      qsParams.set(k, String(v).trim());
    }
  });

  return {
    tipoRelatorio,
    metaRelatorio,
    tiposDisponiveis: Object.values(TIPOS_RELATORIO),
    filtros,
    queryStringFiltros: qsParams.toString(),
    periodoDescricao,
    filtrosAtivosTexto: filtrosAtivosTexto.length > 0 ? filtrosAtivosTexto.join('  •  ') : 'Sem filtros adicionais',
    geradoEm: formatarDataHoraBR(new Date().toISOString()),
    hojeYMD,
    emitidoPor: usuario ? `${usuario.nome}${usuario.cargo ? ' (' + usuario.cargo + ')' : ''}` : 'Sistema',
    opcoesFiltro: {
      categorias,
      departamentos,
      condicoes,
      colaboradores: todosColaboradores,
      produtos: todosProdutos
    },
    kpisInventario,
    totaisMov,
    totalEmprestimosPendentesGlobalQtd,
    totalEmprestimosPendentesGlobalCount,
    movimentacoes: movsFiltradas,
    produtos: produtosFiltrados,
    itensReposicao,
    itensContagemDiaria,
    gruposDuplicidades,
    itensDuplicidadesDetalhe,
    kpisDuplicidades,
    emprestimos: emprestimosLista,
    resumoColaboradores,
    topProdutosConsumo,
    resumoCategorias
  };
}

class RelatorioController {
  /**
   * Central de Relatórios (Tela interativa com filtros, prévia precisa e botões PDF / Excel)
   */
  static async index(req, res) {
    try {
      const dados = await montarDadosRelatorio(req.query, req.user);
      res.render('relatorios/index', {
        title: `Relatórios — ${dados.metaRelatorio.titulo}`,
        currentPage: 'relatorios',
        ...dados
      });
    } catch (error) {
      console.error('Erro ao carregar Central de Relatórios:', error);
      res.status(500).render('layouts/erro', {
        title: 'Erro nos Relatórios',
        currentPage: 'relatorios',
        mensagem: 'Não foi possível gerar os dados do relatório.',
        detalhes: error.message
      });
    }
  }

  /**
   * Visão de Impressão / Exportação em PDF (Layout corporativo A4 limpo)
   */
  static async pdf(req, res) {
    try {
      const dados = await montarDadosRelatorio(req.query, req.user);
      res.render('relatorios/pdf', {
        title: `${dados.metaRelatorio.titulo} — JPS Almoxarifado`,
        autoPrint: req.query.auto_print === '1',
        ...dados
      });
    } catch (error) {
      console.error('Erro ao gerar relatório PDF:', error);
      res.status(500).render('layouts/erro', {
        title: 'Erro ao Gerar PDF',
        currentPage: 'relatorios',
        mensagem: 'Não foi possível preparar o documento PDF.',
        detalhes: error.message
      });
    }
  }

  /**
   * Exportação Oficial para Excel (.xlsx) com múltiplas abas e colunas dimensionadas
   */
  static async exportarExcel(req, res) {
    try {
      const dados = await montarDadosRelatorio(req.query, req.user);
      const wb = xlsx.utils.book_new();

      const addSheet = (nomeAba, rows, colWidths = []) => {
        const safeRows = rows && rows.length > 0 ? rows : [{ 'Aviso': 'Nenhum registro encontrado para os filtros selecionados.' }];
        const ws = xlsx.utils.json_to_sheet(safeRows);
        if (colWidths.length > 0) {
          ws['!cols'] = colWidths.map(wch => ({ wch }));
        }
        xlsx.utils.book_append_sheet(wb, ws, nomeAba.substring(0, 31));
      };

      // Aba 1 de Metadados / Capa Resumida em todos os relatórios
      const capaRows = [
        { 'Indicador': 'Sistema', 'Valor': 'JPS Almoxarifado' },
        { 'Indicador': 'Relatório', 'Valor': dados.metaRelatorio.titulo },
        { 'Indicador': 'Período', 'Valor': dados.periodoDescricao },
        { 'Indicador': 'Filtros Aplicados', 'Valor': dados.filtrosAtivosTexto },
        { 'Indicador': 'Emitido Por', 'Valor': dados.emitidoPor },
        { 'Indicador': 'Data / Hora de Emissão', 'Valor': dados.geradoEm },
        { 'Indicador': '---', 'Valor': '---' },
        { 'Indicador': 'Produtos no Inventário (filtrados)', 'Valor': dados.kpisInventario.totalProdutos },
        { 'Indicador': 'Unidades Físicas em Estoque', 'Valor': dados.kpisInventario.totalUnidades },
        { 'Indicador': 'Itens Zerados', 'Valor': dados.kpisInventario.zerado },
        { 'Indicador': 'Itens com Estoque Baixo', 'Valor': dados.kpisInventario.baixo },
        { 'Indicador': 'Movimentações no Período', 'Valor': dados.totaisMov.totalRegistros },
        { 'Indicador': 'Total Entradas (un)', 'Valor': dados.totaisMov.entradasQtd },
        { 'Indicador': 'Total Saídas (un)', 'Valor': dados.totaisMov.saidasQtd },
        { 'Indicador': 'Total Empréstimos no Período (un)', 'Valor': dados.totaisMov.emprestimosQtd },
        { 'Indicador': 'Total Devoluções no Período (un)', 'Valor': dados.totaisMov.devolucoesQtd },
        { 'Indicador': 'Total Trocas no Período (un)', 'Valor': dados.totaisMov.trocasQtd },
        { 'Indicador': 'Ferramentas em Cautela Aberta (atual)', 'Valor': dados.totalEmprestimosPendentesGlobalQtd }
      ];

      const mapMovRows = (lista) => lista.map(m => ({
        'Código': `MOV-${String(m.id).padStart(4, '0')}`,
        'Data & Hora': m.data_br,
        'Tipo': m.tipo_label,
        'SKU': m.produto_sku || '',
        'Produto / Material': m.produto_nome || '',
        'Categoria': m.produto_categoria || '',
        'Quantidade': (m.tipo === 'SAIDA' || m.tipo === 'EMPRESTIMO' || m.tipo === 'TROCA') ? -Number(m.quantidade) : Number(m.quantidade),
        'Qtd Absoluta': Number(m.quantidade),
        'Unidade': m.produto_unidade || 'UN',
        'Colaborador / Ficha': m.colaborador_nome_exibicao || '',
        'Setor': m.colaborador_departamento || '',
        'Atendente': m.responsavel || '',
        'Documento / O.S.': m.documento_ref || '',
        'Motivo / Observação': m.motivo || ''
      }));

      const mapProdRows = (lista) => lista.map(p => ({
        'SKU': p.sku || '',
        'Nome do Produto': p.nome || '',
        'Categoria': p.categoria || 'Outros',
        'Marca': p.marca || '',
        'Condição': p.condicao || 'NOVO',
        'Saldo Atual': Number(p.quantidade || 0),
        'Estoque Mínimo': Number(p.estoque_minimo || 0),
        'Unidade': p.unidade_medida || 'UN',
        'Status': p.status_estoque === 'CRITICO' ? 'ZERADO' : (p.status_estoque === 'BAIXO' ? 'BAIXO' : 'NORMAL'),
        'Saídas no Período': Number(p.saidas_periodo || 0),
        'Consumo 30 dias': Number(p.consumo_30d || 0),
        'Localização': p.localizacao || '',
        'TAG': p.tag || '',
        'Patrimônio': p.patrimonio || '',
        'C.A (EPI)': p.ca || '',
        'Nº Série': p.numero_serie || '',
        'Observações': p.observacao || ''
      }));

      const mapColabRows = (lista) => lista.map(c => ({
        'Colaborador': c.nome,
        'Matrícula': c.matricula,
        'Cargo': c.cargo,
        'Departamento / Setor': c.departamento,
        'Saídas (un)': c.saidasQtd,
        'Trocas (un)': c.trocasQtd,
        'Empréstimos no Período (un)': c.emprestimosQtd,
        'Devoluções no Período (un)': c.devolucoesQtd,
        'Total Retirado no Período': c.totalRetirado,
        'Cautelas Abertas (Atual)': c.cautelasAbertas,
        'Nº de Lançamentos': c.totalLancamentos
      }));

      if (dados.tipoRelatorio === 'geral') {
        addSheet('Resumo Gerencial', capaRows, [38, 48]);
        addSheet('Top Itens Movimentados', dados.topProdutosConsumo.map((p, idx) => ({
          '#': idx + 1,
          'SKU': p.sku,
          'Produto': p.nome,
          'Categoria': p.categoria,
          'Saídas (un)': p.saidas,
          'Trocas (un)': p.trocas,
          'Empréstimos (un)': p.emprestimos,
          'Devoluções (un)': p.devolucoes,
          'Total Retirado': p.totalConsumo + p.emprestimos,
          'Unidade': p.unidade,
          'Lançamentos': p.lancamentos
        })), [5, 16, 40, 20, 13, 13, 16, 16, 15, 10, 13]);
        addSheet('Por Colaborador', mapColabRows(dados.resumoColaboradores), [30, 14, 24, 22, 13, 13, 22, 22, 22, 22, 16]);
        addSheet('Estoque por Categoria', dados.resumoCategorias.map(c => ({
          'Categoria': c.categoria,
          'Qtd Produtos': c.totalItens,
          'Unidades em Estoque': c.totalUnidades,
          'Itens Zerados': c.zerados,
          'Estoque Baixo': c.baixo,
          'Saídas no Período': c.saidasPeriodo
        })), [26, 15, 20, 15, 15, 18]);
        addSheet('Movimentações', mapMovRows(dados.movimentacoes), [13, 18, 13, 15, 36, 18, 12, 12, 9, 26, 18, 22, 18, 32]);
      } else if (dados.tipoRelatorio === 'movimentacoes') {
        addSheet('Movimentações', mapMovRows(dados.movimentacoes), [13, 18, 13, 15, 36, 18, 12, 12, 9, 26, 18, 22, 18, 32]);
        addSheet('Resumo', capaRows, [38, 48]);
      } else if (dados.tipoRelatorio === 'colaboradores') {
        addSheet('Consumo por Colaborador', mapColabRows(dados.resumoColaboradores), [30, 14, 24, 22, 13, 13, 22, 22, 22, 22, 16]);
        addSheet('Lançamentos Detalhados', mapMovRows(dados.movimentacoes), [13, 18, 13, 15, 36, 18, 12, 12, 9, 26, 18, 22, 18, 32]);
        addSheet('Resumo', capaRows, [38, 48]);
      } else if (dados.tipoRelatorio === 'emprestimos') {
        addSheet('Cautelas e Empréstimos', dados.emprestimos.map(e => ({
          'Código': `MOV-${String(e.id).padStart(4, '0')}`,
          'Status': e.status_emprestimo || (e.data_devolucao ? 'DEVOLVIDO' : 'PENDENTE'),
          'Data Retirada': e.data_br,
          'Dias em Posse': e.status_emprestimo === 'DEVOLVIDO' ? 0 : e.dias_decorridos,
          'Data Devolução': e.data_devolucao ? formatarDataHoraBR(e.data_devolucao) : '-',
          'SKU': e.produto_sku || '',
          'Ferramenta / Item': e.produto_nome || '',
          'TAG': e.produto_tag || '',
          'Patrimônio': e.produto_patrimonio || '',
          'Quantidade': Number(e.quantidade || 0),
          'Unidade': e.produto_unidade || 'UN',
          'Colaborador': e.colaborador_nome_exibicao || '',
          'Setor': e.colaborador_departamento || '',
          'Atendente': e.responsavel || '',
          'Documento / O.S.': e.documento_ref || '',
          'Observação': e.motivo || ''
        })), [13, 13, 18, 14, 18, 15, 36, 13, 15, 12, 9, 26, 18, 22, 18, 30]);
        addSheet('Resumo', capaRows, [38, 48]);
      } else if (dados.tipoRelatorio === 'inventario') {
        addSheet('Posição de Inventário', mapProdRows(dados.produtos), [15, 38, 20, 18, 12, 12, 14, 9, 12, 16, 15, 20, 13, 15, 12, 16, 28]);
        addSheet('Por Categoria', dados.resumoCategorias.map(c => ({
          'Categoria': c.categoria,
          'Qtd Produtos': c.totalItens,
          'Unidades em Estoque': c.totalUnidades,
          'Itens Zerados': c.zerados,
          'Estoque Baixo': c.baixo,
          'Saídas no Período': c.saidasPeriodo
        })), [26, 15, 20, 15, 15, 18]);
        addSheet('Resumo', capaRows, [38, 48]);
      } else if (dados.tipoRelatorio === 'contagem') {
        addSheet('Contagem Diária', dados.itensContagemDiaria.map((item, idx) => ({
          '#': idx + 1,
          'Localização': item.localizacao || 'Sem localização',
          'SKU': item.sku || '',
          'TAG / Patrimônio': [item.tag, item.patrimonio].filter(Boolean).join(' / '),
          'Produto / Material': item.nome || '',
          'Marca': item.marca || '',
          'Categoria': item.categoria || '',
          'Saídas no Dia': item.saidas_dia,
          'Empréstimos no Dia': item.emprestimos_dia,
          'Trocas no Dia': item.trocas_dia,
          'Entradas/Devol. no Dia': item.entradas_dia + item.devolucoes_dia,
          'Saldo Atual (Sistema)': item.saldo_atual,
          'Unidade': item.unidade_medida || 'UN',
          'Contagem Física': '',
          'Divergência': '',
          'Observação da Conferência': ''
        })), [5, 20, 15, 18, 38, 16, 18, 13, 16, 13, 18, 18, 9, 16, 14, 28]);
        addSheet('Resumo', capaRows, [38, 48]);
      } else if (dados.tipoRelatorio === 'duplicidades') {
        addSheet('Resumo Duplicidades', dados.gruposDuplicidades.map((g, idx) => ({
          '#': idx + 1,
          'Item / Equipamento Base': g.nome_base,
          'Categoria': g.categoria,
          'Tipo de Ocorrência': g.tipoDuplicidade,
          'Cadastros (SKUs/TAGs)': g.totalRegistros,
          'Total em Estoque': g.totalUnidadesEstoque,
          'Emprestado (Campo)': g.totalEmprestado,
          'Potencial Desmobilizar': g.potencialDesmobilizar,
          'Unidade': g.unidade_medida,
          'SKUs / TAGs Envolvidos': g.registros.map(r => r.tag ? `${r.sku} (TAG:${r.tag})` : r.sku).join(', ')
        })), [5, 36, 18, 30, 18, 16, 18, 20, 9, 42]);
        addSheet('Detalhe TAG e SKU', dados.itensDuplicidadesDetalhe.map(r => ({
          'Grupo / Equipamento': r.grupo_nome_base,
          'Ocorrência': r.grupo_tipo_duplicidade,
          'SKU': r.sku || '',
          'Nome Cadastrado': r.nome || '',
          'Categoria': r.categoria || '',
          'Marca': r.marca || '',
          'TAG': r.tag || '',
          'Patrimônio': r.patrimonio || '',
          'Nº Série': r.numero_serie || '',
          'Condição': r.condicao || 'NOVO',
          'Saldo em Estoque': Number(r.quantidade || 0),
          'Emprestado (Campo)': Number(r.emprestado_atual || 0),
          'Localização': r.localizacao || '',
          'Desmobilizar? (S/N)': ''
        })), [30, 26, 15, 36, 18, 16, 14, 15, 16, 12, 15, 16, 18, 18]);
        addSheet('Resumo', capaRows, [38, 48]);
      } else if (dados.tipoRelatorio === 'reposicao') {
        addSheet('Alerta de Reposição', dados.itensReposicao.map(p => ({
          'Prioridade': p.quantidade === 0 ? 'URGENTE (ZERADO)' : 'ATENÇÃO (BAIXO)',
          'SKU': p.sku || '',
          'Produto / Material': p.nome || '',
          'Categoria': p.categoria || 'Outros',
          'Marca': p.marca || '',
          'Saldo Atual': Number(p.quantidade || 0),
          'Estoque Mínimo': Number(p.estoque_minimo || 0),
          'Déficit p/ Mínimo': Number(p.deficit_minimo || 0),
          'Consumo (30 dias)': Number(p.consumo_30d || 0),
          'Sugestão de Compra': Number(p.sugestao_compra || 1),
          'Unidade': p.unidade_medida || 'UN',
          'Localização': p.localizacao || '',
          'C.A (EPI)': p.ca || ''
        })), [18, 15, 38, 20, 18, 12, 15, 16, 16, 18, 9, 18, 12]);
        addSheet('Resumo', capaRows, [38, 48]);
      }

      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const nomeArquivo = `relatorio_${dados.tipoRelatorio}_${dados.hojeYMD}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(buffer);
    } catch (error) {
      console.error('Erro ao exportar relatório Excel:', error);
      res.redirect('/relatorios?erro=' + encodeURIComponent('Falha ao gerar arquivo Excel: ' + error.message));
    }
  }
}

module.exports = RelatorioController;
