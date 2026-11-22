const Produto = require('../models/Produto');
const Movimentacao = require('../models/Movimentacao');
const db = require('../../config/database');
const { supabase } = require('../../config/supabase');

const isVercel = !!process.env.VERCEL;
const isSupabaseDriver = process.env.DB_DRIVER === 'supabase';
const useSupabase = isVercel || isSupabaseDriver;

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Cuiaba';

function isItemSuprimento(produto) {
  if (!produto) return false;
  const cat = String(produto.categoria || '').toLowerCase();
  const tag = String(produto.tag || '').toLowerCase();
  return cat.includes('suprimento') || tag.includes('suprimento');
}

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

function extrairDataLocalYMD(dateStr) {
  if (!dateStr) return '';
  const str = String(dateStr).trim();
  if (!str.includes('T') && !str.includes('Z') && !str.includes('+') && str.length >= 10) {
    return str.substring(0, 10);
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return str.substring(0, 10);
  return formatDateLocalYMD(d);
}

async function buscarMovimentacoesPorProdutos(produtoIds) {
  if (!produtoIds || produtoIds.length === 0) return [];

  if (useSupabase && supabase) {
    const { data, error } = await supabase
      .from('movimentacoes')
      .select('*, produtos(nome, sku, unidade_medida, categoria)')
      .in('produto_id', produtoIds)
      .order('id', { ascending: false })
      .limit(1000);

    if (error) {
      console.error('Erro ao buscar movimentações de suprimentos no Supabase:', error);
      return [];
    }

    return (data || []).map(m => ({
      ...m,
      produto_nome: m.produtos ? m.produtos.nome : 'Suprimento',
      produto_sku: m.produtos ? m.produtos.sku : '',
      produto_unidade: m.produtos ? (m.produtos.unidade_medida || 'UN') : 'UN'
    }));
  }

  if (!db) return [];

  const placeholders = produtoIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT
      m.*,
      p.nome AS produto_nome,
      p.sku AS produto_sku,
      COALESCE(p.unidade_medida, 'UN') AS produto_unidade
    FROM movimentacoes m
    JOIN produtos p ON m.produto_id = p.id
    WHERE m.produto_id IN (${placeholders})
    ORDER BY m.id DESC
    LIMIT 1000
  `).all(...produtoIds);
}

class SuprimentoController {
  /**
   * Painel Principal de Controle de Suprimentos do Canteiro
   */
  static async index(req, res) {
    try {
      const { busca, status, sucesso, erro } = req.query;

      const todosProdutos = await Produto.findAll();
      const todosSuprimentos = (todosProdutos || []).filter(isItemSuprimento);

      const idsSuprimentos = todosSuprimentos.map(p => p.id);
      const movimentacoesSuprimentos = await buscarMovimentacoesPorProdutos(idsSuprimentos);

      // Datas de referência para médias de consumo (7 dias e 30 dias)
      const hoje = new Date();
      const data7d = formatDateLocalYMD(new Date(hoje.getTime() - 6 * 24 * 60 * 60 * 1000));
      const data30d = formatDateLocalYMD(new Date(hoje.getTime() - 29 * 24 * 60 * 60 * 1000));

      const consumoMap = new Map();
      for (const m of movimentacoesSuprimentos) {
        if (m.tipo !== 'SAIDA' && m.tipo !== 'TROCA') continue;
        const pid = String(m.produto_id);
        const ymd = extrairDataLocalYMD(m.criado_em);
        const qtd = Number(m.quantidade || 0);

        if (!consumoMap.has(pid)) {
          consumoMap.set(pid, { saidas7d: 0, saidas30d: 0, diasComMov: new Set(), primeiraSaidaYMD: ymd });
        }
        const acc = consumoMap.get(pid);
        if (ymd >= data7d) acc.saidas7d += qtd;
        if (ymd >= data30d) {
          acc.saidas30d += qtd;
          acc.diasComMov.add(ymd);
        }
        if (ymd && (!acc.primeiraSaidaYMD || ymd < acc.primeiraSaidaYMD)) {
          acc.primeiraSaidaYMD = ymd;
        }
      }

      // Enriquece cada suprimento com média de saída, projeção e dias de cobertura
      const suprimentosEnriquecidos = todosSuprimentos.map(p => {
        const c = consumoMap.get(String(p.id)) || { saidas7d: 0, saidas30d: 0 };
        const saldo = Number(p.quantidade || 0);

        // Base de dias: usa 7 dias se só houver movimento recente (última semana), ou 30 dias se houver histórico maior
        const mediaDiaria7d = c.saidas7d / 7;
        const mediaDiaria30d = c.saidas30d / 30;
        const mediaDiaria = c.saidas30d > c.saidas7d ? mediaDiaria30d : mediaDiaria7d;
        const mediaSemanal = mediaDiaria * 7;
        const projecao30d = Math.ceil(mediaDiaria * 30);
        const diasCobertura = mediaDiaria > 0 ? Math.floor(saldo / mediaDiaria) : null;

        return {
          ...p,
          saidas7d: c.saidas7d,
          saidas30d: c.saidas30d,
          mediaDiaria,
          mediaSemanal,
          projecao30d,
          diasCobertura
        };
      });

      // Filtros de visualização na tela
      let suprimentosFiltrados = suprimentosEnriquecidos;
      if (busca && busca.trim()) {
        const q = busca.trim().toLowerCase();
        suprimentosFiltrados = suprimentosFiltrados.filter(p =>
          (p.nome && p.nome.toLowerCase().includes(q)) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.marca && p.marca.toLowerCase().includes(q)) ||
          (p.localizacao && p.localizacao.toLowerCase().includes(q)) ||
          (p.tag && p.tag.toLowerCase().includes(q)) ||
          (p.observacao && p.observacao.toLowerCase().includes(q))
        );
      }

      if (status && status.trim()) {
        suprimentosFiltrados = suprimentosFiltrados.filter(p => p.status_estoque === status.trim());
      }

      // Ordena priorizando itens zerados / baixo / menor cobertura
      suprimentosFiltrados.sort((a, b) => {
        const peso = (s) => (s === 'CRITICO' ? 0 : s === 'BAIXO' ? 1 : 2);
        if (peso(a.status_estoque) !== peso(b.status_estoque)) {
          return peso(a.status_estoque) - peso(b.status_estoque);
        }
        return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
      });

      const estatisticas = {
        totalItens: suprimentosEnriquecidos.length,
        totalUnidades: suprimentosEnriquecidos.reduce((acc, p) => acc + Number(p.quantidade || 0), 0),
        zerados: suprimentosEnriquecidos.filter(p => p.status_estoque === 'CRITICO').length,
        baixos: suprimentosEnriquecidos.filter(p => p.status_estoque === 'BAIXO').length,
        consumo7d: suprimentosEnriquecidos.reduce((acc, p) => acc + p.saidas7d, 0),
        consumo30d: suprimentosEnriquecidos.reduce((acc, p) => acc + p.saidas30d, 0),
        emRiscoCobertura: suprimentosEnriquecidos.filter(p => p.diasCobertura !== null && p.diasCobertura <= 7).length
      };

      res.render('suprimentos/index', {
        title: 'Suprimentos do Canteiro',
        currentPage: 'suprimentos',
        suprimentos: suprimentosFiltrados,
        estatisticas,
        ultimasMovimentacoes: movimentacoesSuprimentos.slice(0, 15),
        skuSugerido: Produto.gerarSku('SUP'),
        filtros: {
          busca: busca || '',
          status: status || ''
        },
        sucesso: sucesso || null,
        erro: erro || null
      });
    } catch (error) {
      console.error('Erro ao carregar Suprimentos:', error);
      res.status(500).render('layouts/erro', {
        title: 'Erro em Suprimentos',
        currentPage: 'suprimentos',
        mensagem: 'Não foi possível carregar o controle de suprimentos.',
        detalhes: error.message
      });
    }
  }

  /**
   * Cadastra um novo item já etiquetado como Suprimentos
   */
  static async store(req, res) {
    try {
      const {
        sku, nome, marca, unidade_medida, quantidade, estoque_minimo,
        localizacao, tag, observacao
      } = req.body;

      if (!nome || !nome.trim()) {
        throw new Error('Informe o nome do suprimento (ex: Galão de Água 20L, Tinta Epson Preta).');
      }

      const nomeTrim = nome.trim();
      const existenteNome = await Produto.findByNomeExato(nomeTrim);
      if (existenteNome) {
        throw new Error(`Já existe um item cadastrado com o nome "${existenteNome.nome}" (${existenteNome.sku}).`);
      }

      if (sku && sku.trim()) {
        const existenteSku = await Produto.findBySku(sku.trim().toUpperCase());
        if (existenteSku) {
          throw new Error(`O código SKU "${sku.trim().toUpperCase()}" já está em uso.`);
        }
      }

      const qtdInicial = parseInt(quantidade, 10) || 0;
      const tagFinal = (tag && tag.trim()) ? tag.trim().toUpperCase() : 'SUPRIMENTO';

      const produtoId = await Produto.create({
        sku: (sku && sku.trim()) ? sku.trim().toUpperCase() : Produto.gerarSku('SUP'),
        nome: nomeTrim,
        categoria: 'Suprimentos',
        marca: marca && marca.trim() ? marca.trim() : null,
        unidade_medida: unidade_medida || 'UN',
        quantidade: 0,
        estoque_minimo: parseInt(estoque_minimo, 10) || 0,
        localizacao: localizacao && localizacao.trim() ? localizacao.trim() : 'Canteiro / Suprimentos',
        tag: tagFinal,
        observacao: observacao && observacao.trim() ? observacao.trim() : null,
        condicao: 'NOVO'
      });

      if (qtdInicial > 0) {
        await Movimentacao.registrar({
          produto_id: produtoId,
          tipo: 'ENTRADA',
          quantidade: qtdInicial,
          colaborador: 'Estoque Suprimentos',
          motivo: 'Carga inicial de suprimento no canteiro',
          responsavel: req.user?.nome || 'Almoxarife',
          documento_ref: 'SUPRIMENTO-INICIAL'
        });
      }

      res.redirect('/suprimentos?sucesso=' + encodeURIComponent(`Suprimento "${nomeTrim}" cadastrado com sucesso!`));
    } catch (error) {
      console.error('Erro ao cadastrar suprimento:', error);
      res.redirect('/suprimentos?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Registra Entrada (reposição) ou Saída (consumo/abastecimento no canteiro) rápida
   */
  static async movimentar(req, res) {
    try {
      const { produto_id, tipo, quantidade, local_destino, documento_ref, motivo } = req.body;

      if (!produto_id) {
        throw new Error('Selecione o item de suprimento.');
      }

      const tipoFinal = tipo === 'ENTRADA' ? 'ENTRADA' : 'SAIDA';

      if (tipoFinal === 'ENTRADA' && !['ADMIN', 'ALMOXARIFE'].includes(req.user?.nivel_acesso)) {
        throw new Error('Seu nível de acesso permite apenas registrar saída/consumo de suprimentos, não reposição de estoque.');
      }

      const qtd = parseInt(quantidade, 10);
      if (!qtd || qtd <= 0) {
        throw new Error('A quantidade deve ser maior que zero.');
      }

      const prod = await Produto.findById(parseInt(produto_id, 10));
      if (!prod) {
        throw new Error('Suprimento não encontrado.');
      }

      const destinoFinal = (local_destino && local_destino.trim())
        ? local_destino.trim()
        : (tipoFinal === 'ENTRADA' ? 'Fornecedor / Reposição' : 'Canteiro de Obras');

      const motivoFinal = (motivo && motivo.trim())
        ? motivo.trim()
        : (tipoFinal === 'ENTRADA' ? `Reposição de suprimento (${destinoFinal})` : `Abastecimento / consumo em ${destinoFinal}`);

      const resultado = await Movimentacao.registrar({
        produto_id: parseInt(produto_id, 10),
        tipo: tipoFinal,
        quantidade: qtd,
        colaborador: destinoFinal,
        responsavel: req.user?.nome || 'Almoxarife',
        documento_ref: documento_ref && documento_ref.trim() ? documento_ref.trim() : null,
        motivo: motivoFinal
      });

      const acaoTexto = tipoFinal === 'ENTRADA' ? 'Entrada / Reposição' : 'Saída / Abastecimento';
      res.redirect('/suprimentos?sucesso=' + encodeURIComponent(`${acaoTexto} de ${qtd} ${prod.unidade_medida || 'UN'} de "${resultado.produto_nome}" registrada! Saldo atual: ${resultado.novo_saldo}.`));
    } catch (error) {
      console.error('Erro ao movimentar suprimento:', error);
      res.redirect('/suprimentos?erro=' + encodeURIComponent(error.message));
    }
  }
}

module.exports = SuprimentoController;
