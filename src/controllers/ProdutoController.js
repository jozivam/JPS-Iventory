const xlsx = require('xlsx');
const Produto = require('../models/Produto');
const Movimentacao = require('../models/Movimentacao');
const db = require('../../config/database');

class ProdutoController {
  /**
   * Listagem do Inventário com Filtros e Indicadores
   */
  static async index(req, res) {
    try {
      const { busca, categoria, status, sucesso, erro } = req.query;

      const filtros = {
        busca: busca || '',
        categoria: categoria || '',
        status: status || ''
      };

      const produtos = await Produto.findAll(filtros);
      const estatisticas = await Produto.getEstatisticas();
      const categorias = await Produto.getCategorias();

      res.render('produtos/index', {
        title: 'Inventário de Produtos',
        currentPage: 'produtos',
        produtos,
        estatisticas,
        categorias,
        filtros,
        sucesso: sucesso || null,
        erro: erro || null
      });
    } catch (error) {
      console.error('Erro ao listar produtos:', error);
      res.status(500).render('layouts/erro', {
        title: 'Erro no Inventário',
        currentPage: 'produtos',
        mensagem: 'Não foi possível carregar o inventário de produtos.',
        detalhes: error.message
      });
    }
  }

  /**
   * Formulário de Cadastro de Novo Produto
   */
  static async create(req, res) {
    try {
      const categorias = await Produto.getCategorias();
      const skuSugerido = Produto.gerarSku();

      res.render('produtos/create', {
        title: 'Novo Produto',
        currentPage: 'produtos',
        categorias,
        produto: { 
          sku: skuSugerido, 
          quantidade: 0, 
          estoque_minimo: 0, 
          categoria: 'Outros'
        },
        erro: null
      });
    } catch (error) {
      console.error('Erro ao abrir tela de novo produto:', error);
      res.redirect('/produtos?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Salva um novo produto no Inventário
   */
  static async store(req, res) {
    try {
      const { 
        sku, nome, categoria, categoria_personalizada, marca, unidade_medida, 
        quantidade, estoque_minimo, localizacao,
        tamanho, cor, peso, numero_serie, ca, patrimonio, tag, observacao, condicao
      } = req.body;

      // Define categoria final
      let categoriaFinal = categoria || 'Outros';
      if (categoria === 'Outros' && categoria_personalizada && categoria_personalizada.trim()) {
        categoriaFinal = categoria_personalizada.trim();
      }

      // Verifica duplicidade de SKU se informado manualmente
      if (sku && sku.trim()) {
        const existente = await Produto.findBySku(sku.trim().toUpperCase());
        if (existente) {
          const categorias = await Produto.getCategorias();
          return res.render('produtos/create', {
            title: 'Novo Produto',
            currentPage: 'produtos',
            categorias,
            produto: req.body,
            erro: `O código SKU "${sku.trim().toUpperCase()}" já está cadastrado em outro item.`
          });
        }
      }

      // Verifica duplicidade por Nome Exato do Produto
      if (nome && nome.trim()) {
        const produtoMesmoNome = await Produto.findByNomeExato(nome.trim());
        if (produtoMesmoNome) {
          const categorias = await Produto.getCategorias();
          return res.render('produtos/create', {
            title: 'Novo Produto',
            currentPage: 'produtos',
            categorias,
            produto: req.body,
            produtoDuplicado: produtoMesmoNome,
            erro: `Já existe um produto cadastrado com o nome "${produtoMesmoNome.nome}" (Código: ${produtoMesmoNome.sku}). Você pode editar o item existente ou registrá-lo com um nome diferente.`
          });
        }
      }

      const qtdInicial = parseInt(quantidade, 10) || 0;

      // Cria produto com quantidade 0 se houver carga inicial para evitar duplicação pelo registro de entrada
      const produtoId = await Produto.create({
        sku,
        nome: nome && nome.trim() ? nome.trim() : 'Item sem descrição',
        categoria: categoriaFinal,
        marca: marca && marca.trim() ? marca.trim() : null,
        unidade_medida: unidade_medida || 'UN',
        quantidade: 0,
        estoque_minimo: parseInt(estoque_minimo, 10) || 0,
        localizacao,
        tamanho,
        cor,
        peso,
        numero_serie,
        ca,
        patrimonio,
        tag,
        observacao,
        condicao: condicao || 'NOVO'
      });

      // Se informou quantidade maior que 0, registra a movimentação de entrada inicial
      if (qtdInicial > 0) {
        await Movimentacao.registrar({
          produto_id: produtoId,
          tipo: 'ENTRADA',
          quantidade: qtdInicial,
          motivo: 'Carga inicial no cadastro do produto',
          responsavel: 'Jozivam Silva',
          documento_ref: 'CADASTRO-INICIAL'
        });
      }

      const nomeItem = nome && nome.trim() ? `"${nome.trim()}"` : 'Produto';
      res.redirect('/produtos?sucesso=' + encodeURIComponent(`${nomeItem} cadastrado com sucesso no inventário!`));
    } catch (error) {
      console.error('Erro ao cadastrar produto:', error);
      const categorias = await Produto.getCategorias();
      res.render('produtos/create', {
        title: 'Novo Produto',
        currentPage: 'produtos',
        categorias,
        produto: req.body,
        erro: 'Falha ao salvar produto: ' + error.message
      });
    }
  }

  /**
   * Formulário de Edição de Produto
   */
  static async edit(req, res) {
    try {
      const { id } = req.params;
      const produto = await Produto.findById(id);

      if (!produto) {
        return res.redirect('/produtos?erro=' + encodeURIComponent('Produto não encontrado.'));
      }

      const categorias = await Produto.getCategorias();

      res.render('produtos/edit', {
        title: `Editar ${produto.nome || 'Produto'}`,
        currentPage: 'produtos',
        produto,
        categorias,
        erro: null
      });
    } catch (error) {
      console.error('Erro ao abrir edição de produto:', error);
      res.redirect('/produtos?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Atualiza dados de um produto
   */
  static async update(req, res) {
    try {
      const { id } = req.params;
      const produtoAtual = await Produto.findById(id);

      if (!produtoAtual) {
        return res.redirect('/produtos?erro=' + encodeURIComponent('Produto não encontrado.'));
      }

      const { 
        sku, nome, categoria, categoria_personalizada, marca, unidade_medida, 
        quantidade, estoque_minimo, localizacao,
        tamanho, cor, peso, numero_serie, ca, patrimonio, tag, observacao, condicao
      } = req.body;

      // Define categoria final
      let categoriaFinal = categoria || produtoAtual.categoria || 'Outros';
      if (categoria === 'Outros' && categoria_personalizada && categoria_personalizada.trim()) {
        categoriaFinal = categoria_personalizada.trim();
      }

      // Se alterou o SKU, verifica duplicidade com outro item
      if (sku && sku.trim().toUpperCase() !== produtoAtual.sku) {
        const existente = await Produto.findBySku(sku.trim().toUpperCase());
        if (existente && existente.id !== produtoAtual.id) {
          const categorias = await Produto.getCategorias();
          return res.render('produtos/edit', {
            title: `Editar ${produtoAtual.nome}`,
            currentPage: 'produtos',
            produto: { ...produtoAtual, ...req.body },
            categorias,
            erro: `O SKU "${sku.trim().toUpperCase()}" já está em uso por outro produto.`
          });
        }
      }

      await Produto.update(id, {
        sku,
        sku_atual: produtoAtual.sku,
        nome: nome && nome.trim() ? nome.trim() : 'Item sem descrição',
        categoria: categoriaFinal,
        marca: marca && marca.trim() ? marca.trim() : null,
        unidade_medida: unidade_medida || 'UN',
        quantidade: parseInt(quantidade, 10) || 0,
        estoque_minimo: parseInt(estoque_minimo, 10) || 0,
        localizacao,
        tamanho,
        cor,
        peso,
        numero_serie,
        ca,
        patrimonio,
        tag,
        observacao,
        condicao: condicao || 'NOVO'
      });

      const nomeItem = nome && nome.trim() ? `"${nome.trim()}"` : 'Produto';
      res.redirect('/produtos?sucesso=' + encodeURIComponent(`${nomeItem} atualizado com sucesso!`));
    } catch (error) {
      console.error('Erro ao atualizar produto:', error);
      const categorias = await Produto.getCategorias();
      res.render('produtos/edit', {
        title: 'Editar Produto',
        currentPage: 'produtos',
        produto: { id: req.params.id, ...req.body },
        categorias,
        erro: 'Falha ao atualizar produto: ' + error.message
      });
    }
  }

  /**
   * Endpoint JSON de Autocomplete e verificação de similaridade de nome
   * GET /produtos/sugestoes?nome=...
   */
  static async sugestoesNome(req, res) {
    try {
      const { nome } = req.query;
      if (!nome || !nome.trim() || nome.trim().length < 2) {
        return res.json({ termo: '', similares: [], exato: null });
      }

      const nomeTrim = nome.trim();
      const [similares, exato] = await Promise.all([
        Produto.buscarSimilares(nomeTrim, 8),
        Produto.findByNomeExato(nomeTrim)
      ]);

      res.json({
        termo: nomeTrim,
        exato: exato || null,
        similares: similares || []
      });
    } catch (error) {
      console.error('Erro ao buscar sugestões de produtos:', error);
      res.status(500).json({ erro: error.message });
    }
  }

  /**
   * Endpoint JSON de Detalhes do Produto
   */
  static async detalhes(req, res) {
    try {
      const { id } = req.params;
      const produto = await Produto.findById(id);
      if (!produto) {
        return res.status(404).json({ erro: 'Produto não encontrado' });
      }
      res.json(produto);
    } catch (error) {
      res.status(500).json({ erro: error.message });
    }
  }

  /**
   * Exclui um produto
   */
  static async delete(req, res) {
    try {
      const { id } = req.params;
      const produto = await Produto.findById(id);

      if (produto) {
        await Produto.delete(id);
        res.redirect('/produtos?sucesso=' + encodeURIComponent(`Produto "${produto.nome}" excluído com sucesso.`));
      } else {
        res.redirect('/produtos?erro=' + encodeURIComponent('Produto não encontrado.'));
      }
    } catch (error) {
      console.error('Erro ao excluir produto:', error);
      res.redirect('/produtos?erro=' + encodeURIComponent('Falha ao excluir produto: ' + error.message));
    }
  }

  /**
   * Baixa a Planilha Modelo oficial de Importação com cabeçalhos e exemplos
   */
  static async baixarModelo(req, res) {
    try {
      const colunasCabecalho = [
        'SKU', 'Nome do Produto', 'Categoria', 'Quantidade', 'Estoque Mínimo', 
        'Unidade', 'Marca', 'Localização', 'TAG', 'Patrimônio', 'C.A (EPI)', 
        'Número de Série', 'Tamanho', 'Cor', 'Peso', 'Observações'
      ];

      const linhasExemplo = [
        {
          'SKU': 'FER-ALC-001',
          'Nome do Produto': 'Alicate Universal 8 Polegadas Isolado 1000V (Exemplo)',
          'Categoria': 'Ferramentas',
          'Quantidade': 10,
          'Estoque Mínimo': 3,
          'Unidade': 'UN',
          'Marca': 'Tramontina Pro',
          'Localização': 'Bancada B-01',
          'TAG': 'FER-01',
          'Patrimônio': 'PAT-0012',
          'C.A (EPI)': '',
          'Número de Série': 'SN-84721',
          'Tamanho': '8 polegadas',
          'Cor': 'Amarelo/Vermelho',
          'Peso': '350g',
          'Observações': 'Isolação 1000V NBR 9627'
        },
        {
          'SKU': 'EPI-CAP-001',
          'Nome do Produto': 'Capacete de Segurança com Jugular Azul (Exemplo)',
          'Categoria': 'EPI / Segurança',
          'Quantidade': 15,
          'Estoque Mínimo': 5,
          'Unidade': 'UN',
          'Marca': 'MSA',
          'Localização': 'Prateleira A-01',
          'TAG': '',
          'Patrimônio': '',
          'C.A (EPI)': '31469',
          'Número de Série': '',
          'Tamanho': 'Único',
          'Cor': 'Azul',
          'Peso': '310g',
          'Observações': 'Validade CA até 2028'
        },
        {
          'SKU': 'ELE-CAB-001',
          'Nome do Produto': 'Cabo de Rede UTP Cat6 100% Cobre (Exemplo)',
          'Categoria': 'Elétrica e TI',
          'Quantidade': 4,
          'Estoque Mínimo': 2,
          'Unidade': 'CX',
          'Marca': 'Furukawa',
          'Localização': 'Depósito D-02',
          'TAG': 'TI-09',
          'Patrimônio': '',
          'C.A (EPI)': '',
          'Número de Série': 'BOB-2026',
          'Tamanho': 'Bobina 305m',
          'Cor': 'Azul',
          'Peso': '12.5kg',
          'Observações': 'Uso exclusivo infraestrutura de dados'
        }
      ];

      const ws = xlsx.utils.json_to_sheet(linhasExemplo, { header: colunasCabecalho });

      const wscols = [
        { wch: 16 }, // SKU
        { wch: 48 }, // Nome do Produto
        { wch: 20 }, // Categoria
        { wch: 14 }, // Quantidade
        { wch: 16 }, // Estoque Mínimo
        { wch: 10 }, // Unidade
        { wch: 18 }, // Marca
        { wch: 20 }, // Localização
        { wch: 14 }, // TAG
        { wch: 16 }, // Patrimônio
        { wch: 14 }, // C.A (EPI)
        { wch: 18 }, // Número de Série
        { wch: 16 }, // Tamanho
        { wch: 16 }, // Cor
        { wch: 14 }, // Peso
        { wch: 28 }  // Observações
      ];
      ws['!cols'] = wscols;

      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'Modelo Importação');

      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="modelo_importacao_inventario.xlsx"');
      res.send(buffer);
    } catch (error) {
      console.error('Erro ao gerar modelo Excel:', error);
      res.redirect('/produtos?erro=' + encodeURIComponent('Falha ao baixar modelo: ' + error.message));
    }
  }

  /**
   * Exporta todo o inventário atual para uma planilha Excel (.xlsx)
   */
  static async exportarExcel(req, res) {
    try {
      const { busca, categoria, status } = req.query;
      const produtos = await Produto.findAll({ busca, categoria, status });

      let dadosParaExportar = [];
      const colunasCabecalho = [
        'SKU', 'Nome do Produto', 'Categoria', 'Marca', 'Quantidade', 
        'Unidade', 'Estoque Mínimo', 'Status Estoque', 'Nível de Estoque', 'Localização', 
        'TAG', 'Patrimônio', 'C.A (EPI)', 'Número de Série', 'Tamanho', 
        'Cor', 'Peso', 'Observações', 'Última Atualização'
      ];

      if (produtos && produtos.length > 0) {
        dadosParaExportar = produtos.map(p => ({
          'SKU': p.sku || '',
          'Nome do Produto': p.nome || '',
          'Categoria': p.categoria || 'Geral',
          'Marca': p.marca || '',
          'Quantidade': p.quantidade !== undefined ? p.quantidade : 0,
          'Unidade': p.unidade_medida || 'UN',
          'Estoque Mínimo': p.estoque_minimo !== undefined ? p.estoque_minimo : 0,
          'Status Estoque': p.condicao || 'NOVO',
          'Nível de Estoque': p.status_estoque || 'NORMAL',
          'Localização': p.localizacao || '',
          'TAG': p.tag || '',
          'Patrimônio': p.patrimonio || '',
          'C.A (EPI)': p.ca || '',
          'Número de Série': p.numero_serie || '',
          'Tamanho': p.tamanho || '',
          'Cor': p.cor || '',
          'Peso': p.peso || '',
          'Observações': p.observacao || '',
          'Última Atualização': p.atualizado_em || ''
        }));
      } else {
        // Se o inventário estiver vazio, exporta os cabeçalhos com exemplos práticos
        dadosParaExportar = [
          {
            'SKU': 'FER-ALC-001',
            'Nome do Produto': 'Alicate Universal 8 Polegadas Isolado 1000V (Exemplo)',
            'Categoria': 'Ferramentas',
            'Marca': 'Tramontina Pro',
            'Quantidade': 10,
            'Unidade': 'UN',
            'Estoque Mínimo': 3,
            'Status Estoque': 'NOVO',
            'Nível de Estoque': 'NORMAL',
            'Localização': 'Bancada B-01',
            'TAG': 'FER-01',
            'Patrimônio': 'PAT-0012',
            'C.A (EPI)': '',
            'Número de Série': 'SN-84721',
            'Tamanho': '8 polegadas',
            'Cor': 'Amarelo/Vermelho',
            'Peso': '350g',
            'Observações': 'Isolação 1000V NBR 9627',
            'Última Atualização': ''
          },
          {
            'SKU': 'EPI-CAP-001',
            'Nome do Produto': 'Capacete de Segurança com Jugular Azul (Exemplo)',
            'Categoria': 'EPI / Segurança',
            'Marca': 'MSA',
            'Quantidade': 15,
            'Unidade': 'UN',
            'Estoque Mínimo': 5,
            'Status Estoque': 'REUSO',
            'Nível de Estoque': 'NORMAL',
            'Localização': 'Prateleira A-01',
            'TAG': '',
            'Patrimônio': '',
            'C.A (EPI)': '31469',
            'Número de Série': '',
            'Tamanho': 'Único',
            'Cor': 'Azul',
            'Peso': '310g',
            'Observações': 'Validade CA até 2028',
            'Última Atualização': ''
          }
        ];
      }

      const ws = xlsx.utils.json_to_sheet(dadosParaExportar, { header: colunasCabecalho });

      // Larguras automáticas de colunas
      const wscols = [
        { wch: 14 }, // SKU
        { wch: 38 }, // Nome
        { wch: 18 }, // Categoria
        { wch: 18 }, // Marca
        { wch: 12 }, // Quantidade
        { wch: 10 }, // Unidade
        { wch: 14 }, // Mínimo
        { wch: 16 }, // Status Estoque (Condição: NOVO, REUSO, etc)
        { wch: 16 }, // Nível de Estoque (NORMAL, BAIXO, ZERADO)
        { wch: 22 }, // Localização
        { wch: 14 }, // TAG
        { wch: 16 }, // Patrimônio
        { wch: 12 }, // C.A
        { wch: 18 }, // Nº Série
        { wch: 14 }, // Tamanho
        { wch: 14 }, // Cor
        { wch: 12 }, // Peso
        { wch: 28 }, // Observações
        { wch: 20 }  // Data
      ];
      ws['!cols'] = wscols;

      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'Inventário');

      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const hoje = new Date().toISOString().split('T')[0];

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="inventario_produtos_${hoje}.xlsx"`);
      res.send(buffer);
    } catch (error) {
      console.error('Erro ao exportar Excel do inventário:', error);
      res.redirect('/produtos?erro=' + encodeURIComponent('Falha ao exportar planilha: ' + error.message));
    }
  }

  /**
   * Importa e atualiza o inventário a partir de uma planilha Excel (.xlsx, .xls, .csv)
   */
  static async importarExcel(req, res) {
    try {
      if (!req.file || !req.file.buffer) {
        return res.redirect('/produtos?erro=' + encodeURIComponent('Nenhum arquivo de planilha foi selecionado.'));
      }

      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return res.redirect('/produtos?erro=' + encodeURIComponent('A planilha enviada está vazia.'));
      }

      const sheet = workbook.Sheets[sheetName];
      const linhas = xlsx.utils.sheet_to_json(sheet, { defval: '' });

      if (!linhas || linhas.length === 0) {
        return res.redirect('/produtos?erro=' + encodeURIComponent('Nenhum dado legível foi encontrado na planilha.'));
      }

      let criados = 0;
      let atualizados = 0;

      for (const row of linhas) {
        // Normalização tolerante de cabeçalhos
        const sku = (row['SKU'] || row['Código SKU'] || row['sku'] || row['Codigo SKU'] || '').toString().trim().toUpperCase();
        const nome = (row['Nome do Produto'] || row['Nome'] || row['Descrição'] || row['Descricao'] || row['nome'] || '').toString().trim();
        const categoria = (row['Categoria'] || row['categoria'] || 'Outros').toString().trim();
        const marca = (row['Marca'] || row['Marca / Fabricante'] || row['Fabricante'] || row['marca'] || '').toString().trim() || null;
        const unidade = (row['Unidade'] || row['Unidade de Medida'] || row['UN'] || row['unidade'] || 'UN').toString().trim().toUpperCase();
        const quantidade = parseInt(row['Quantidade'] || row['Estoque'] || row['Qtd'] || 0, 10) || 0;
        const estoqueMinimo = parseInt(row['Estoque Mínimo'] || row['Estoque Minimo'] || row['Mínimo'] || row['Minimo'] || 0, 10) || 0;
        const localizacao = (row['Localização'] || row['Localizacao'] || row['Endereçamento'] || '').toString().trim() || null;
        const tag = (row['TAG'] || row['TAG / Plaqueta'] || row['Plaqueta'] || '').toString().trim().toUpperCase() || null;
        const patrimonio = (row['Patrimônio'] || row['Patrimonio'] || row['Nº de Patrimônio'] || '').toString().trim().toUpperCase() || null;
        const ca = (row['C.A (EPI)'] || row['C.A'] || row['CA'] || '').toString().trim() || null;
        const numeroSerie = (row['Número de Série'] || row['Numero de Serie'] || row['Série'] || '').toString().trim() || null;
        const tamanho = (row['Tamanho'] || row['Tamanho / Dimensão'] || row['Dimensão'] || '').toString().trim() || null;
        const cor = (row['Cor'] || '').toString().trim() || null;
        const peso = (row['Peso'] || '').toString().trim() || null;
        const observacao = (row['Observações'] || row['Observacoes'] || row['Observação'] || row['Observacao'] || row['Obs'] || '').toString().trim() || null;
        
        // Mapeia o Status do Estoque / Condição do Item (ex: NOVO, REUSO, OUTROS, BOM, SUCATA)
        const statusEstoqueTexto = (row['Status Estoque'] || row['Condição'] || row['Condicao'] || row['Condição do Item'] || row['Estado'] || row['Status'] || '').toString().trim().toUpperCase();
        let condicaoFinal = 'NOVO';
        if (statusEstoqueTexto) {
          if (statusEstoqueTexto.includes('REUSO') || statusEstoqueTexto.includes('REÚSO') || statusEstoqueTexto.includes('USAD')) {
            condicaoFinal = 'REUSO';
          } else if (statusEstoqueTexto.includes('BOM')) {
            condicaoFinal = 'BOM';
          } else if (statusEstoqueTexto.includes('MANUT')) {
            condicaoFinal = 'MANUTENÇÃO';
          } else if (statusEstoqueTexto.includes('SUCAT')) {
            condicaoFinal = 'SUCATA';
          } else if (statusEstoqueTexto.includes('OUTRO')) {
            condicaoFinal = 'OUTROS';
          } else if (['NORMAL', 'BAIXO', 'CRITICO', 'ZERADO'].includes(statusEstoqueTexto)) {
            condicaoFinal = 'NOVO';
          } else {
            condicaoFinal = statusEstoqueTexto;
          }
        }

        // Pula linhas totalmente vazias ou linhas de exemplo
        if (!sku && !nome) continue;
        if (nome.toLowerCase().includes('(exemplo)') || nome.toLowerCase().startsWith('exemplo:')) continue;

        // Verifica se o SKU ou Nome exato já existe no banco para evitar duplicações
        let produtoExistente = null;
        if (sku) {
          produtoExistente = await Produto.findBySku(sku);
        }
        if (!produtoExistente && nome) {
          produtoExistente = await Produto.findByNomeExato(nome);
        }

        if (produtoExistente) {
          // ATUALIZA o produto existente
          await Produto.update(produtoExistente.id, {
            sku: sku || produtoExistente.sku,
            sku_atual: produtoExistente.sku,
            nome: nome || produtoExistente.nome,
            categoria: categoria || 'Outros',
            marca,
            unidade_medida: unidade || 'UN',
            quantidade,
            estoque_minimo: estoqueMinimo,
            localizacao,
            tamanho,
            cor,
            peso,
            numero_serie: numeroSerie,
            ca,
            patrimonio,
            tag,
            observacao,
            condicao: condicaoFinal
          });
          atualizados++;
        } else {
          // CADASTRA novo produto com quantidade inicial 0 para que a entrada abaixo totalize o valor exato da planilha
          const novoSku = sku || Produto.gerarSku(categoria);
          const novoId = await Produto.create({
            sku: novoSku,
            nome: nome || 'Item importado sem descrição',
            categoria: categoria || 'Outros',
            marca,
            unidade_medida: unidade || 'UN',
            quantidade: 0,
            estoque_minimo: estoqueMinimo,
            preco_unitario: 0.0,
            localizacao,
            tamanho,
            cor,
            peso,
            numero_serie: numeroSerie,
            ca,
            patrimonio,
            tag,
            observacao,
            condicao: condicaoFinal
          });

          // Se quantidade inicial > 0, registra a carga inicial
          if (quantidade > 0) {
            await Movimentacao.registrar({
              produto_id: novoId,
              tipo: 'ENTRADA',
              quantidade,
              motivo: 'Carga inicial via importação Excel',
              responsavel: 'Importação em Lote',
              documento_ref: 'PLANILHA-IMPORT'
            });
          }

          criados++;
        }
      }

      const mensagemSucesso = `Planilha processada com sucesso! ${criados} produto(s) cadastrado(s) e ${atualizados} atualizado(s) no inventário.`;
      res.redirect('/produtos?sucesso=' + encodeURIComponent(mensagemSucesso));
    } catch (error) {
      console.error('Erro ao importar Excel:', error);
      res.redirect('/produtos?erro=' + encodeURIComponent('Falha ao processar arquivo Excel: ' + error.message));
    }
  }
}

module.exports = ProdutoController;
