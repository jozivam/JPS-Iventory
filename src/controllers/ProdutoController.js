const Produto = require('../models/Produto');
const Movimentacao = require('../models/Movimentacao');

class ProdutoController {
  /**
   * Listagem de Inventário (Itens)
   */
  static async index(req, res) {
    try {
      const { busca, categoria, status, sucesso, erro } = req.query;

      const filtros = {
        busca: busca || '',
        categoria: categoria || '',
        status: status || ''
      };

      const produtos = Produto.findAll(filtros);
      const estatisticas = Produto.getEstatisticas();
      const categorias = Produto.getCategorias();

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
      const categorias = Produto.getCategorias();
      const skuSugerido = Produto.gerarSku();

      res.render('produtos/create', {
        title: 'Novo Produto',
        currentPage: 'produtos',
        categorias,
        produto: { 
          sku: skuSugerido, 
          quantidade: 0, 
          estoque_minimo: 0, 
          preco_unitario: '0.00',
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
   * Salva novo produto no banco de dados (Campos não obrigatórios)
   */
  static async store(req, res) {
    try {
      const { 
        sku, nome, categoria, categoria_personalizada, unidade_medida, 
        quantidade, estoque_minimo, preco_unitario, localizacao,
        tamanho, cor, peso, numero_serie, ca, patrimonio, tag
      } = req.body;

      // Define categoria final: se digitou personalizada ou escolheu da lista
      let categoriaFinal = categoria || 'Outros';
      if (categoria === 'Outros' && categoria_personalizada && categoria_personalizada.trim()) {
        categoriaFinal = categoria_personalizada.trim();
      }

      // Verifica duplicidade de SKU apenas se fornecido manualmente
      if (sku && sku.trim()) {
        const existente = Produto.findBySku(sku.trim().toUpperCase());
        if (existente) {
          const categorias = Produto.getCategorias();
          return res.render('produtos/create', {
            title: 'Novo Produto',
            currentPage: 'produtos',
            categorias,
            produto: req.body,
            erro: `O código SKU "${sku.trim().toUpperCase()}" já está cadastrado em outro item.`
          });
        }
      }

      const qtdInicial = parseInt(quantidade, 10) || 0;

      // Cria produto
      const produtoId = Produto.create({
        sku,
        nome: nome && nome.trim() ? nome.trim() : 'Item sem descrição',
        categoria: categoriaFinal,
        unidade_medida: unidade_medida || 'UN',
        quantidade: qtdInicial,
        estoque_minimo: parseInt(estoque_minimo, 10) || 0,
        preco_unitario: parseFloat(preco_unitario) || 0.0,
        localizacao,
        tamanho,
        cor,
        peso,
        numero_serie,
        ca,
        patrimonio,
        tag
      });

      // Se informou quantidade maior que 0, registra a movimentação de entrada inicial
      if (qtdInicial > 0) {
        Movimentacao.registrar({
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
      const categorias = Produto.getCategorias();
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
      const produto = Produto.findById(id);

      if (!produto) {
        return res.redirect('/produtos?erro=' + encodeURIComponent('Produto não encontrado.'));
      }

      const categorias = Produto.getCategorias();

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
      const produtoAtual = Produto.findById(id);

      if (!produtoAtual) {
        return res.redirect('/produtos?erro=' + encodeURIComponent('Produto não encontrado.'));
      }

      const { 
        sku, nome, categoria, categoria_personalizada, unidade_medida, 
        quantidade, estoque_minimo, preco_unitario, localizacao,
        tamanho, cor, peso, numero_serie, ca, patrimonio, tag
      } = req.body;

      // Define categoria final
      let categoriaFinal = categoria || produtoAtual.categoria || 'Outros';
      if (categoria === 'Outros' && categoria_personalizada && categoria_personalizada.trim()) {
        categoriaFinal = categoria_personalizada.trim();
      }

      // Se alterou o SKU, verifica duplicidade com outro item
      if (sku && sku.trim().toUpperCase() !== produtoAtual.sku) {
        const existente = Produto.findBySku(sku.trim().toUpperCase());
        if (existente && existente.id !== produtoAtual.id) {
          const categorias = Produto.getCategorias();
          return res.render('produtos/edit', {
            title: `Editar ${produtoAtual.nome}`,
            currentPage: 'produtos',
            produto: { ...produtoAtual, ...req.body },
            categorias,
            erro: `O SKU "${sku.trim().toUpperCase()}" já está em uso por outro produto.`
          });
        }
      }

      Produto.update(id, {
        sku,
        sku_atual: produtoAtual.sku,
        nome: nome && nome.trim() ? nome.trim() : 'Item sem descrição',
        categoria: categoriaFinal,
        unidade_medida: unidade_medida || 'UN',
        quantidade: parseInt(quantidade, 10) || 0,
        estoque_minimo: parseInt(estoque_minimo, 10) || 0,
        preco_unitario: parseFloat(preco_unitario) || 0.0,
        localizacao,
        tamanho,
        cor,
        peso,
        numero_serie,
        ca,
        patrimonio,
        tag
      });

      const nomeItem = nome && nome.trim() ? `"${nome.trim()}"` : 'Produto';
      res.redirect('/produtos?sucesso=' + encodeURIComponent(`${nomeItem} atualizado com sucesso!`));
    } catch (error) {
      console.error('Erro ao atualizar produto:', error);
      const categorias = Produto.getCategorias();
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
   * Exclui um produto
   */
  static async delete(req, res) {
    try {
      const { id } = req.params;
      const produto = Produto.findById(id);

      if (produto) {
        Produto.delete(id);
        res.redirect('/produtos?sucesso=' + encodeURIComponent(`Produto "${produto.nome}" excluído com sucesso.`));
      } else {
        res.redirect('/produtos?erro=' + encodeURIComponent('Produto não encontrado.'));
      }
    } catch (error) {
      console.error('Erro ao excluir produto:', error);
      res.redirect('/produtos?erro=' + encodeURIComponent('Falha ao excluir produto: ' + error.message));
    }
  }
}

module.exports = ProdutoController;
