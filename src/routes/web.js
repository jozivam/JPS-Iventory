const express = require('express');
const router = express.Router();

const DashboardController = require('../controllers/DashboardController');
const ProdutoController = require('../controllers/ProdutoController');
const EstoqueController = require('../controllers/EstoqueController');
const FornecedorController = require('../controllers/FornecedorController');
const RelatorioController = require('../controllers/RelatorioController');
const AlmoxarifadoController = require('../controllers/AlmoxarifadoController');
const TransferenciaController = require('../controllers/TransferenciaController');

// --- DASHBOARD PRINCIPAL ---
router.get('/', DashboardController.index);

// --- PRODUTOS ---
router.get('/produtos', ProdutoController.index);
router.get('/produtos/novo', ProdutoController.create);
router.post('/produtos', ProdutoController.store);
router.get('/produtos/:id', ProdutoController.show); // Ficha Completa do Produto
router.get('/produtos/:id/editar', ProdutoController.edit);
router.post('/produtos/:id/editar', ProdutoController.update);
router.post('/produtos/:id/excluir', ProdutoController.delete);

// --- ESTOQUE / MOVIMENTAÇÕES (BAIXA E ENTRADA) ---
router.get('/movimentacoes', EstoqueController.index);
router.get('/movimentacoes/nova', EstoqueController.create);
router.post('/movimentacoes', EstoqueController.registrar);

// --- ALMOXARIFADOS E CANTEIROS DE OBRAS ---
router.get('/almoxarifados', AlmoxarifadoController.index);
router.post('/almoxarifados', AlmoxarifadoController.store);
router.get('/almoxarifados/:id', AlmoxarifadoController.show);
router.post('/almoxarifados/:id/editar', AlmoxarifadoController.update);

// --- TRANSFERÊNCIAS E REQUISIÇÕES ENTRE OBRAS ---
router.get('/transferencias', TransferenciaController.index);
router.get('/transferencias/nova', TransferenciaController.create);
router.post('/transferencias', TransferenciaController.store);
router.post('/requisicoes/:id/atender', TransferenciaController.atender);
router.post('/requisicoes/:id/cancelar', TransferenciaController.cancelar);

// --- FORNECEDORES ---
router.get('/fornecedores', FornecedorController.index);
router.post('/fornecedores', FornecedorController.store);
router.post('/fornecedores/:id/editar', FornecedorController.update);
router.post('/fornecedores/:id/excluir', FornecedorController.delete);

// --- RELATÓRIOS ---
router.get('/relatorios', RelatorioController.index);

module.exports = router;
