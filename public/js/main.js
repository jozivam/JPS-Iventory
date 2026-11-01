/**
 * JPS ALMOXARIFADO - JAVASCRIPT GLOBAL & INTERATIVIDADE
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Fechamento de Alertas
  document.querySelectorAll('.alert-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const alert = e.target.closest('.alert');
      if (alert) {
        alert.style.opacity = '0';
        alert.style.transform = 'translateY(-10px)';
        setTimeout(() => alert.remove(), 250);
      }
    });
  });

  // 2. Busca Rápida Instantânea em Tabelas (Sem recarregar página)
  const quickSearchInput = document.getElementById('quick-table-search');
  if (quickSearchInput) {
    quickSearchInput.addEventListener('input', (e) => {
      const termo = e.target.value.toLowerCase().trim();
      const rows = document.querySelectorAll('.data-table tbody tr');

      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(termo) ? '' : 'none';
      });
    });
  }

  // 3. Controle dos Modais
  window.abrirModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
  };

  window.fecharModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  };

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  });

  // 4. Modal de Confirmação de Exclusão Segura
  window.confirmarExclusao = (formId, itemNome) => {
    const modal = document.getElementById('modal-confirmar-exclusao');
    if (!modal) return true;

    const textoAlvo = document.getElementById('modal-excluir-item-nome');
    if (textoAlvo) textoAlvo.textContent = itemNome;

    const btnConfirmar = document.getElementById('btn-confirmar-exclusao-acao');
    btnConfirmar.onclick = () => {
      document.getElementById(formId).submit();
    };

    window.abrirModal('modal-confirmar-exclusao');
    return false;
  };

  // 5. Interação na tela de Movimentação (Baixa / Entrada)
  const radioEntrada = document.getElementById('tipo-mov-entrada');
  const radioSaida = document.getElementById('tipo-mov-saida');
  const cardEntrada = document.getElementById('card-tipo-entrada');
  const cardSaida = document.getElementById('card-tipo-saida');
  const selectProduto = document.getElementById('mov-produto-select');
  const qtdInput = document.getElementById('mov-quantidade-input');
  const infoEstoqueBox = document.getElementById('mov-info-estoque');
  const btnSubmeterMov = document.getElementById('btn-submeter-mov');
  const avisoSaldoInsuficiente = document.getElementById('aviso-saldo-insuficiente');
  const selectAlmox = document.getElementById('mov-almoxarifado-select');
  const hiddenOrigemId = document.getElementById('hidden-origem-id');
  const hiddenDestinoId = document.getElementById('hidden-destino-id');
  const labelAlmoxTexto = document.getElementById('label-almoxarifado-texto');

  function sincronizarAlmoxarifado() {
    if (!selectAlmox) return;
    const val = selectAlmox.value;
    const ehEntrada = radioEntrada && radioEntrada.checked;

    if (ehEntrada) {
      if (hiddenDestinoId) hiddenDestinoId.value = val;
      if (hiddenOrigemId) hiddenOrigemId.value = '';
      if (labelAlmoxTexto) labelAlmoxTexto.textContent = 'Almoxarifado / Canteiro de Destino (Recebimento)';
    } else {
      if (hiddenOrigemId) hiddenOrigemId.value = val;
      if (hiddenDestinoId) hiddenDestinoId.value = '';
      if (labelAlmoxTexto) labelAlmoxTexto.textContent = 'Almoxarifado / Canteiro de Origem (Baixa de Consumo)';
    }
  }

  function atualizarCardsTipo() {
    if (radioEntrada && radioEntrada.checked) {
      cardEntrada?.classList.add('selected-in');
      cardSaida?.classList.remove('selected-out');
    } else if (radioSaida && radioSaida.checked) {
      cardSaida?.classList.add('selected-out');
      cardEntrada?.classList.remove('selected-in');
    }
    sincronizarAlmoxarifado();
    verificarSaldoEstoque();
  }

  function verificarSaldoEstoque() {
    if (!selectProduto || !infoEstoqueBox) return;

    const option = selectProduto.options[selectProduto.selectedIndex];
    if (!option || !option.value) {
      infoEstoqueBox.style.display = 'none';
      return;
    }

    const estoqueAtual = parseInt(option.dataset.estoque || '0', 10);
    const estoqueMinimo = parseInt(option.dataset.minimo || '0', 10);
    const unidade = option.dataset.unidade || 'UN';
    const preco = parseFloat(option.dataset.preco || '0');

    infoEstoqueBox.style.display = 'block';
    const spanQtd = document.getElementById('info-estoque-qtd');
    const spanMin = document.getElementById('info-estoque-min');
    const spanUnidade = document.getElementById('info-estoque-un');
    const spanPreco = document.getElementById('info-estoque-preco');

    if (spanQtd) spanQtd.textContent = estoqueAtual;
    if (spanMin) spanMin.textContent = estoqueMinimo;
    if (spanUnidade) spanUnidade.textContent = unidade;
    if (spanPreco) spanPreco.textContent = preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Se for SAÍDA, valida se a quantidade inserida cabe no estoque
    const ehSaida = radioSaida && radioSaida.checked;
    const qtdPedida = parseInt(qtdInput?.value || '0', 10);

    if (ehSaida && qtdPedida > estoqueAtual) {
      if (avisoSaldoInsuficiente) {
        avisoSaldoInsuficiente.style.display = 'block';
        avisoSaldoInsuficiente.textContent = `Atenção: A quantidade informada (${qtdPedida} ${unidade}) é superior ao estoque disponível (${estoqueAtual} ${unidade}).`;
      }
      if (btnSubmeterMov) btnSubmeterMov.disabled = true;
    } else {
      if (avisoSaldoInsuficiente) avisoSaldoInsuficiente.style.display = 'none';
      if (btnSubmeterMov) btnSubmeterMov.disabled = false;
    }
  }

  if (cardEntrada && cardSaida) {
    cardEntrada.addEventListener('click', () => {
      radioEntrada.checked = true;
      atualizarCardsTipo();
    });
    cardSaida.addEventListener('click', () => {
      radioSaida.checked = true;
      atualizarCardsTipo();
    });
    radioEntrada.addEventListener('change', atualizarCardsTipo);
    radioSaida.addEventListener('change', atualizarCardsTipo);
    selectAlmox?.addEventListener('change', sincronizarAlmoxarifado);
    selectProduto?.addEventListener('change', verificarSaldoEstoque);
    qtdInput?.addEventListener('input', verificarSaldoEstoque);

    atualizarCardsTipo();
    verificarSaldoEstoque();
  }

  // 6. Gerador Automático de SKU no cadastro de Produto
  const btnGerarSku = document.getElementById('btn-gerar-sku');
  const inputSku = document.getElementById('produto-sku-input');
  const selectCategoria = document.getElementById('produto-categoria-select');

  if (btnGerarSku && inputSku) {
    btnGerarSku.addEventListener('click', () => {
      const prefixo = selectCategoria && selectCategoria.value 
        ? selectCategoria.value.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'ITM')
        : 'ALM';
      const aleatorio = Math.floor(1000 + Math.random() * 9000);
      inputSku.value = `${prefixo}-${aleatorio}`;
    });
  }

  // 7. Toggle do menu lateral em telas menores (Mobile & Tablet)
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const sidebar = document.querySelector('.app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');

  function fecharSidebar() {
    sidebar?.classList.remove('open');
    backdrop?.classList.remove('active');
    document.body.classList.remove('sidebar-locked');
  }

  function toggleSidebar() {
    const isOpen = sidebar?.classList.toggle('open');
    if (isOpen) {
      backdrop?.classList.add('active');
      document.body.classList.add('sidebar-locked');
    } else {
      backdrop?.classList.remove('active');
      document.body.classList.remove('sidebar-locked');
    }
  }

  if (btnToggleSidebar && sidebar) {
    btnToggleSidebar.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSidebar();
    });
  }

  backdrop?.addEventListener('click', fecharSidebar);

  // Fecha sidebar ao redimensionar para desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth > 992) {
      fecharSidebar();
    }
  });
});
