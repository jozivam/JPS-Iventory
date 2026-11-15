const express = require('express');
const router = express.Router();
const multer = require('multer');

// Configuração de upload em memória para planilhas Excel (até 15MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

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
router.get('/produtos/exportar/excel', ProdutoController.exportarExcel);
router.post('/produtos/importar/excel', upload.single('planilha'), ProdutoController.importarExcel);
router.get('/produtos/:id/detalhes', ProdutoController.detalhes);
router.get('/produtos/:id/editar', ProdutoController.edit);
router.post('/produtos/:id/editar', ProdutoController.update);
router.post('/produtos/:id/excluir', ProdutoController.delete);

// --- MOVIMENTAÇÕES (HISTÓRICO E GESTÃO) ---
router.get('/movimentacoes', EstoqueController.index);
router.get('/movimentacoes/exportar/excel', EstoqueController.exportarExcel);
router.get('/movimentacoes/nova', EstoqueController.create);
router.post('/movimentacoes', EstoqueController.registrar);
router.post('/movimentacoes/:id/editar', EstoqueController.update);
router.post('/movimentacoes/:id/excluir', EstoqueController.delete);

module.exports = router;
