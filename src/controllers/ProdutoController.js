const Produto = require('../models/Produto');
const Fornecedor = require('../models/Fornecedor');

class ProdutoController {
  /**
   * Lista todos os produtos com filtros e status de estoque (Estilo Fixoria UI)
   */
  static async index(req, res) {
    try {
      const { busca = '', categoria = '', status = '', ordenarPor = 'nome_asc' } = req.query;
      const produtos = Produto.findAll({ busca, categoria, status, ordenarPor });
      const categorias = Produto.getCategorias();
      const estatisticas = Produto.getEstatisticas();

      // Estatísticas segmentadas para a barra Fixoria
      const inStockCount = Math.max(0, estatisticas.total_itens - estatisticas.total_em_alerta);
      const lowStockCount = estatisticas.total_baixos;
      const outOfStockCount = estatisticas.total_zerados;

      res.render('produtos/index', {
        title: 'Inventário (Inventory)',
        currentPage: 'produtos',
        produtos,
        categorias,
        estatisticas: {
          ...estatisticas,
          inStockCount,
          lowStockCount,
          outOfStockCount
        },
        filtros: { busca, categoria, status, ordenarPor },
        sucesso: req.query.sucesso || null,
        erro: req.query.erro || null
      });
    } catch (error) {
      console.error('Erro ao listar produtos:', error);
      res.redirect(`/?erro=${encodeURIComponent('Erro ao carregar lista de produtos: ' + error.message)}`);
    }
  }

  /**
   * Formulário de novo produto
   */
  static async create(req, res) {
    try {
      const fornecedores = Fornecedor.findAll();
      const categorias = Produto.getCategorias();

      res.render('produtos/create', {
        title: 'Adicionar Produto (Add Product)',
        currentPage: 'produtos',
        fornecedores,
        categorias,
        produto: {},
        erro: req.query.erro || null
      });
    } catch (error) {
      console.error('Erro ao abrir formulário de cadastro:', error);
      res.redirect('/produtos?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Processa o cadastro de um novo produto
   */
  static async store(req, res) {
    try {
      const { sku, nome, categoria, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, fornecedor_id } = req.body;

      Produto.create({
        sku,
        nome,
        categoria,
        unidade_medida,
        quantidade,
        estoque_minimo,
        preco_unitario,
        localizacao,
        fornecedor_id
      });

      res.redirect('/produtos?sucesso=' + encodeURIComponent(`Produto "${nome}" cadastrado com sucesso!`));
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      const fornecedores = Fornecedor.findAll();
      const categorias = Produto.getCategorias();

      res.render('produtos/create', {
        title: 'Adicionar Produto',
        currentPage: 'produtos',
        fornecedores,
        categorias,
        produto: req.body,
        erro: error.message
      });
    }
  }

  /**
   * Formulário de edição
   */
  static async edit(req, res) {
    try {
      const { id } = req.params;
      const produto = Produto.findById(id);

      if (!produto) {
        return res.redirect('/produtos?erro=' + encodeURIComponent('Produto não encontrado.'));
      }

      const fornecedores = Fornecedor.findAll();
      const categorias = Produto.getCategorias();

      res.render('produtos/edit', {
        title: `Editar ${produto.nome}`,
        currentPage: 'produtos',
        produto,
        fornecedores,
        categorias,
        erro: req.query.erro || null
      });
    } catch (error) {
      console.error('Erro ao carregar edição do produto:', error);
      res.redirect('/produtos?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Atualiza dados de um produto
   */
  static async update(req, res) {
    const { id } = req.params;
    try {
      const { sku, nome, categoria, unidade_medida, estoque_minimo, preco_unitario, localizacao, fornecedor_id } = req.body;

      Produto.update(id, {
        sku,
        nome,
        categoria,
        unidade_medida,
        estoque_minimo,
        preco_unitario,
        localizacao,
        fornecedor_id
      });

      res.redirect('/produtos?sucesso=' + encodeURIComponent(`Produto "${nome}" atualizado com sucesso!`));
    } catch (error) {
      console.error('Erro ao atualizar produto:', error);
      const fornecedores = Fornecedor.findAll();
      const categorias = Produto.getCategorias();
      const produto = { ...req.body, id };

      res.render('produtos/edit', {
        title: `Editar Produto`,
        currentPage: 'produtos',
        produto,
        fornecedores,
        categorias,
        erro: error.message
      });
    }
  }

  /**
   * Exclui um produto (com validação de integridade)
   */
  static async delete(req, res) {
    try {
      const { id } = req.params;
      Produto.delete(id);
      res.redirect('/produtos?sucesso=' + encodeURIComponent('Item removido com sucesso.'));
    } catch (error) {
      console.error('Erro ao remover produto:', error);
      res.redirect('/produtos?erro=' + encodeURIComponent(error.message));
    }
  }
}

module.exports = ProdutoController;
