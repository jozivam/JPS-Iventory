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
const BalcaoController = require('../controllers/BalcaoController');
const ColaboradorController = require('../controllers/ColaboradorController');

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
router.get('/produtos/sugestoes', ProdutoController.sugestoesNome);
router.get('/produtos/exportar/excel', ProdutoController.exportarExcel);
router.post('/produtos/importar/excel', upload.single('planilha'), ProdutoController.importarExcel);
router.get('/produtos/:id/detalhes', ProdutoController.detalhes);
router.get('/produtos/:id/editar', ProdutoController.edit);
router.post('/produtos/:id/editar', ProdutoController.update);
router.post('/produtos/:id/excluir', ProdutoController.delete);

// --- BALCÃO (ATENDIMENTO, LANÇAMENTOS E EMPRÉSTIMOS) ---
router.get('/balcao', BalcaoController.index);
router.post('/balcao/registrar', BalcaoController.registrar);
router.post('/balcao/devolver/:id', BalcaoController.devolver);

// --- MOVIMENTAÇÕES (HISTÓRICO E GESTÃO) ---
router.get('/movimentacoes', EstoqueController.index);
router.get('/movimentacoes/exportar/excel', EstoqueController.exportarExcel);
// Redireciona criação de movimentação para o Balcão unificado
router.get('/movimentacoes/nova', (req, res) => {
  const q = new URLSearchParams(req.query).toString();
  res.redirect('/balcao' + (q ? '?' + q : ''));
});
router.post('/movimentacoes', EstoqueController.registrar);
router.post('/movimentacoes/:id/editar', EstoqueController.update);
router.post('/movimentacoes/:id/excluir', EstoqueController.delete);

// --- COLABORADORES E USUÁRIOS DO SISTEMA ---
router.get('/colaboradores', ColaboradorController.index);
router.post('/colaboradores', ColaboradorController.store);
router.get('/colaboradores/:id/ficha', ColaboradorController.ficha);
router.get('/colaboradores/:id/detalhes', ColaboradorController.detalhes);
router.post('/colaboradores/:id/editar', ColaboradorController.update);
router.post('/colaboradores/:id/nivel-acesso', ColaboradorController.updateNivelAcesso);
router.post('/colaboradores/:id/excluir', ColaboradorController.delete);
router.get('/api/colaboradores', ColaboradorController.apiListar);

// --- ROTA DE DIAGNÓSTICO (Health Check) ---
router.get('/api/diagnostico', async (req, res) => {
  const { supabase } = require('../../config/supabase');
  let prodsCount = 0;
  let movsCount = 0;
  let colabsCount = 0;
  let erro = null;
  try {
    if (supabase) {
      const { data: p, error: ep } = await supabase.from('produtos').select('id');
      const { data: m, error: em } = await supabase.from('movimentacoes').select('id');
      const { data: c, error: ec } = await supabase.from('colaboradores').select('id');
      if (ep) erro = ep.message;
      else if (em) erro = em.message;
      else if (ec) erro = ec.message;
      prodsCount = p ? p.length : 0;
      movsCount = m ? m.length : 0;
      colabsCount = c ? c.length : 0;
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
    colaboradoresNoSupabase: colabsCount,
    erro
  });
});

module.exports = router;
