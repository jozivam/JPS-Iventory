const xlsx = require('xlsx');
const Produto = require('../models/Produto');
const Movimentacao = require('../models/Movimentacao');

const STOP_WORDS = new Set([
  'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'A', 'O', 'AS', 'OS', 'EM', 'NO', 'NA', 'NOS', 'NAS',
  'PARA', 'COM', 'SEM', 'POR', 'TIPO', 'MODELO', 'MARCA', 'COR', 'UN', 'UNID', 'UNIDADE',
  'UND', 'PCT', 'CX', 'PAR', 'MT', 'MTS', 'M', 'KG', 'LT', 'L', 'PC', 'PCS', 'KIT', 'CONJUNTO'
]);

const ABREV_MAP = {
  'C/': ' COM ',
  'S/': ' SEM ',
  'P/': ' PARA ',
  'POL.': ' POL ',
  'POL': ' POL ',
  'POLEGADAS': ' POL ',
  'POLEGADA': ' POL ',
  'ELETR.': ' ELETRICA ',
  'MONT.': ' MONTAGEM ',
  'PLAST.': ' PLASTICO ',
  'FLEX.': ' FLEXIVEL ',
  'ESP.': ' ESPESSURA ',
  'REF.': ' REFERENCIA ',
  'TAM.': ' TAMANHO ',
  'N.': ' NUMERO ',
  'NO.': ' NUMERO ',
  'QTDE': ' QUANTIDADE ',
  'AMPRERES': ' AMPERES ',
  'MITIMETRO': ' MULTIMETRO ',
  'APERIMETRO': ' AMPERIMETRO ',
  'BOSH': ' BOSCH ',
  'MAQUITA': ' MAKITA ',
  'OCULO': ' OCULOS ',
  'JULGULA': ' JUGULAR ',
  'LIXADEIRA': ' ESMERILHADEIRA LIXADEIRA ',
  'ESMERILHADEIRA': ' ESMERILHADEIRA LIXADEIRA '
};

/**
 * Normaliza texto removendo acentos, pontuações e padronizando abreviações comuns de obra
 */
