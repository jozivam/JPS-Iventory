/**
 * JPS ALMOXARIFADO - ASSINATURA DIGITAL INTERATIVA (APP / MOBILE / DESKTOP)
 * Permite clicar ou tocar no campo de assinatura da Ficha do Colaborador
 * para assinar com dedo, caneta touch ou mouse, salvando no servidor e no PDF.
 */
(function () {
  if (window.__JPS_ASSINATURA_LOADED__) return;
  window.__JPS_ASSINATURA_LOADED__ = true;

  function injectStyles() {
    if (document.getElementById('jps-assinatura-styles')) return;
    const style = document.createElement('style');
    style.id = 'jps-assinatura-styles';
    style.textContent = `
      .sig-box-interactive {
        position: relative;
        min-height: 92px;
        width: 90%;
        margin: 0 auto 0.35rem auto;
        border: 1.5px dashed #cbd5e1;
        border-radius: 10px;
        background: #f8fafc;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 0.45rem 0.65rem;
        cursor: pointer;
        transition: all 0.18s ease;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      .sig-box-interactive:hover {
        border-color: #4f46e5;
        background: #eef2ff;
        box-shadow: 0 4px 12px rgba(79, 70, 229, 0.12);
      }
      .sig-box-interactive.sig-signed {
        border-style: solid;
        border-color: #a7f3d0;
        background: #ffffff;
      }
      .sig-box-interactive.sig-readonly {
        cursor: default;
        pointer-events: none;
      }
      .sig-preview-img {
        max-height: 76px;
        max-width: 100%;
        object-fit: contain;
        display: block;
      }
      .sig-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
        color: #64748b;
        font-size: 0.78rem;
        font-weight: 600;
      }
      .sig-placeholder i {
        font-size: 1.15rem;
        color: #4f46e5;
      }
      .sig-edit-badge {
        position: absolute;
        top: 6px;
        right: 6px;
        font-size: 0.68rem;
        font-weight: 700;
        background: #eef2ff;
        color: #4338ca;
        border: 1px solid #c7d2fe;
        border-radius: 999px;
        padding: 2px 8px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .sig-meta-signed {
        font-size: 0.7rem;
        color: #059669;
        font-weight: 700;
        margin-top: 3px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      /* Modal Fullscreen / Responsivo de Assinatura */
      .sig-modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(15, 23, 42, 0.72);
        backdrop-filter: blur(4px);
        display: none;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        overscroll-behavior: contain;
      }
      .sig-modal-overlay.open {
        display: flex;
      }
      .sig-modal-card {
        width: 100%;
        max-width: 720px;
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.35);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        max-height: 95vh;
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      }
      .sig-modal-header {
        padding: 1rem 1.25rem;
        background: #0f172a;
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .sig-modal-header h3 {
        margin: 0;
        font-size: 1rem;
        font-weight: 800;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .sig-modal-subtitle {
        font-size: 0.76rem;
        color: #cbd5e1;
        margin-top: 2px;
      }
      .sig-modal-close {
        width: 34px;
        height: 34px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
        font-size: 1rem;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .sig-modal-body {
        padding: 1rem 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
        overflow-y: auto;
      }
      .sig-extra-field {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      .sig-extra-field label {
        font-size: 0.78rem;
        font-weight: 700;
        color: #334155;
      }
      .sig-extra-field input {
        width: 100%;
        height: 40px;
        padding: 0 0.85rem;
        border: 1.5px solid #cbd5e1;
        border-radius: 8px;
        font-size: 0.88rem;
        font-family: inherit;
        color: #0f172a;
        background: #f8fafc;
      }
      .sig-extra-field input:focus {
        outline: none;
        border-color: #4f46e5;
        background: #ffffff;
      }
      .sig-canvas-wrap {
        position: relative;
        width: 100%;
        height: 250px;
        border: 2px solid #cbd5e1;
        border-radius: 12px;
        background: #ffffff;
        overflow: hidden;
        touch-action: none;
        box-shadow: inset 0 2px 6px rgba(15, 23, 42, 0.04);
      }
      .sig-canvas-guide {
        position: absolute;
        left: 7%;
        right: 7%;
        bottom: 46px;
        border-bottom: 1.5px dashed #cbd5e1;
        pointer-events: none;
      }
      .sig-canvas-hint {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 18px;
        text-align: center;
        font-size: 0.74rem;
        font-weight: 600;
        color: #94a3b8;
        pointer-events: none;
      }
      .sig-canvas {
        width: 100%;
        height: 100%;
        display: block;
        cursor: crosshair;
        touch-action: none;
      }
      .sig-modal-status {
        font-size: 0.78rem;
        font-weight: 600;
        padding: 0.55rem 0.8rem;
        border-radius: 8px;
        display: none;
      }
      .sig-modal-status.error {
        display: block;
        background: #fee2e2;
        color: #b91c1c;
        border: 1px solid #fecaca;
      }
      .sig-modal-status.info {
        display: block;
        background: #fef3c7;
        color: #92400e;
        border: 1px solid #fde68a;
      }
      .sig-modal-footer {
        padding: 0.9rem 1.25rem;
        background: #f8fafc;
        border-top: 1px solid #e2e8f0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.6rem;
        flex-wrap: wrap;
      }
      .sig-btn-group {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .sig-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.45rem;
        height: 40px;
        padding: 0 1rem;
        border-radius: 9px;
        font-size: 0.83rem;
        font-weight: 700;
        font-family: inherit;
        cursor: pointer;
        border: 1.5px solid transparent;
        transition: all 0.15s ease;
      }
      .sig-btn-clear {
        background: #ffffff;
        border-color: #cbd5e1;
        color: #334155;
      }
      .sig-btn-danger {
        background: #fef2f2;
        border-color: #fecaca;
        color: #dc2626;
      }
      .sig-btn-save {
        background: #4f46e5;
        color: #ffffff;
      }
      .sig-btn-save:hover {
        background: #4338ca;
      }
      .sig-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      @media (max-width: 640px) {
        .sig-modal-overlay {
          padding: 0;
          align-items: stretch;
        }
        .sig-modal-card {
          max-width: 100%;
          max-height: 100vh;
          height: 100%;
          border-radius: 0;
        }
        .sig-modal-body {
          flex: 1;
        }
        .sig-canvas-wrap {
          flex: 1;
          min-height: 240px;
          height: auto;
        }
        .sig-modal-footer {
          flex-direction: column;
          align-items: stretch;
        }
        .sig-btn-group {
          width: 100%;
        }
        .sig-btn-group .sig-btn {
          flex: 1;
        }
      }

      @media print {
        .sig-modal-overlay,
        .sig-edit-badge,
        .sig-placeholder {
          display: none !important;
        }
        .sig-box-interactive {
          border: none !important;
          background: transparent !important;
          min-height: 62px !important;
          padding: 0 !important;
          box-shadow: none !important;
        }
        .sig-preview-img {
          max-height: 68px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (document.getElementById('jps-sig-modal')) return;
    const div = document.createElement('div');
    div.id = 'jps-sig-modal';
    div.className = 'sig-modal-overlay';
    div.innerHTML = `
      <div class="sig-modal-card" role="dialog" aria-modal="true" aria-labelledby="sig-modal-title">
        <div class="sig-modal-header">
          <div>
            <h3 id="sig-modal-title"><i class="fa-solid fa-signature"></i> Assinatura Digital</h3>
            <div class="sig-modal-subtitle" id="sig-modal-subtitle">Use o dedo, caneta touch ou mouse para assinar abaixo.</div>
          </div>
          <button type="button" class="sig-modal-close" id="sig-btn-close" title="Fechar">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="sig-modal-body">
          <div class="sig-extra-field" id="sig-cpf-wrap" style="display: none;">
            <label for="sig-input-cpf">CPF ou RG do Colaborador (opcional — aparece no PDF)</label>
            <input type="text" id="sig-input-cpf" placeholder="Ex: 000.000.000-00" autocomplete="off">
          </div>

          <div class="sig-extra-field" id="sig-resp-wrap" style="display: none;">
            <label for="sig-input-resp">Nome do Responsável pela Entrega / Almoxarifado</label>
            <input type="text" id="sig-input-resp" placeholder="Ex: Jozivam Silva" autocomplete="off">
          </div>

          <div class="sig-canvas-wrap" id="sig-canvas-wrap">
            <canvas class="sig-canvas" id="sig-canvas"></canvas>
            <div class="sig-canvas-guide"></div>
            <div class="sig-canvas-hint">Assine acima da linha pontilhada</div>
          </div>

          <div class="sig-modal-status" id="sig-modal-status"></div>
        </div>

        <div class="sig-modal-footer">
          <div class="sig-btn-group">
            <button type="button" class="sig-btn sig-btn-clear" id="sig-btn-clear">
              <i class="fa-solid fa-eraser"></i> Limpar
            </button>
            <button type="button" class="sig-btn sig-btn-danger" id="sig-btn-remove" style="display: none;">
              <i class="fa-solid fa-trash-can"></i> Remover Assinatura
            </button>
          </div>
          <div class="sig-btn-group">
            <button type="button" class="sig-btn sig-btn-clear" id="sig-btn-cancel">
              Cancelar
            </button>
            <button type="button" class="sig-btn sig-btn-save" id="sig-btn-confirm">
              <i class="fa-solid fa-check"></i> Confirmar Assinatura
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(div);
  }

  window.initFichaAssinatura = function (config) {
    if (!config || !config.colaboradorId) return;
    injectStyles();
    ensureModal();

    const STORAGE_KEY = 'jps_ficha_sig_' + config.colaboradorId;
    const podeAssinar = config.podeAssinar !== false;

    const state = {
      papelAtual: null,
      desenhando: false,
      temTraco: false,
      ultimoPonto: null,
      assinaturas: {
        COLABORADOR: {
          img: config.assinaturaColaborador || null,
          em: config.assinaturaColaboradorEm || null,
          cpf_rg: config.cpfRg || ''
        },
        RESPONSAVEL: {
          img: config.assinaturaResponsavel || null,
          em: config.assinaturaResponsavelEm || null,
          nome: config.assinaturaResponsavelNome || config.responsavelPadrao || 'Gestão de Almoxarifado'
        }
      }
    };

    // Mescla fallback local apenas se o banco ainda não retornou assinatura (ex: antes da migração SQL ou offline)
    try {
      const localRaw = localStorage.getItem(STORAGE_KEY);
      if (localRaw) {
        const local = JSON.parse(localRaw);
        if (!state.assinaturas.COLABORADOR.img && local.COLABORADOR && local.COLABORADOR.img) {
          state.assinaturas.COLABORADOR = { ...state.assinaturas.COLABORADOR, ...local.COLABORADOR };
        }
        if (!state.assinaturas.RESPONSAVEL.img && local.RESPONSAVEL && local.RESPONSAVEL.img) {
          state.assinaturas.RESPONSAVEL = { ...state.assinaturas.RESPONSAVEL, ...local.RESPONSAVEL };
        }
      }
    } catch (_) {}

    function salvarLocal() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.assinaturas));
      } catch (_) {}
    }

    function atualizarBoxUI(papel) {
      const box = document.querySelector(`[data-assinatura-box="${papel}"]`);
      if (!box) return;
      const dados = state.assinaturas[papel];

      if (!podeAssinar) {
        box.classList.add('sig-readonly');
      }

      if (dados && dados.img) {
        box.classList.add('sig-signed');
        box.innerHTML = `
          <img src="${dados.img}" alt="Assinatura Digital" class="sig-preview-img">
          ${podeAssinar ? '<span class="sig-edit-badge"><i class="fa-solid fa-pen"></i> Refazer</span>' : ''}
        `;
      } else {
        box.classList.remove('sig-signed');
        box.innerHTML = podeAssinar
          ? `<div class="sig-placeholder">
               <i class="fa-solid fa-signature"></i>
               <span>Clique ou toque aqui para assinar</span>
             </div>`
          : '';
      }

      // Atualiza metadados de data/hora, CPF/RG e nome do responsável
      if (papel === 'COLABORADOR') {
        const cpfEl = document.getElementById('ficha-cpf-rg-texto');
        if (cpfEl) {
          cpfEl.textContent = dados.cpf_rg ? dados.cpf_rg : '___________________';
        }
        const metaEl = document.getElementById('sig-meta-COLABORADOR');
        if (metaEl) {
          metaEl.innerHTML = dados.img
            ? `<i class="fa-solid fa-circle-check"></i> Assinado digitalmente${dados.em ? ' em ' + dados.em : ''}`
            : '';
        }
      } else {
        const respNomeEl = document.getElementById('ficha-responsavel-nome');
        if (respNomeEl && dados.nome) {
          respNomeEl.textContent = dados.nome;
        }
        const metaEl = document.getElementById('sig-meta-RESPONSAVEL');
        if (metaEl) {
          metaEl.innerHTML = dados.img
            ? `<i class="fa-solid fa-circle-check"></i> Assinado digitalmente${dados.em ? ' em ' + dados.em : ''}`
            : '';
        }
      }
    }

    // Inicializa ambos os campos na página
    atualizarBoxUI('COLABORADOR');
    atualizarBoxUI('RESPONSAVEL');

    // Referências do Modal
    const modal = document.getElementById('jps-sig-modal');
    const canvasWrap = document.getElementById('sig-canvas-wrap');
    const canvas = document.getElementById('sig-canvas');
    const ctx = canvas.getContext('2d');
    const titleEl = document.getElementById('sig-modal-title');
    const subtitleEl = document.getElementById('sig-modal-subtitle');
    const cpfWrap = document.getElementById('sig-cpf-wrap');
    const cpfInput = document.getElementById('sig-input-cpf');
    const respWrap = document.getElementById('sig-resp-wrap');
    const respInput = document.getElementById('sig-input-resp');
    const statusEl = document.getElementById('sig-modal-status');
    const btnClear = document.getElementById('sig-btn-clear');
    const btnRemove = document.getElementById('sig-btn-remove');
    const btnCancel = document.getElementById('sig-btn-cancel');
    const btnClose = document.getElementById('sig-btn-close');
    const btnConfirm = document.getElementById('sig-btn-confirm');

    function setStatus(msg, tipo) {
      if (!msg) {
        statusEl.className = 'sig-modal-status';
        statusEl.textContent = '';
        return;
      }
      statusEl.className = 'sig-modal-status ' + (tipo || 'info');
      statusEl.textContent = msg;
    }

    function prepararCanvas() {
      const rect = canvasWrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      canvas.width = Math.max(300, Math.floor(rect.width * dpr));
      canvas.height = Math.max(180, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.6;
      state.temTraco = false;
      state.desenhando = false;
      state.ultimoPonto = null;
    }

    function getPonto(evt) {
      const rect = canvas.getBoundingClientRect();
      const touch = evt.touches && evt.touches[0] ? evt.touches[0] : (evt.changedTouches && evt.changedTouches[0] ? evt.changedTouches[0] : evt);
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      };
    }

    function iniciarTraco(evt) {
      evt.preventDefault();
      state.desenhando = true;
      state.temTraco = true;
      const p = getPonto(evt);
      state.ultimoPonto = p;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.3, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      setStatus('', '');
    }

    function moverTraco(evt) {
      if (!state.desenhando) return;
      evt.preventDefault();
      const p = getPonto(evt);
      const midX = (state.ultimoPonto.x + p.x) / 2;
      const midY = (state.ultimoPonto.y + p.y) / 2;
      ctx.quadraticCurveTo(state.ultimoPonto.x, state.ultimoPonto.y, midX, midY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX, midY);
      state.ultimoPonto = p;
    }

    function finalizarTraco(evt) {
      if (!state.desenhando) return;
      if (evt) evt.preventDefault();
      state.desenhando = false;
      state.ultimoPonto = null;
      ctx.closePath();
    }

    // Usa Pointer Events quando disponível (unifica mouse, dedo e stylus), com fallback touch
    if (window.PointerEvent) {
      canvas.addEventListener('pointerdown', (e) => {
        canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
        iniciarTraco(e);
      });
      canvas.addEventListener('pointermove', moverTraco);
      canvas.addEventListener('pointerup', finalizarTraco);
      canvas.addEventListener('pointercancel', finalizarTraco);
    } else {
      canvas.addEventListener('mousedown', iniciarTraco);
      window.addEventListener('mousemove', moverTraco);
      window.addEventListener('mouseup', finalizarTraco);
      canvas.addEventListener('touchstart', iniciarTraco, { passive: false });
      canvas.addEventListener('touchmove', moverTraco, { passive: false });
      canvas.addEventListener('touchend', finalizarTraco, { passive: false });
    }

    function abrirModal(papel) {
      if (!podeAssinar) return;
      state.papelAtual = papel;
      setStatus('', '');

      if (papel === 'COLABORADOR') {
        titleEl.innerHTML = `<i class="fa-solid fa-signature"></i> Assinatura — ${config.colaboradorNome || 'Colaborador'}`;
        subtitleEl.textContent = 'O colaborador pode assinar diretamente na tela com o dedo ou caneta.';
        cpfWrap.style.display = 'flex';
        respWrap.style.display = 'none';
        cpfInput.value = state.assinaturas.COLABORADOR.cpf_rg || '';
        btnRemove.style.display = state.assinaturas.COLABORADOR.img ? 'inline-flex' : 'none';
      } else {
        titleEl.innerHTML = '<i class="fa-solid fa-signature"></i> Assinatura — Responsável Almoxarifado';
        subtitleEl.textContent = 'Assinatura digital do responsável pela entrega e cautela.';
        cpfWrap.style.display = 'none';
        respWrap.style.display = 'flex';
        respInput.value = state.assinaturas.RESPONSAVEL.nome || config.responsavelPadrao || 'Gestão de Almoxarifado';
        btnRemove.style.display = state.assinaturas.RESPONSAVEL.img ? 'inline-flex' : 'none';
      }

      modal.classList.add('open');
      document.body.style.overflow = 'hidden';

      requestAnimationFrame(() => {
        prepararCanvas();
      });
    }

    function fecharModal() {
      modal.classList.remove('open');
      document.body.style.overflow = '';
      state.papelAtual = null;
    }

    async function enviarAssinatura(base64Img) {
      const papel = state.papelAtual;
      const payload = {
        papel,
        assinatura_base64: base64Img,
        cpf_rg: papel === 'COLABORADOR' ? cpfInput.value.trim() : undefined,
        responsavel_nome: papel === 'RESPONSAVEL' ? (respInput.value.trim() || config.responsavelPadrao || 'Gestão de Almoxarifado') : undefined
      };

      btnConfirm.disabled = true;
      btnRemove.disabled = true;
      btnConfirm.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';

      const agoraFmt = new Date().toLocaleDateString('pt-BR') + ' ' +
        new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      try {
        const resp = await fetch(`/fichas/${config.colaboradorId}/assinatura`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await resp.json();

        if (!resp.ok || !json.sucesso) {
          throw new Error(json.erro || 'Não foi possível salvar a assinatura.');
        }

        if (papel === 'COLABORADOR') {
          state.assinaturas.COLABORADOR = {
            img: base64Img,
            em: base64Img ? (json.dataFormatada || agoraFmt) : null,
            cpf_rg: payload.cpf_rg || ''
          };
        } else {
          state.assinaturas.RESPONSAVEL = {
            img: base64Img,
            em: base64Img ? (json.dataFormatada || agoraFmt) : null,
            nome: payload.responsavel_nome || config.responsavelPadrao || 'Gestão de Almoxarifado'
          };
        }

        salvarLocal();
        atualizarBoxUI(papel);
        fecharModal();

        if (json.aviso && typeof config.onAviso === 'function') {
          config.onAviso(json.aviso);
        }
      } catch (err) {
        // Fallback offline/sem rede: mantém assinatura localmente para permitir gerar PDF imediatamente
        if (!navigator.onLine || String(err.message || '').includes('Failed to fetch')) {
          if (papel === 'COLABORADOR') {
            state.assinaturas.COLABORADOR = { img: base64Img, em: base64Img ? agoraFmt : null, cpf_rg: payload.cpf_rg || '' };
          } else {
            state.assinaturas.RESPONSAVEL = { img: base64Img, em: base64Img ? agoraFmt : null, nome: payload.responsavel_nome || 'Gestão de Almoxarifado' };
          }
          salvarLocal();
          atualizarBoxUI(papel);
          fecharModal();
        } else {
          setStatus(err.message || 'Erro ao salvar assinatura.', 'error');
        }
      } finally {
        btnConfirm.disabled = false;
        btnRemove.disabled = false;
        btnConfirm.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar Assinatura';
      }
    }

    btnClear.addEventListener('click', () => {
      prepararCanvas();
      setStatus('', '');
    });

    btnRemove.addEventListener('click', () => {
      enviarAssinatura(null);
    });

    btnCancel.addEventListener('click', fecharModal);
    btnClose.addEventListener('click', fecharModal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) fecharModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) {
        fecharModal();
      }
    });

    btnConfirm.addEventListener('click', () => {
      if (!state.temTraco) {
        setStatus('Faça sua assinatura no quadro acima antes de confirmar.', 'error');
        return;
      }
      const dataUrl = canvas.toDataURL('image/png');
      enviarAssinatura(dataUrl);
    });

    // Vincula cliques nos quadros de assinatura
    document.querySelectorAll('[data-assinatura-box]').forEach((box) => {
      box.addEventListener('click', () => {
        const papel = box.getAttribute('data-assinatura-box');
        if (papel) abrirModal(papel);
      });
    });

    // Expor função global para botões extras (ex: botão "Assinar Digitalmente" na barra do PDF)
    window.abrirAssinaturaFicha = abrirModal;
  };
})();
