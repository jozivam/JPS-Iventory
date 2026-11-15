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

// --- ROTA DE DIAGNÓSTICO (Health Check) ---
router.get('/api/diagnostico', async (req, res) => {
  const { supabase } = require('../../config/supabase');
  let prodsCount = 0;
  let movsCount = 0;
  let erro = null;
  try {
    if (supabase) {
      const { data: p, error: ep } = await supabase.from('produtos').select('id');
      const { data: m, error: em } = await supabase.from('movimentacoes').select('id');
      if (ep) erro = ep.message;
      else if (em) erro = em.message;
      prodsCount = p ? p.length : 0;
      movsCount = m ? m.length : 0;
    }
  } catch (e) {
    erro = e.message;
  }
  res.json({
    status: erro ? 'erro' : 'ok',
    ambiente: process.env.VERCEL ? 'vercel-production' : 'local-development',
    driver: process.env.DB_DRIVER || 'padrao',
    supabaseAtivo: !!supabase,
    produtosNoSupabase: prodsCount,
    movimentacoesNoSupabase: movsCount,
    erro
  });
});

module.exports = router;
