const Fornecedor = require('../models/Fornecedor');

class FornecedorController {
  /**
   * Lista fornecedores parceiros
   */
  static async index(req, res) {
    try {
      const fornecedores = Fornecedor.findAll();
      res.render('fornecedores/index', {
        title: 'Fornecedores - Almoxarifado',
        currentPage: 'fornecedores',
        fornecedores,
        sucesso: req.query.sucesso || null,
        erro: req.query.erro || null
      });
    } catch (error) {
      console.error('Erro ao listar fornecedores:', error);
      res.redirect(`/?erro=${encodeURIComponent(error.message)}`);
    }
  }

  /**
   * Cadastra novo fornecedor
   */
  static async store(req, res) {
    try {
      const { nome, cnpj, email, telefone, contato } = req.body;
      Fornecedor.create({ nome, cnpj, email, telefone, contato });
      res.redirect('/fornecedores?sucesso=' + encodeURIComponent(`Fornecedor "${nome}" cadastrado com sucesso!`));
    } catch (error) {
      console.error('Erro ao cadastrar fornecedor:', error);
      res.redirect('/fornecedores?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Atualiza fornecedor
   */
  static async update(req, res) {
    try {
      const { id } = req.params;
      const { nome, cnpj, email, telefone, contato } = req.body;
      Fornecedor.update(id, { nome, cnpj, email, telefone, contato });
      res.redirect('/fornecedores?sucesso=' + encodeURIComponent('Fornecedor atualizado com sucesso!'));
    } catch (error) {
      console.error('Erro ao atualizar fornecedor:', error);
      res.redirect('/fornecedores?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Remove fornecedor
   */
  static async delete(req, res) {
    try {
      const { id } = req.params;
      Fornecedor.delete(id);
      res.redirect('/fornecedores?sucesso=' + encodeURIComponent('Fornecedor excluído com sucesso.'));
    } catch (error) {
      console.error('Erro ao remover fornecedor:', error);
      res.redirect('/fornecedores?erro=' + encodeURIComponent(error.message));
    }
  }
}

module.exports = FornecedorController;
