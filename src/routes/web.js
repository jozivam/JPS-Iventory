const express = require('express');
const router = express.Router();

const ProdutoController = require('../controllers/ProdutoController');
const EstoqueController = require('../controllers/EstoqueController');
const BuscaController = require('../controllers/BuscaController');

// --- PÁGINA INICIAL (Direciona diretamente para o Inventário) ---
router.get('/', (req, res) => {
  res.redirect('/produtos');
});

// --- BUSCA GERAL NO SISTEMA ---
router.get('/busca', BuscaController.index);

// --- INVENTÁRIO (PRODUTOS) ---
router.get('/produtos', ProdutoController.index);
router.get('/produtos/novo', ProdutoController.create);
router.post('/produtos', ProdutoController.store);
router.get('/produtos/:id/detalhes', ProdutoController.detalhes);
router.get('/produtos/:id/editar', ProdutoController.edit);
router.post('/produtos/:id/editar', ProdutoController.update);
router.post('/produtos/:id/excluir', ProdutoController.delete);

// --- MOVIMENTAÇÕES (ENTRADAS E SAÍDAS) ---
router.get('/movimentacoes', EstoqueController.index);
router.get('/movimentacoes/nova', EstoqueController.create);
router.post('/movimentacoes', EstoqueController.registrar);

module.exports = router;
