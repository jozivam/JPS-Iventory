const Produto = require('../models/Produto');
const Fornecedor = require('../models/Fornecedor');
const Almoxarifado = require('../models/Almoxarifado');

class ProdutoController {
  /**
   * Lista todos os produtos com filtros e suporte a multi-almoxarifado
   */
  static async index(req, res) {
    try {
      const { busca = '', categoria = '', status = '', ordenarPor = 'nome_asc', almoxarifado_id = '' } = req.query;
      const produtos = Produto.findAll({ busca, categoria, status, ordenarPor, almoxarifado_id });
      const categorias = Produto.getCategorias();
      const almoxarifados = Almoxarifado.findAll();
      const estatisticas = Produto.getEstatisticas(almoxarifado_id);
      const almoxarifadoAtual = almoxarifado_id ? almoxarifados.find(a => a.id == almoxarifado_id) : null;

      // Estatísticas segmentadas para a barra Fixoria
      const inStockCount = Math.max(0, estatisticas.total_itens - estatisticas.total_em_alerta);
      const lowStockCount = estatisticas.total_baixos;
      const outOfStockCount = estatisticas.total_zerados;

      res.render('produtos/index', {
        title: 'Inventário (Inventory)',
        currentPage: 'produtos',
        produtos,
        categorias,
        almoxarifados,
        almoxarifadoAtual,
        estatisticas: {
          ...estatisticas,
          inStockCount,
          lowStockCount,
          outOfStockCount
        },
        filtros: { busca, categoria, status, ordenarPor, almoxarifado_id },
        sucesso: req.query.sucesso || null,
        erro: req.query.erro || null
      });
    } catch (error) {
      console.error('Erro ao listar produtos:', error);
      res.redirect(`/?erro=${encodeURIComponent('Erro ao carregar lista de produtos: ' + error.message)}`);
    }
  }

  /**
   * Ficha Completa do Produto (Exibe dados, estoques por obra e ações rápidas)
   */
  static async show(req, res) {
    try {
      const { id } = req.params;
      const produto = Produto.findByIdWithEstoques(id);

      if (!produto) {
        return res.redirect('/produtos?erro=' + encodeURIComponent('Produto não encontrado.'));
      }

      const almoxarifados = Almoxarifado.findAll();

      res.render('produtos/show', {
        title: `Ficha: ${produto.nome}`,
        currentPage: 'produtos',
        produto,
        almoxarifados,
        sucesso: req.query.sucesso || null,
        erro: req.query.erro || null
      });
    } catch (error) {
      console.error('Erro ao abrir ficha do produto:', error);
      res.redirect('/produtos?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Formulário de novo produto
   */
  static async create(req, res) {
    try {
      const fornecedores = Fornecedor.findAll();
      const categorias = Produto.getCategorias();
      const almoxarifados = Almoxarifado.findAll();

      res.render('produtos/create', {
        title: 'Adicionar Produto (Add Product)',
        currentPage: 'produtos',
        fornecedores,
        categorias,
        almoxarifados,
        produto: {},
        erro: req.query.erro || null
      });
    } catch (error) {
      console.error('Erro ao abrir formulário de cadastro:', error);
      res.redirect('/produtos?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Processa o cadastro de um novo produto (Flexível com campos opcionais)
   */
  static async store(req, res) {
    try {
      const { sku, tag, nome, categoria, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, fornecedor_id, almoxarifado_id } = req.body;

      const novoProdutoId = Produto.create({
        sku,
        tag,
        nome,
        categoria,
        unidade_medida,
        quantidade,
        estoque_minimo,
        preco_unitario,
        localizacao,
        fornecedor_id,
        almoxarifado_id
      });

      const nomeItem = nome ? nome.trim() : (tag ? `Item [${tag}]` : 'Novo produto');
      res.redirect(`/produtos/${novoProdutoId}?sucesso=` + encodeURIComponent(`"${nomeItem}" salvo com sucesso! Ficha completa gerada.`));
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      const fornecedores = Fornecedor.findAll();
      const categorias = Produto.getCategorias();
      const almoxarifados = Almoxarifado.findAll();

      res.render('produtos/create', {
        title: 'Adicionar Produto',
        currentPage: 'produtos',
        fornecedores,
        categorias,
        almoxarifados,
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
      const produto = Produto.findByIdWithEstoques(id);

      if (!produto) {
        return res.redirect('/produtos?erro=' + encodeURIComponent('Produto não encontrado.'));
      }

      const fornecedores = Fornecedor.findAll();
      const categorias = Produto.getCategorias();
      const almoxarifados = Almoxarifado.findAll();

      res.render('produtos/edit', {
        title: `Editar ${produto.nome}`,
        currentPage: 'produtos',
        produto,
        fornecedores,
        categorias,
        almoxarifados,
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
      const { sku, tag, nome, categoria, unidade_medida, estoque_minimo, preco_unitario, localizacao, fornecedor_id } = req.body;

      Produto.update(id, {
        sku,
        tag,
        nome,
        categoria,
        unidade_medida,
        estoque_minimo,
        preco_unitario,
        localizacao,
        fornecedor_id
      });

      const nomeItem = nome ? nome.trim() : 'Produto';
      res.redirect(`/produtos/${id}?sucesso=` + encodeURIComponent(`"${nomeItem}" atualizado com sucesso!`));
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
   * Exclui um produto (com validação de rastreabilidade)
   */
  static async delete(req, res) {
    try {
      const { id } = req.params;
      Produto.delete(id);
      res.redirect('/produtos?sucesso=' + encodeURIComponent('Item removido com sucesso do catálogo.'));
    } catch (error) {
      console.error('Erro ao remover produto:', error);
      res.redirect('/produtos?erro=' + encodeURIComponent(error.message));
    }
  }
}

module.exports = ProdutoController;
