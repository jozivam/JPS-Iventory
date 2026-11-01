const Almoxarifado = require('../models/Almoxarifado');
const Requisicao = require('../models/Requisicao');

class AlmoxarifadoController {
  /**
   * Lista todos os almoxarifados e canteiros de obras cadastrados
   */
  static async index(req, res) {
    try {
      const almoxarifados = Almoxarifado.findAll();
      const requisicoesPendentes = Requisicao.findAll({ status: 'PENDENTE' });

      res.render('almoxarifados/index', {
        title: 'Canteiros & Almoxarifados de Obras',
        currentPage: 'almoxarifados',
        almoxarifados,
        requisicoesPendentes,
        sucesso: req.query.sucesso || null,
        erro: req.query.erro || null
      });
    } catch (error) {
      console.error('Erro ao listar almoxarifados:', error);
      res.redirect(`/?erro=${encodeURIComponent(error.message)}`);
    }
  }

  /**
   * Ficha de um almoxarifado / canteiro específico com seu inventário local
   */
  static async show(req, res) {
    try {
      const { id } = req.params;
      const almoxarifado = Almoxarifado.findById(id);

      if (!almoxarifado) {
        return res.redirect('/almoxarifados?erro=' + encodeURIComponent('Almoxarifado não encontrado.'));
      }

      const estoqueLocal = Almoxarifado.getEstoqueCompleto(id);
      const requisicoes = Requisicao.findAll({ almoxarifado_destino_id: id });

      res.render('almoxarifados/show', {
        title: `${almoxarifado.nome} - Inventário Local`,
        currentPage: 'almoxarifados',
        almoxarifado,
        estoqueLocal,
        requisicoes,
        sucesso: req.query.sucesso || null,
        erro: req.query.erro || null
      });
    } catch (error) {
      console.error('Erro ao abrir canteiro de obra:', error);
      res.redirect('/almoxarifados?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Cadastra novo almoxarifado ou canteiro de obras
   */
  static async store(req, res) {
    try {
      const { codigo, nome, tipo, endereco, responsavel, telefone, status } = req.body;
      const id = Almoxarifado.create({ codigo, nome, tipo, endereco, responsavel, telefone, status });
      res.redirect(`/almoxarifados/${id}?sucesso=` + encodeURIComponent(`Almoxarifado/Obra "${nome}" cadastrado com sucesso!`));
    } catch (error) {
      console.error('Erro ao cadastrar almoxarifado:', error);
      res.redirect('/almoxarifados?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Atualiza dados do almoxarifado
   */
  static async update(req, res) {
    try {
      const { id } = req.params;
      const { codigo, nome, tipo, endereco, responsavel, telefone, status } = req.body;
      Almoxarifado.update(id, { codigo, nome, tipo, endereco, responsavel, telefone, status });
      res.redirect(`/almoxarifados/${id}?sucesso=` + encodeURIComponent('Dados atualizados com sucesso!'));
    } catch (error) {
      console.error('Erro ao atualizar almoxarifado:', error);
      res.redirect(`/almoxarifados/${req.params.id}?erro=` + encodeURIComponent(error.message));
    }
  }
}

module.exports = AlmoxarifadoController;