function normalizarTexto(str) {
  if (!str) return '';
  let s = String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/(\d+)\s*"/g, '$1 POL ')
    .replace(/(\d+)\s*''/g, '$1 POL ');

  for (const [abrev, full] of Object.entries(ABREV_MAP)) {
    const escaped = abrev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$|\\d)`, 'g'), `$1${full}`);
  }

  return s
    .replace(/[,;()[\]{}:/\\|+*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrai códigos patrimoniais / PTM / PTMM / PMT / TAG / SKU de qualquer texto
 */
function extrairCodigosPatrimonio(textos = []) {
  const combinado = textos.filter(Boolean).join(' ').toUpperCase();
  const codigosExatos = new Set();
  const familiasPTM = new Set(); // ex: "PTM:1493" (unifica PTM-1493, PTMM-1493, PMT-1493)

  // Padrões com prefixo PTM / PTMM / PMT / PAT / TAG / FER / ELE / EPI / GER / SUP / MAT
  const regexGeral = /\b(PTMM|PTM|PMT|PAT|TAG|SN|NS)[-\s.:/]*(\d{2,7})\b/g;
  let m;
  while ((m = regexGeral.exec(combinado)) !== null) {
    const prefix = m[1];
    const num = m[2].replace(/^0+/, '') || m[2];
    codigosExatos.add(`${prefix}-${m[2]}`);
    codigosExatos.add(`${prefix}${m[2]}`);
    if (['PTM', 'PTMM', 'PMT', 'PAT'].includes(prefix)) {
      familiasPTM.add(`PTM:${num}`);
    }
  }

  // SKUs genéricos (ex: GER-6697, FER-ALC-001, AGUA)
  const regexSku = /\b([A-Z]{2,5}-[A-Z0-9]{2,8}(?:-[A-Z0-9]{1,6})?)\b/g;
  while ((m = regexSku.exec(combinado)) !== null) {
    codigosExatos.add(m[1]);
    codigosExatos.add(m[1].replace(/-/g, ''));
  }

  return {
    codigosExatos: Array.from(codigosExatos),
    familiasPTM: Array.from(familiasPTM)
  };
}

/**
 * Extrai números de C.A. (Certificado de Aprovação de EPI)
 */
function extrairCAs(textos = []) {
  const combinado = textos.filter(Boolean).join(' ').toUpperCase();
  const cas = new Set();
  const regexCA = /\bC\.?\s*A\.?\s*[:#-]?\s*(\d{4,6})\b/g;
  let m;
  while ((m = regexCA.exec(combinado)) !== null) {
    cas.add(m[1]);
  }
  return Array.from(cas);
}

/**
 * Extrai medidas/tamanhos relevantes (ex: 43, 12 POL, 10MM, 1/4, TAM:G, 3X1.0MM2)
 */
function extrairDimensoes(textoNormalizado) {
  const dims = new Set();
  if (!textoNormalizado) return dims;

  // Medidas com unidade (MM, CM, POL, V, A, W, L, KG, M)
  const regexMed = /\b(\d+(?:[.,/]\d+)?)\s*(MM2|MM|CM|POL|V|KV|A|W|L|LITROS|KG|MTS|M)\b/g;
  let m;
  while ((m = regexMed.exec(textoNormalizado)) !== null) {
    const num = m[1].replace(',', '.').replace(/\.00$/, '').replace(/\.0$/, '');
    dims.add(`${num}${m[2]}`);
  }

  // Frações (1/4, 7/8, 3/8, 4 1/2)
  const regexFrac = /\b(\d+\/\d+)\b/g;
  while ((m = regexFrac.exec(textoNormalizado)) !== null) {
    dims.add(m[1]);
  }

  // Numeração de calçado / tamanho de vestimenta (aceita N 43, N. 43, NUM 43, NUMERO 43, TAM G, TAMANHO G)
  const regexNum = /\b(?:NUMERO|NUM|N|NO)\s+(\d{1,2})\b/g;
  while ((m = regexNum.exec(textoNormalizado)) !== null) {
    dims.add(`NUM:${m[1]}`);
  }
  const regexTam = /\b(?:TAMANHO|TAM)\s+(PP|P|M|G|GG|XG|XXG|EXG|\d{2})\b/g;
  while ((m = regexTam.exec(textoNormalizado)) !== null) {
    dims.add(`TAM:${m[1]}`);
  }

  return dims;
}

/**
 * Extrai tokens semânticos (palavras úteis removendo códigos PTM/CA e stop words)
 */
function extrairTokens(textoOriginal) {
  const semCodigos = String(textoOriginal || '')
    .replace(/\b(PTMM|PTM|PMT|PAT|TAG)[-\s.:/]*\d{2,7}\b/gi, ' ')
    .replace(/\bC\.?\s*A\.?\s*[:#-]?\s*\d{4,6}\b/gi, ' ');
  const norm = normalizarTexto(semCodigos);
  return norm
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t));
}

/**
 * Distância de Levenshtein rápida para tolerar erros de digitação (ex: MITIMETRO vs MULTIMETRO)
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > 3) return 4;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let currPrev = i - 1;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, currPrev + cost);
      currPrev = temp;
    }
  }
  return prev[b.length];
}

function tokensCombinam(t1, t2) {
  if (t1 === t2) return 1.0;
  // Números puros devem bater exatamente (evita 10mm bater com 12mm)
  if (/^\d+$/.test(t1) || /^\d+$/.test(t2)) return 0;
  if (t1.length >= 4 && t2.length >= 4) {
    if (t1.startsWith(t2) || t2.startsWith(t1)) return 0.9;
    const dist = levenshtein(t1, t2);
    if (dist === 1) return 0.88;
    if (dist === 2 && Math.min(t1.length, t2.length) >= 6) return 0.78;
  }
  return 0;
}

/**
 * Calcula similaridade inteligente entre um item da planilha e um produto indexado do almoxarifado
 */
function calcularSimilaridade(itemPlan, prodIndex) {
  // 1. Match EXATO por código PTM / PTMM / PMT / Patrimônio / TAG / SKU
  for (const fam of itemPlan.codigos.familiasPTM) {
    if (prodIndex.familiasPTMSet.has(fam)) {
      return { score: 100, criterio: `Código Patrimonial / PTM Exato (${fam.replace('PTM:', 'PTM-')})` };
    }
  }
  for (const cod of itemPlan.codigos.codigosExatos) {
    if (cod.length >= 4 && prodIndex.codigosExatosSet.has(cod)) {
      return { score: 99, criterio: `Código / SKU / TAG Exato (${cod})` };
    }
  }

  // 2. Match por C.A. (EPI)
  let matchCA = null;
  for (const ca of itemPlan.cas) {
    if (prodIndex.casSet.has(ca)) {
      matchCA = ca;
      break;
    }
  }

  // 3. Similaridade por tokens (cobertura bidirecional + tolerância a erros de digitação)
  const tA = itemPlan.tokens;
  const tB = prodIndex.tokens;

  let scoreTexto = 0;
  if (tA.length > 0 && tB.length > 0) {
    let somaA = 0;
    for (const a of tA) {
      let melhor = 0;
      for (const b of tB) {
        const s = tokensCombinam(a, b);
        if (s > melhor) melhor = s;
        if (melhor === 1) break;
      }
      somaA += melhor;
    }

    let somaB = 0;
    for (const b of tB) {
      let melhor = 0;
      for (const a of tA) {
        const s = tokensCombinam(b, a);
        if (s > melhor) melhor = s;
        if (melhor === 1) break;
      }
      somaB += melhor;
    }

    const cobA = somaA / tA.length;
    const cobB = somaB / tB.length;
    // Média harmônica ponderada favorecendo cobertura do nome mais curto (comum no almoxarifado)
    const maxCob = Math.max(cobA, cobB);
    const minCob = Math.min(cobA, cobB);
    scoreTexto = Math.round(((maxCob * 0.62) + (minCob * 0.38)) * 100);

    // Bônus se a primeira palavra principal (ex: FURADEIRA, LIXADEIRA, BOTINA, BROCA, CABO) bate
    if (tokensCombinam(tA[0], tB[0]) >= 0.85) {
      scoreTexto = Math.min(96, scoreTexto + 8);
    }
  }

  // Ajuste por dimensões/tamanhos (ex: Botina N.43 vs N.45, Calça G vs M, Broca 6mm vs 10mm)
  let dimensoesConflitam = false;
  if (itemPlan.dimensoes.size > 0 && prodIndex.dimensoes.size > 0) {
    let bateuDim = false;
    for (const d of itemPlan.dimensoes) {
      if (prodIndex.dimensoes.has(d)) {
        bateuDim = true;
        break;
      }
    }
    if (bateuDim) {
      scoreTexto = Math.min(97, scoreTexto + 7);
    } else {
      // Dimensões presentes em ambos mas nenhuma bateu -> provável tamanho/bitola diferente
      dimensoesConflitam = true;
      scoreTexto = Math.min(70, Math.max(0, scoreTexto - 22));
    }
  }

  if (matchCA) {
    if (dimensoesConflitam) {
      return { score: 66, criterio: `C.A. ${matchCA} (Tamanho/Medida Diferente — Revisar)` };
    }
    const scoreCA = Math.min(98, Math.max(82, Math.round(62 + scoreTexto * 0.38)));
    return { score: scoreCA, criterio: `C.A. ${matchCA} + Nome (${scoreCA}%)` };
  }

  if (scoreTexto >= 48) {
    return { score: scoreTexto, criterio: `Nome Parecido (${scoreTexto}%)` };
  }

  return { score: scoreTexto, criterio: '' };
}

/**
 * Converte data serial do Excel ou texto em dd/mm/aaaa
 */
function formatarDataExcel(val) {
  if (val === undefined || val === null || val === '') return '';
  if (typeof val === 'number' && val > 25000 && val < 70000) {
    const dt = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(dt.getTime())) {
      const dd = String(dt.getUTCDate()).padStart(2, '0');
      const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = dt.getUTCFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
  }
  return String(val).trim();
}

function parseNumeroSeguro(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).trim().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Detecta automaticamente a linha de cabeçalho e extrai todos os itens de TODAS as abas da planilha
 */
function extrairItensDaPlanilha(buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const itens = [];
  const abasLidas = [];

  const detectarIndiceColuna = (headersNorm, padroes) => {
    for (const p of padroes) {
      const idx = headersNorm.findIndex(h => h && p.test(h));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const matriz = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!matriz || matriz.length === 0) continue;

    // Procura linha de cabeçalho nas primeiras 15 linhas
    let headerRowIdx = -1;
    let headersNorm = [];
    for (let i = 0; i < Math.min(15, matriz.length); i++) {
      const rowNorm = matriz[i].map(cell =>
        String(cell || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase()
          .trim()
      );
      const temDescricao = rowNorm.some(h => /^(DESCRICAO|PRODUTO|ITEM|MATERIAL|EQUIPAMENTO|NOME|NOME DO PRODUTO)$/.test(h) || h.includes('DESCRICAO') || h.includes('PRODUTO'));
      const temQtdOuCod = rowNorm.some(h => h.includes('QUANT') || h.includes('QTDE') || h.includes('QTD') || h.includes('SKU') || h.includes('PATRIMONIO') || h.includes('PTM') || h.includes('UNDE') || h.includes('UNID'));
      if (temDescricao && (temQtdOuCod || rowNorm.filter(Boolean).length >= 2)) {
        headerRowIdx = i;
        headersNorm = rowNorm;
        break;
      }
    }

    if (headerRowIdx === -1) continue;

    const idxDesc = detectarIndiceColuna(headersNorm, [/^DESCRICAO$/, /DESCRICAO/, /^NOME DO PRODUTO$/, /^PRODUTO$/, /^MATERIAL$/, /^EQUIPAMENTO$/, /^ITEM$/, /^NOME$/]);
    const idxSku = detectarIndiceColuna(headersNorm, [/^SKU$/, /CODIGO/, /COD\./, /^TAG$/, /PLAQUETA/]);
    const idxPat = detectarIndiceColuna(headersNorm, [/PATRIMONIO/, /^PTM$/, /^PMT$/, /SERIE/]);
    const idxUn = detectarIndiceColuna(headersNorm, [/^UNDE/, /^UNID/, /^UN$/, /^UND$/]);
    const idxQtdEnv = detectarIndiceColuna(headersNorm, [/QUANT.*ENVIAD/, /QTD.*ENVIAD/, /QTD.*RECEB/, /^QUANTIDADE$/, /^QTD/, /^ESTOQUE$/]);
    const idxQtdRec = detectarIndiceColuna(headersNorm, [/QTD.*RECEB/, /QUANT.*RECEB/]);
    const idxQtdDev = detectarIndiceColuna(headersNorm, [/QUANT.*DEVOL/, /QTD.*DEVOL/]);
    const idxNf = detectarIndiceColuna(headersNorm, [/NF.*ENVIO/, /^NF$/, /NOTA/, /DOC/]);
    const idxDtEnv = detectarIndiceColuna(headersNorm, [/DT.*ENVIO/, /DATA.*ENVIO/, /^DATA$/]);
    const idxVal = detectarIndiceColuna(headersNorm, [/VALOR.*UNIT/, /PRECO/]);
    const idxCa = detectarIndiceColuna(headersNorm, [/^C\.?A\.?$/, /CA\s*\(EPI\)/]);

    if (idxDesc === -1 && idxSku === -1 && idxPat === -1) continue;

    let countAba = 0;

    for (let r = headerRowIdx + 1; r < matriz.length; r++) {
      const row = matriz[r];
      if (!row || row.length === 0) continue;

      const descricao = idxDesc !== -1 ? String(row[idxDesc] || '').replace(/\s+/g, ' ').trim() : '';
      const skuCol = idxSku !== -1 ? String(row[idxSku] || '').trim() : '';
      const patCol = idxPat !== -1 ? String(row[idxPat] || '').trim() : '';
      const caCol = idxCa !== -1 ? String(row[idxCa] || '').trim() : '';

      if (!descricao && !skuCol && !patCol) continue;

      const descUpper = descricao.toUpperCase();
      // Ignora linhas de subtotal / rodapé ou repetição de cabeçalho
      if (descUpper === 'DESCRIÇÃO' || descUpper === 'DESCRICAO' || descUpper.startsWith('TOTAL GERAL') || descUpper === 'TOTAL') {
        continue;
      }

      const qtdEnviada = idxQtdEnv !== -1 ? parseNumeroSeguro(row[idxQtdEnv]) : 0;
      const qtdRecebida = idxQtdRec !== -1 ? parseNumeroSeguro(row[idxQtdRec]) : 0;
      const qtdDevolvida = idxQtdDev !== -1 ? parseNumeroSeguro(row[idxQtdDev]) : 0;
      const qtdEsperada = Math.max(0, (qtdRecebida > 0 ? qtdRecebida : qtdEnviada) - qtdDevolvida);

      const unidade = idxUn !== -1 ? String(row[idxUn] || 'UN').trim().toUpperCase() : 'UN';
      const nfEnvio = idxNf !== -1 ? String(row[idxNf] || '').trim() : '';
      const dtEnvio = idxDtEnv !== -1 ? formatarDataExcel(row[idxDtEnv]) : '';
      const valorUnit = idxVal !== -1 ? parseNumeroSeguro(row[idxVal]) : 0;

      const codigos = extrairCodigosPatrimonio([descricao, skuCol, patCol]);
      const cas = extrairCAs([descricao, caCol ? `CA:${caCol}` : '']);
      const normDesc = normalizarTexto(descricao);
      const tokens = extrairTokens(descricao);
      const dimensoes = extrairDimensoes(normDesc);

      itens.push({
        linha_idx: itens.length + 1,
        aba: sheetName,
        linha_excel: r + 1,
        descricao,
        codigo_planilha: patCol || skuCol || (codigos.familiasPTM[0] ? codigos.familiasPTM[0].replace('PTM:', 'PTM-') : (codigos.codigosExatos[0] || '')),
        unidade: unidade || 'UN',
        qtd_enviada: qtdEnviada,
        qtd_devolvida: qtdDevolvida,
        qtd_esperada: qtdEsperada,
        nf_envio: nfEnvio,
        dt_envio: dtEnvio,
        valor_unit: valorUnit,
        codigos,
        cas,
        tokens,
        dimensoes
      });

      countAba++;
    }

    if (countAba > 0) {
      abasLidas.push({ nome: sheetName, total: countAba });
    }
  }

  return { itens, abasLidas };
}

class ConferenciaController {
  /**
   * Tela principal de Conferência / Comparação de Planilha de Inventário
   */
  static async index(req, res) {
    try {
      const produtos = await Produto.findAll();
      res.render('conferencia/index', {
        title: 'Conferência de Planilha de Inventário',
        currentPage: 'conferencia',
        totalProdutosAlmox: (produtos || []).length,
        resultado: null,
        erro: req.query.erro || null
      });
    } catch (error) {
      console.error('Erro ao abrir tela de Conferência:', error);
      res.status(500).render('layouts/erro', {
        title: 'Erro na Conferência',
        currentPage: 'conferencia',
        mensagem: 'Não foi possível carregar a tela de Conferência de Planilha.',
        detalhes: error.message
      });
    }
  }

  /**
   * Recebe a planilha enviada pelo gestor/chefe e cruza de forma inteligente com o almoxarifado
   */
  static async comparar(req, res) {
    try {
      if (!req.file || !req.file.buffer) {
        return res.redirect('/conferencia?erro=' + encodeURIComponent('Selecione uma planilha Excel (.xlsx, .xls ou .csv) para comparar.'));
      }

      const nomeArquivo = req.file.originalname || 'planilha_inventario.xlsx';
      const { itens, abasLidas } = extrairItensDaPlanilha(req.file.buffer);

      if (!itens || itens.length === 0) {
        return res.redirect('/conferencia?erro=' + encodeURIComponent('Não foi possível identificar linhas de itens/descrição na planilha enviada.'));
      }

      const [todosProdutos, emprestimosPendentes] = await Promise.all([
        Produto.findAll(),
        Movimentacao.findEmprestimosPendentes()
      ]);

      // Mapa de empréstimos ativos por produto_id (mostra o que está em campo com técnicos!)
      const emprestadoPorProduto = new Map();
      const colabsEmprestadoPorProduto = new Map();
      for (const emp of (emprestimosPendentes || [])) {
        const pid = String(emp.produto_id);
        emprestadoPorProduto.set(pid, (emprestadoPorProduto.get(pid) || 0) + Number(emp.quantidade || 0));
        if (!colabsEmprestadoPorProduto.has(pid)) colabsEmprestadoPorProduto.set(pid, new Set());
        if (emp.colaborador) colabsEmprestadoPorProduto.get(pid).add(emp.colaborador);
      }

      // Pré-indexa todos os produtos do almoxarifado para comparação ultrarrápida
      const produtosIndexados = (todosProdutos || []).map(p => {
        const cods = extrairCodigosPatrimonio([p.sku, p.tag, p.patrimonio, p.numero_serie, p.nome]);
        const cas = extrairCAs([p.ca ? `CA:${p.ca}` : '', p.nome]);
        const normNome = normalizarTexto(p.nome);
        const tokens = extrairTokens(`${p.nome || ''} ${p.marca || ''}`);
        const dimensoes = extrairDimensoes(normNome);
        const emCampo = emprestadoPorProduto.get(String(p.id)) || 0;
        const emCampoCom = colabsEmprestadoPorProduto.has(String(p.id))
          ? Array.from(colabsEmprestadoPorProduto.get(String(p.id))).join(', ')
          : '';

        return {
          produto: {
            id: p.id,
            sku: p.sku || '',
            nome: p.nome || '',
            categoria: p.categoria || 'Outros',
            marca: p.marca || '',
            quantidade: Number(p.quantidade || 0),
            unidade_medida: p.unidade_medida || 'UN',
            localizacao: p.localizacao || '',
            tag: p.tag || '',
            patrimonio: p.patrimonio || '',
            ca: p.ca || '',
            condicao: p.condicao || 'NOVO',
            em_campo: emCampo,
            em_campo_com: emCampoCom,
            total_posse_obra: Number(p.quantidade || 0) + emCampo
          },
          codigosExatosSet: new Set(cods.codigosExatos),
          familiasPTMSet: new Set(cods.familiasPTM),
          casSet: new Set(cas),
          tokens,
          dimensoes
        };
      });

      // Executa cruzamento inteligente para cada item da planilha
      const comparacoes = itens.map(item => {
        const candidatos = [];

        for (const pIdx of produtosIndexados) {
          const { score, criterio } = calcularSimilaridade(item, pIdx);
          if (score >= 48) {
            candidatos.push({ score, criterio, produto: pIdx.produto });
          }
        }

        candidatos.sort((a, b) => b.score - a.score || b.produto.total_posse_obra - a.produto.total_posse_obra);
        const topCandidatos = candidatos.slice(0, 3);
        const melhor = topCandidatos[0] || null;

        let status = 'NAO_ENCONTRADO';
        let matchProduto = null;
        let matchScore = 0;
        let matchCriterio = 'Sem correspondência no almoxarifado';

        if (melhor && melhor.score >= 75) {
          matchProduto = melhor.produto;
          matchScore = melhor.score;
          matchCriterio = melhor.criterio;

          const totalObra = matchProduto.total_posse_obra;
          if (totalObra <= 0) {
            status = 'ENCONTRADO_ZERADO';
          } else if (item.qtd_esperada > 0 && totalObra < item.qtd_esperada) {
            status = 'ENCONTRADO_DIVERGENTE';
          } else {
            status = 'ENCONTRADO_OK';
          }
        } else if (melhor && melhor.score >= 48) {
          status = 'PARECIDO';
          matchProduto = melhor.produto;
          matchScore = melhor.score;
          matchCriterio = melhor.criterio;
        }

        return {
          linha_idx: item.linha_idx,
          aba: item.aba,
          linha_excel: item.linha_excel,
          descricao: item.descricao,
          codigo_planilha: item.codigo_planilha,
          unidade: item.unidade,
          qtd_enviada: item.qtd_enviada,
          qtd_devolvida: item.qtd_devolvida,
          qtd_esperada: item.qtd_esperada,
          nf_envio: item.nf_envio,
          dt_envio: item.dt_envio,
          valor_unit: item.valor_unit,
          status,
          match_score: matchScore,
          match_criterio: matchCriterio,
          produto_match: matchProduto,
          alternativas: topCandidatos.map(c => ({
            score: c.score,
            criterio: c.criterio,
            produto: c.produto
          }))
        };
      });

      const resumo = {
        totalPlanilha: comparacoes.length,
        encontradosOk: comparacoes.filter(c => c.status === 'ENCONTRADO_OK').length,
        encontradosDivergente: comparacoes.filter(c => c.status === 'ENCONTRADO_DIVERGENTE').length,
        encontradosZerado: comparacoes.filter(c => c.status === 'ENCONTRADO_ZERADO').length,
        parecidos: comparacoes.filter(c => c.status === 'PARECIDO').length,
        naoEncontrados: comparacoes.filter(c => c.status === 'NAO_ENCONTRADO').length
      };

      res.render('conferencia/index', {
        title: `Conferência — ${nomeArquivo}`,
        currentPage: 'conferencia',
        totalProdutosAlmox: (todosProdutos || []).length,
        resultado: {
          nomeArquivo,
          geradoEm: new Date().toLocaleString('pt-BR', { timeZone: process.env.APP_TIMEZONE || 'America/Cuiaba' }),
          emitidoPor: req.user ? req.user.nome : 'Almoxarifado',
          abasLidas,
          resumo,
          comparacoes
        },
        erro: null
      });
    } catch (error) {
      console.error('Erro ao comparar planilha de inventário:', error);
      res.redirect('/conferencia?erro=' + encodeURIComponent('Falha ao processar a planilha: ' + error.message));
    }
  }

  /**
   * Exporta o resultado da conferência (incluindo confirmações manuais) em Excel (.xlsx)
   */
  static exportarExcel(req, res) {
    try {
      const payloadStr = req.body && req.body.dados_json ? req.body.dados_json : '';
      if (!payloadStr) {
        return res.redirect('/conferencia?erro=' + encodeURIComponent('Dados da conferência não encontrados para exportação.'));
      }

      const dados = JSON.parse(payloadStr);
      const itens = Array.isArray(dados.comparacoes) ? dados.comparacoes : [];
      const wb = xlsx.utils.book_new();

      const statusLabel = (s) => ({
        ENCONTRADO_OK: 'ENCONTRADO (OK)',
        ENCONTRADO_DIVERGENTE: 'ENCONTRADO (QTD MENOR)',
        ENCONTRADO_ZERADO: 'CADASTRADO (ZERADO)',
        PARECIDO: 'PARECIDO (REVISAR)',
        NAO_ENCONTRADO: 'NÃO ENCONTRADO'
      }[s] || s);

      const addSheet = (nome, rows, widths) => {
        const safe = rows.length > 0 ? rows : [{ 'Aviso': 'Nenhum registro nesta categoria.' }];
        const ws = xlsx.utils.json_to_sheet(safe);
        if (widths) ws['!cols'] = widths.map(wch => ({ wch }));
        xlsx.utils.book_append_sheet(wb, ws, nome.substring(0, 31));
      };

      const mapRow = (c) => {
        const p = c.produto_match;
        const emEstoque = p ? Number(p.quantidade || 0) : 0;
        const emCampo = p ? Number(p.em_campo || 0) : 0;
        const totalObra = emEstoque + emCampo;
        return {
          'Aba': c.aba || '',
          'Linha': c.linha_excel || '',
          'Situação': statusLabel(c.status),
          'Confiança (%)': c.match_score || 0,
          'Critério do Match': c.match_criterio || '',
          'Código / PTM (Planilha)': c.codigo_planilha || '',
          'Descrição na Planilha (Enviada)': c.descricao || '',
          'Unid.': c.unidade || 'UN',
          'Qtd Enviada': Number(c.qtd_enviada || 0),
          'Qtd Devolvida': Number(c.qtd_devolvida || 0),
          'Qtd Esperada': Number(c.qtd_esperada || 0),
          'NF Envio': c.nf_envio || '',
          'SKU (Almoxarifado)': p ? p.sku : '',
          'TAG / Patrimônio (Almox.)': p ? [p.tag, p.patrimonio].filter(Boolean).join(' / ') : '',
          'Item Encontrado no Sistema': p ? p.nome : '',
          'Saldo em Estoque': p ? emEstoque : 0,
          'Em Campo (Emprestado)': p ? emCampo : 0,
          'Total na Obra (Est + Campo)': p ? totalObra : 0,
          'Diferença (Obra - Esperado)': p ? (totalObra - Number(c.qtd_esperada || 0)) : -Number(c.qtd_esperada || 0),
          'Localização': p ? (p.localizacao || '') : '',
          'Em Posse de': p ? (p.em_campo_com || '') : ''
        };
      };

      const colWidths = [16, 7, 22, 13, 28, 18, 44, 7, 12, 13, 13, 12, 15, 18, 38, 15, 18, 22, 22, 18, 24];

      const resumoRows = [
        { 'Indicador': 'Planilha Conferida', 'Valor': dados.nomeArquivo || 'Inventário' },
        { 'Indicador': 'Emitido Por', 'Valor': dados.emitidoPor || (req.user?.nome || '') },
        { 'Indicador': 'Data / Hora', 'Valor': dados.geradoEm || new Date().toLocaleString('pt-BR') },
        { 'Indicador': '---', 'Valor': '---' },
        { 'Indicador': 'Total de Itens na Planilha', 'Valor': itens.length },
        { 'Indicador': 'Encontrados (Saldo OK)', 'Valor': itens.filter(i => i.status === 'ENCONTRADO_OK').length },
        { 'Indicador': 'Encontrados (Qtd Menor que Enviada)', 'Valor': itens.filter(i => i.status === 'ENCONTRADO_DIVERGENTE').length },
        { 'Indicador': 'Cadastrados porém Zerados (0 un.)', 'Valor': itens.filter(i => i.status === 'ENCONTRADO_ZERADO').length },
        { 'Indicador': 'Parecidos (Revisão Manual)', 'Valor': itens.filter(i => i.status === 'PARECIDO').length },
        { 'Indicador': 'Não Encontrados no Almoxarifado', 'Valor': itens.filter(i => i.status === 'NAO_ENCONTRADO').length }
      ];

      addSheet('Resumo Conferência', resumoRows, [38, 46]);
      addSheet('Conferência Completa', itens.map(mapRow), colWidths);
      addSheet('Ainda Temos (Em Obra)', itens.filter(i => i.status === 'ENCONTRADO_OK' || i.status === 'ENCONTRADO_DIVERGENTE').map(mapRow), colWidths);
      addSheet('Parecidos (Revisar)', itens.filter(i => i.status === 'PARECIDO').map(mapRow), colWidths);
      addSheet('Não Encontrados ou Zerados', itens.filter(i => i.status === 'NAO_ENCONTRADO' || i.status === 'ENCONTRADO_ZERADO').map(mapRow), colWidths);

      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const hoje = new Date().toISOString().split('T')[0];

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="conferencia_inventario_${hoje}.xlsx"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(buffer);
    } catch (error) {
      console.error('Erro ao exportar conferência para Excel:', error);
      res.redirect('/conferencia?erro=' + encodeURIComponent('Erro ao gerar Excel da conferência: ' + error.message));
    }
  }
}

module.exports = ConferenciaController;
module.exports._helpers = {
  normalizarTexto,
  extrairCodigosPatrimonio,
  extrairCAs,
  extrairDimensoes,
  extrairTokens,
  calcularSimilaridade,
  extrairItensDaPlanilha
};
