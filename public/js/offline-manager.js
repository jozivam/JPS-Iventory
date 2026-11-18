/**
 * JPS ALMOXARIFADO - GERENCIADOR OFFLINE-FIRST (CANTEIRO DE OBRA & APK)
 * - Registra o Service Worker (/sw.js) para cache de telas e assets
 * - Armazena movimentações e cadastros feitos sem internet no IndexedDB
 * - Sincroniza automaticamente com o Supabase assim que a internet voltar
 * - Aplica atualização otimista de saldo local enquanto offline
 */

(function () {
  const DB_NAME = 'jps_almoxarifado_offline_db';
  const DB_VERSION = 1;
  const STORE_NAME = 'fila_operacoes';
  const DELTA_STORAGE_KEY = 'jps_offline_stock_deltas';

  let dbPromise = null;
  let isSyncing = false;
  let isCurrentlyOnline = navigator.onLine;
  let uiInitialized = false;

  // =========================================================================
  // 1. REGISTRO DO SERVICE WORKER
  // =========================================================================
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          if (navigator.onLine && reg.active) {
            setTimeout(() => {
              reg.active.postMessage({ type: 'WARM_CACHE' });
            }, 2500);
          }
        })
        .catch((err) => {
          console.warn('[Offline] Aviso ao registrar Service Worker:', err);
        });
    });
  }

  // =========================================================================
  // 2. INDEXEDDB - FILA PERSISTENTE DE OPERAÇÕES OFFLINE
  // =========================================================================
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function addOperacaoFila(op) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).add(op);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function listarFila() {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (_) {
      return [];
    }
  }

  async function atualizarOperacaoFila(op) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put(op);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function removerOperacaoFila(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // =========================================================================
  // 3. AJUSTE OTIMISTA DE SALDO LOCAL (ENQUANTO OFFLINE)
  // =========================================================================
  function getStockDeltas() {
    try {
      return JSON.parse(localStorage.getItem(DELTA_STORAGE_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function saveStockDeltas(deltas) {
    try {
      localStorage.setItem(DELTA_STORAGE_KEY, JSON.stringify(deltas));
    } catch (_) {}
  }

  function registrarDeltaLocal(produtoId, tipo, quantidade) {
    const id = String(produtoId);
    const qtd = parseInt(quantidade, 10) || 0;
    if (!id || qtd <= 0) return;

    let fator = 0;
    if (tipo === 'ENTRADA' || tipo === 'DEVOLUCAO') fator = 1;
    else if (tipo === 'SAIDA' || tipo === 'EMPRESTIMO' || tipo === 'TROCA') fator = -1;
    if (fator === 0) return;

    const deltas = getStockDeltas();
    deltas[id] = (deltas[id] || 0) + fator * qtd;
    saveStockDeltas(deltas);

    // Atualiza imediatamente a lista do Balcão se estiver na tela do Balcão
    if (typeof window.LISTA_PRODUTOS_BALCAO !== 'undefined' && Array.isArray(window.LISTA_PRODUTOS_BALCAO)) {
      const item = window.LISTA_PRODUTOS_BALCAO.find((p) => String(p.id) === id);
      if (item) {
        item.quantidade = Math.max(0, Number(item.quantidade) + fator * qtd);
      }
    }
    if (typeof window.PRODUTOS_MAP !== 'undefined' && window.PRODUTOS_MAP[produtoId]) {
      window.PRODUTOS_MAP[produtoId].quantidade = Math.max(
        0,
        Number(window.PRODUTOS_MAP[produtoId].quantidade) + fator * qtd
      );
    }
  }

  async function recalcularDeltasDaFila() {
    const fila = await listarFila();
    const deltas = {};
    fila.forEach((op) => {
      if (op.action === '/balcao/registrar' && op.fields && op.fields.produto_id) {
        const id = String(op.fields.produto_id);
        const qtd = parseInt(op.fields.quantidade, 10) || 0;
        const tipo = op.fields.tipo;
        let fator = 0;
        if (tipo === 'ENTRADA' || tipo === 'DEVOLUCAO') fator = 1;
        else if (tipo === 'SAIDA' || tipo === 'EMPRESTIMO' || tipo === 'TROCA') fator = -1;
        if (fator !== 0 && qtd > 0) {
          deltas[id] = (deltas[id] || 0) + fator * qtd;
        }
      }
    });
    saveStockDeltas(deltas);
  }

  // =========================================================================
  // 4. VERIFICAÇÃO REAL DE CONECTIVIDADE (PING)
  // =========================================================================
  async function verificarConexaoReal() {
    if (!navigator.onLine) {
      isCurrentlyOnline = false;
      return false;
    }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3500);
      const resp = await fetch('/api/offline/ping?t=' + Date.now(), {
        method: 'GET',
        cache: 'no-store',
        signal: ctrl.signal
      });
      clearTimeout(timer);
      isCurrentlyOnline = !!(resp && resp.ok);
      return isCurrentlyOnline;
    } catch (_) {
      isCurrentlyOnline = false;
      return false;
    }
  }

  // =========================================================================
  // 5. INTERFACE VISUAL (BARRA DE STATUS + TOAST + MODAL DA FILA)
  // =========================================================================
  function criarUI() {
    if (uiInitialized) return;
    uiInitialized = true;

    // Banner fixo no topo da área de conteúdo
    const banner = document.createElement('div');
    banner.id = 'jps-offline-banner';
    banner.className = 'hide-on-print';
    banner.style.cssText =
      'display:none;margin-bottom:1rem;padding:0.75rem 1rem;border-radius:10px;font-size:0.84rem;font-weight:600;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;box-shadow:0 2px 8px rgba(0,0,0,0.06);';
    banner.innerHTML = `
      <div id="jps-offline-banner-msg" style="display:flex;align-items:center;gap:0.55rem;flex:1;min-width:220px;"></div>
      <div id="jps-offline-banner-actions" style="display:flex;align-items:center;gap:0.45rem;flex-wrap:wrap;"></div>
    `;

    const pageContent = document.querySelector('.page-content');
    if (pageContent) {
      pageContent.insertBefore(banner, pageContent.firstChild);
    } else {
      document.body.insertBefore(banner, document.body.firstChild);
    }

    // Toast flutuante para avisos rápidos offline/sync
    const toast = document.createElement('div');
    toast.id = 'jps-offline-toast';
    toast.style.cssText =
      'display:none;position:fixed;bottom:82px;right:16px;left:16px;max-width:460px;margin:0 auto;z-index:9999;padding:0.85rem 1rem;border-radius:10px;color:#fff;font-size:0.85rem;font-weight:600;box-shadow:0 10px 28px rgba(0,0,0,0.22);align-items:center;gap:0.65rem;';
    document.body.appendChild(toast);

    // Modal da Fila Offline
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modal-fila-offline';
    modal.innerHTML = `
      <div class="modal-container" style="max-width:620px;width:95%;">
        <div class="modal-header">
          <h3 style="font-size:1.05rem;color:var(--text-main);display:flex;align-items:center;gap:0.5rem;margin:0;">
            <i class="fa-solid fa-cloud-arrow-up" style="color:var(--primary);"></i>
            Fila de Sincronização Offline
          </h3>
          <button type="button" class="btn btn-secondary btn-icon" onclick="window.fecharModal('modal-fila-offline')">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="modal-body" style="max-height:60vh;overflow-y:auto;">
          <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:0.85rem;">
            Estes registros foram salvos no aparelho durante queda ou instabilidade de internet e serão enviados automaticamente ao servidor na ordem abaixo.
          </p>
          <div id="lista-fila-offline-itens"></div>
        </div>
        <div class="modal-footer" style="background:var(--bg-surface);display:flex;justify-content:space-between;gap:0.5rem;flex-wrap:wrap;">
          <button type="button" class="btn btn-outline btn-sm" onclick="window.fecharModal('modal-fila-offline')">Fechar</button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-sync-fila-modal" onclick="window.JPSOffline.sincronizarAgora(true)">
            <i class="fa-solid fa-rotate"></i> Sincronizar Agora
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  let toastTimer = null;
  function mostrarToast(msg, tipo = 'info') {
    criarUI();
    const toast = document.getElementById('jps-offline-toast');
    if (!toast) return;
    const cores = {
      success: '#047857',
      warning: '#B45309',
      danger: '#B91C1C',
      info: '#3730A3'
    };
    toast.style.background = cores[tipo] || cores.info;
    toast.innerHTML = `<i class="fa-solid ${
      tipo === 'success'
        ? 'fa-circle-check'
        : tipo === 'warning'
        ? 'fa-wifi'
        : tipo === 'danger'
        ? 'fa-circle-exclamation'
        : 'fa-cloud-arrow-up'
    }" style="font-size:1.1rem;flex-shrink:0;"></i><span style="flex:1;line-height:1.35;">${msg}</span>`;
    toast.style.display = 'flex';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.style.display = 'none';
    }, 5500);
  }

  async function atualizarBanner() {
    criarUI();
    const banner = document.getElementById('jps-offline-banner');
    const msgEl = document.getElementById('jps-offline-banner-msg');
    const actEl = document.getElementById('jps-offline-banner-actions');
    if (!banner || !msgEl || !actEl) return;

    const fila = await listarFila();
    const qtdFila = fila.length;
    const qtdConflitos = fila.filter((f) => f.status === 'CONFLITO').length;

    if (isCurrentlyOnline && qtdFila === 0) {
      banner.style.display = 'none';
      return;
    }

    banner.style.display = 'flex';

    if (!isCurrentlyOnline) {
      banner.style.background = '#FEF3C7';
      banner.style.border = '1px solid #F59E0B';
      banner.style.color = '#92400E';
      msgEl.innerHTML = `
        <i class="fa-solid fa-wifi" style="color:#D97706;"></i>
        <span><strong>Modo Offline Ativo</strong> — Consultas e movimentações continuam funcionando. ${
          qtdFila > 0 ? `<strong>${qtdFila} registro(s)</strong> salvos no aparelho aguardando sinal.` : 'Seus lançamentos serão salvos no aparelho.'
        }</span>
      `;
      actEl.innerHTML =
        qtdFila > 0
          ? `<button type="button" class="btn btn-sm" style="background:#D97706;color:#fff;border:none;font-weight:700;" onclick="window.JPSOffline.abrirModalFila()"><i class="fa-solid fa-list-check"></i> Ver Fila (${qtdFila})</button>`
          : `<button type="button" class="btn btn-sm btn-outline" style="border-color:#D97706;color:#92400E;background:#fff;" onclick="window.JPSOffline.testarConexao()"><i class="fa-solid fa-rotate"></i> Reconectar</button>`;
    } else {
      // Online, mas com itens pendentes ou conflitos na fila
      banner.style.background = qtdConflitos > 0 ? '#FEE2E2' : '#EEF2FF';
      banner.style.border = qtdConflitos > 0 ? '1px solid #F87171' : '1px solid #C7D2FE';
      banner.style.color = qtdConflitos > 0 ? '#991B1B' : '#3730A3';
      msgEl.innerHTML = `
        <i class="fa-solid ${isSyncing ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}"></i>
        <span>${
          isSyncing
            ? `Sincronizando ${qtdFila} registro(s) com o servidor...`
            : qtdConflitos > 0
            ? `<strong>${qtdConflitos} registro(s)</strong> da fila offline precisam de revisão (${qtdFila} no total).`
            : `Conexão restabelecida! <strong>${qtdFila} registro(s)</strong> aguardando envio.`
        }</span>
      `;
      actEl.innerHTML = `
        <button type="button" class="btn btn-sm btn-outline" style="background:#fff;" onclick="window.JPSOffline.abrirModalFila()">
          <i class="fa-solid fa-list-check"></i> Ver Fila (${qtdFila})
        </button>
        <button type="button" class="btn btn-sm btn-primary" ${isSyncing ? 'disabled' : ''} onclick="window.JPSOffline.sincronizarAgora(true)">
          <i class="fa-solid fa-rotate"></i> Sincronizar Agora
        </button>
      `;
    }
  }

  async function renderizarModalFila() {
    const container = document.getElementById('lista-fila-offline-itens');
    if (!container) return;
    const fila = await listarFila();

    if (fila.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:2rem 1rem;color:var(--text-muted);">
          <i class="fa-solid fa-circle-check" style="font-size:2rem;color:#10B981;display:block;margin-bottom:0.5rem;"></i>
          Todos os registros já foram sincronizados com o servidor!
        </div>
      `;
      return;
    }

    container.innerHTML = fila
      .map((op) => {
        const hora = window.formatarDataHoraCliente
          ? window.formatarDataHoraCliente(op.created_at)
          : op.created_at;
        const isConflito = op.status === 'CONFLITO';
        return `
          <div style="border:1px solid ${isConflito ? '#FCA5A5' : 'var(--border-color)'};background:${
          isConflito ? '#FEF2F2' : '#fff'
        };border-radius:8px;padding:0.75rem 0.9rem;margin-bottom:0.65rem;display:flex;justify-content:space-between;align-items:flex-start;gap:0.75rem;">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:0.86rem;color:var(--text-main);">${op.resumo}</div>
              <div style="font-size:0.74rem;color:var(--text-muted);margin-top:3px;">
                <i class="fa-regular fa-clock"></i> ${hora} •
                <span style="font-weight:700;color:${isConflito ? '#B91C1C' : '#D97706'};">
                  ${isConflito ? '⚠️ Conflito / Erro no servidor' : '⏳ Aguardando envio'}
                </span>
              </div>
              ${
                op.erro
                  ? `<div style="font-size:0.76rem;color:#B91C1C;margin-top:4px;background:#FEE2E2;padding:4px 8px;border-radius:4px;">${op.erro}</div>`
                  : ''
              }
            </div>
            <button type="button" class="btn btn-sm btn-outline" style="color:var(--danger);border-color:#FCA5A5;padding:0.25rem 0.5rem;" title="Descartar este registro da fila" onclick="window.JPSOffline.descartarItem(${
              op.id
            })">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        `;
      })
      .join('');
  }

  // =========================================================================
  // 6. SINCRONIZAÇÃO DA FILA COM O SERVIDOR
  // =========================================================================
  async function sincronizarAgora(manual = false) {
    if (isSyncing) return;
    const fila = await listarFila();
    if (fila.length === 0) {
      if (manual) mostrarToast('Não há registros pendentes na fila offline.', 'success');
      await atualizarBanner();
      return;
    }

    const online = await verificarConexaoReal();
    if (!online) {
      if (manual) mostrarToast('Ainda sem conexão com o servidor. Tente novamente quando o sinal voltar.', 'warning');
      await atualizarBanner();
      return;
    }

    isSyncing = true;
    await atualizarBanner();

    let enviados = 0;
    let conflitos = 0;

    for (const op of fila) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 12000);
        const resp = await fetch('/api/offline/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: op.action,
            fields: op.fields,
            created_at: op.created_at
          }),
          signal: ctrl.signal
        });
        clearTimeout(timer);

        const data = await resp.json().catch(() => ({}));

        if (resp.ok && data.ok) {
          await removerOperacaoFila(op.id);
          enviados++;
        } else if (resp.status >= 400 && resp.status < 500) {
          // Conflito de regra de negócio (ex: produto zerou no servidor)
          op.status = 'CONFLITO';
          op.erro = data.erro || 'Não foi possível aplicar este lançamento no servidor.';
          await atualizarOperacaoFila(op);
          conflitos++;
        } else {
          // Erro temporário de servidor (5xx) -> para a fila e tenta depois
          break;
        }
      } catch (_) {
        // Queda de rede no meio da sincronização
        isCurrentlyOnline = false;
        break;
      }
    }

    await recalcularDeltasDaFila();
    isSyncing = false;
    await atualizarBanner();
    await renderizarModalFila();

    if (enviados > 0) {
      mostrarToast(
        `${enviados} registro(s) offline sincronizado(s) com sucesso no servidor!${
          conflitos > 0 ? ` (${conflitos} com conflito para revisar)` : ''
        }`,
        conflitos > 0 ? 'warning' : 'success'
      );

      // Atualiza o cache do Service Worker e recarrega se não houver conflito aberto
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'WARM_CACHE' });
      }
      if (conflitos === 0) {
        setTimeout(() => {
          const modal = document.getElementById('modal-fila-offline');
          if (!modal || modal.style.display === 'none') {
            window.location.reload();
          }
        }, 1600);
      }
    } else if (conflitos > 0 && manual) {
      mostrarToast(`${conflitos} item(ns) com conflito. Clique em "Ver Fila" para detalhes.`, 'danger');
    }
  }

  // =========================================================================
  // 7. INTERCEPTAÇÃO DE FORMULÁRIOS PARA FUNCIONAMENTO OFFLINE SEM TRAVAR
  // =========================================================================
  function isRotaSuportadaOffline(pathname) {
    return (
      pathname === '/balcao/registrar' ||
      /^\/balcao\/devolver\/\d+$/.test(pathname) ||
      pathname === '/produtos' ||
      /^\/produtos\/\d+\/editar$/.test(pathname) ||
      pathname === '/colaboradores'
    );
  }

  function montarResumoOperacao(pathname, fields) {
    if (pathname === '/balcao/registrar') {
      const prodInput = document.getElementById('balcao-produto-busca');
      const nomeProd =
        (prodInput && prodInput.value.trim()) ||
        (fields.produto_id ? `Produto #${fields.produto_id}` : 'Item');
      const colab = fields.colaborador ? ` → ${fields.colaborador}` : '';
      return `${fields.tipo || 'MOV'} • ${fields.quantidade || 1} UN • ${nomeProd}${colab}`;
    }
    if (/^\/balcao\/devolver\/\d+$/.test(pathname)) {
      return `DEVOLUÇÃO • Empréstimo #${pathname.split('/').pop()}`;
    }
    if (pathname === '/produtos') {
      return `NOVO PRODUTO • ${fields.nome || 'Sem nome'} (${fields.quantidade || 0} ${fields.unidade_medida || 'UN'})`;
    }
    if (/^\/produtos\/\d+\/editar$/.test(pathname)) {
      return `EDITAR PRODUTO • ${fields.nome || '#' + pathname.split('/')[2]}`;
    }
    if (pathname === '/colaboradores') {
      return `NOVO COLABORADOR • ${fields.nome || 'Sem nome'}`;
    }
    return `OPERAÇÃO • ${pathname}`;
  }

  async function salvarNaFilaEAtualizarUI(pathname, fields, form) {
    // Validação local no Balcão para evitar baixar item zerado offline
    if (
      pathname === '/balcao/registrar' &&
      (fields.tipo === 'SAIDA' || fields.tipo === 'EMPRESTIMO' || fields.tipo === 'TROCA') &&
      typeof window.LISTA_PRODUTOS_BALCAO !== 'undefined'
    ) {
      const prod = window.LISTA_PRODUTOS_BALCAO.find((p) => String(p.id) === String(fields.produto_id));
      const qtd = parseInt(fields.quantidade, 10) || 0;
      if (prod && Number(prod.quantidade) < qtd) {
        mostrarToast(
          `Saldo local insuficiente para "${prod.nome}" (Disponível: ${prod.quantidade}).`,
          'danger'
        );
        return;
      }
    }

    const resumo = montarResumoOperacao(pathname, fields);

    await addOperacaoFila({
      action: pathname,
      fields,
      resumo,
      created_at: new Date().toISOString(),
      status: 'PENDENTE',
      erro: null
    });

    if (pathname === '/balcao/registrar') {
      registrarDeltaLocal(fields.produto_id, fields.tipo, fields.quantidade);
      // Limpa os campos principais do Balcão para agilizar o próximo atendimento na obra
      const prodSearch = document.getElementById('balcao-produto-busca');
      const prodHidden = document.getElementById('balcao-produto-id');
      const qtdInput = document.getElementById('balcao-quantidade-input');
      const boxDetalhe = document.getElementById('detalhe-produto-box');
      if (prodSearch) prodSearch.value = '';
      if (prodHidden) prodHidden.value = '';
      if (qtdInput) qtdInput.value = '1';
      if (boxDetalhe) boxDetalhe.style.display = 'none';
    } else if (pathname === '/produtos' || pathname === '/colaboradores') {
      form.reset();
    }

    // Fecha modais abertos se for edição/cadastro em modal
    if (form.closest('.modal-overlay')) {
      const modalEl = form.closest('.modal-overlay');
      if (modalEl && modalEl.id && window.fecharModal) {
        window.fecharModal(modalEl.id);
      }
    }

    await atualizarBanner();
    mostrarToast(
      `Salvo no aparelho (Modo Offline): ${resumo}. Será sincronizado quando a internet voltar.`,
      'warning'
    );
  }

  document.addEventListener(
    'submit',
    async (event) => {
      const form = event.target;
      if (!form || form.tagName !== 'FORM') return;
      if ((form.method || 'GET').toUpperCase() !== 'POST') return;
      if ((form.enctype || '').toLowerCase().includes('multipart')) return;

      const actionUrl = new URL(form.action || window.location.href, window.location.origin);
      const pathname = actionUrl.pathname;
      if (!isRotaSuportadaOffline(pathname)) return;

      // Verifica se já está validado pelo HTML5
      if (typeof form.checkValidity === 'function' && !form.checkValidity()) return;

      event.preventDefault();

      const fd = new FormData(form);
      const fields = {};
      fd.forEach((value, key) => {
        fields[key] = value;
      });

      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';
      }

      const restaurarBotao = () => {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnHtml;
        }
      };

      // Se já sabe que está offline -> salva direto no IndexedDB sem travar!
      if (!navigator.onLine || !isCurrentlyOnline) {
        await salvarNaFilaEAtualizarUI(pathname, fields, form);
        restaurarBotao();
        return;
      }

      // Online: envia via API com timeout de 7s. Se o sinal cair no meio -> salva na fila offline!
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 7000);
        const resp = await fetch('/api/offline/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: pathname,
            fields,
            created_at: new Date().toISOString()
          }),
          signal: ctrl.signal
        });
        clearTimeout(timer);

        const data = await resp.json().catch(() => ({}));

        if (resp.ok && data.ok) {
          // Atualiza o cache do SW em segundo plano e recarrega com aviso de sucesso
          const destino = pathname.startsWith('/balcao')
            ? '/balcao'
            : pathname.startsWith('/colaboradores')
            ? '/colaboradores'
            : '/produtos';
          window.location.href = destino + '?sucesso=' + encodeURIComponent(data.mensagem || 'Operação realizada com sucesso!');
          return;
        }

        if (resp.status >= 400 && resp.status < 500) {
          // Erro de validação real do servidor (ex: estoque zerado, SKU duplicado)
          restaurarBotao();
          mostrarToast(data.erro || 'Não foi possível concluir a operação.', 'danger');
          return;
        }

        // Erro 5xx / instabilidade -> salva na fila offline para não perder o lançamento
        isCurrentlyOnline = false;
        await salvarNaFilaEAtualizarUI(pathname, fields, form);
        restaurarBotao();
      } catch (_) {
        // Queda de rede ou timeout de 7s -> salva na fila offline sem perder nada!
        isCurrentlyOnline = false;
        await salvarNaFilaEAtualizarUI(pathname, fields, form);
        restaurarBotao();
      }
    },
    true
  );

  // =========================================================================
  // 8. EVENTOS DE REDE (NAVEGADOR + APK ANDROID)
  // =========================================================================
  window.addEventListener('online', async () => {
    const ok = await verificarConexaoReal();
    await atualizarBanner();
    if (ok) {
      setTimeout(() => sincronizarAgora(false), 1200);
    }
  });

  window.addEventListener('offline', async () => {
    isCurrentlyOnline = false;
    await atualizarBanner();
  });

  // Evento customizado disparado pelo APK Android nativo (ConnectivityManager)
  window.addEventListener('jps-network-change', async (e) => {
    const online = e.detail && e.detail.online;
    isCurrentlyOnline = !!online;
    await atualizarBanner();
    if (online) {
      setTimeout(() => sincronizarAgora(false), 1500);
    }
  });

  // Inicialização ao abrir a página
  document.addEventListener('DOMContentLoaded', async () => {
    criarUI();

    // Aplica deltas pendentes da fila offline aos saldos em memória (Balcão/Inventário)
    const deltas = getStockDeltas();
    if (deltas && Object.keys(deltas).length > 0) {
      if (typeof window.LISTA_PRODUTOS_BALCAO !== 'undefined' && Array.isArray(window.LISTA_PRODUTOS_BALCAO)) {
        window.LISTA_PRODUTOS_BALCAO.forEach((p) => {
          const d = deltas[String(p.id)];
          if (d) p.quantidade = Math.max(0, Number(p.quantidade) + d);
        });
      }
      if (typeof window.PRODUTOS_MAP !== 'undefined') {
        Object.keys(deltas).forEach((id) => {
          if (window.PRODUTOS_MAP[id]) {
            window.PRODUTOS_MAP[id].quantidade = Math.max(
              0,
              Number(window.PRODUTOS_MAP[id].quantidade) + deltas[id]
            );
          }
        });
      }
    }

    await verificarConexaoReal();
    await atualizarBanner();

    const fila = await listarFila();
    if (isCurrentlyOnline && fila.length > 0) {
      setTimeout(() => sincronizarAgora(false), 1500);
    }

    // Verificação periódica suave a cada 25s caso haja itens na fila
    setInterval(async () => {
      const pendentes = await listarFila();
      if (pendentes.length > 0 && !isSyncing) {
        const ok = await verificarConexaoReal();
        await atualizarBanner();
        if (ok) sincronizarAgora(false);
      }
    }, 25000);
  });

  // API pública no escopo global
  window.JPSOffline = {
    sincronizarAgora,
    abrirModalFila: async () => {
      criarUI();
      await renderizarModalFila();
      if (window.abrirModal) window.abrirModal('modal-fila-offline');
    },
    descartarItem: async (id) => {
      await removerOperacaoFila(id);
      await recalcularDeltasDaFila();
      await renderizarModalFila();
      await atualizarBanner();
      mostrarToast('Registro removido da fila offline.', 'info');
    },
    testarConexao: async () => {
      const ok = await verificarConexaoReal();
      await atualizarBanner();
      if (ok) {
        mostrarToast('Conexão com o servidor restabelecida!', 'success');
        sincronizarAgora(false);
      } else {
        mostrarToast('Ainda sem acesso ao servidor. Continuando em modo offline.', 'warning');
      }
    }
  };
})();
