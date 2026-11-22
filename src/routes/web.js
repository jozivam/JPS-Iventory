const express = require('express');
const router = express.Router();
const multer = require('multer');

// Configuração de upload em memória para planilhas Excel (até 15MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

const AuthController = require('../controllers/AuthController');
const ProdutoController = require('../controllers/ProdutoController');
const EstoqueController = require('../controllers/EstoqueController');
const BuscaController = require('../controllers/BuscaController');
const BalcaoController = require('../controllers/BalcaoController');
const ColaboradorController = require('../controllers/ColaboradorController');
const FichaController = require('../controllers/FichaController');
const RelatorioController = require('../controllers/RelatorioController');
const SuprimentoController = require('../controllers/SuprimentoController');
const OfflineSyncController = require('../controllers/OfflineSyncController');
const { requireAuth, requireRole } = require('../middleware/auth');

// =========================================================================
// ROTAS PÚBLICAS (Autenticação e Ping de Conectividade)
// =========================================================================
router.get('/login', AuthController.showLogin);
router.post('/login', AuthController.login);
router.get('/logout', AuthController.logout);
router.post('/logout', AuthController.logout);
router.get('/api/offline/ping', OfflineSyncController.ping);

// =========================================================================
// BARREIRA DE AUTENTICAÇÃO: TODAS AS ROTAS ABAIXO EXIGEM USUÁRIO AUTORIZADO
// =========================================================================
router.use(requireAuth);

// --- MINHA CONTA (Alteração da própria senha) ---
router.post('/minha-conta/senha', AuthController.alterarSenha);

// --- PÁGINA INICIAL (Direciona diretamente para o Inventário) ---
router.get('/', (req, res) => {
  res.redirect('/produtos');
});

// --- BUSCA GERAL NO SISTEMA ---
router.get('/busca', BuscaController.index);

// --- INVENTÁRIO (PRODUTOS) ---
router.get('/produtos', ProdutoController.index);
router.get('/produtos/novo', requireRole('ADMIN', 'ALMOXARIFE'), ProdutoController.create);
router.post('/produtos', requireRole('ADMIN', 'ALMOXARIFE'), ProdutoController.store);
router.get('/produtos/sugestoes', ProdutoController.sugestoesNome);
router.get('/produtos/modelo/excel', ProdutoController.baixarModelo);
router.get('/produtos/exportar/excel', ProdutoController.exportarExcel);
router.post('/produtos/importar/excel', requireRole('ADMIN', 'ALMOXARIFE'), upload.single('planilha'), ProdutoController.importarExcel);
router.get('/produtos/:id/detalhes', ProdutoController.detalhes);
router.get('/produtos/:id/movimentacoes', ProdutoController.movimentacoes);
router.get('/produtos/:id/editar', requireRole('ADMIN', 'ALMOXARIFE'), ProdutoController.edit);
router.post('/produtos/:id/editar', requireRole('ADMIN', 'ALMOXARIFE'), ProdutoController.update);
router.post('/produtos/:id/excluir', requireRole('ADMIN'), ProdutoController.delete);

// --- BALCÃO (ATENDIMENTO, LANÇAMENTOS E EMPRÉSTIMOS) ---
router.get('/balcao', BalcaoController.index);
router.post('/balcao/registrar', requireRole('ADMIN', 'ALMOXARIFE', 'OPERADOR_FICHAS'), BalcaoController.registrar);
router.post('/balcao/devolver/:id', requireRole('ADMIN', 'ALMOXARIFE', 'OPERADOR_FICHAS'), BalcaoController.devolver);

// --- MOVIMENTAÇÕES (HISTÓRICO E GESTÃO) ---
router.get('/movimentacoes', EstoqueController.index);
router.get('/movimentacoes/exportar/excel', EstoqueController.exportarExcel);
// Redireciona criação de movimentação para o Balcão unificado
router.get('/movimentacoes/nova', (req, res) => {
  const q = new URLSearchParams(req.query).toString();
  res.redirect('/balcao' + (q ? '?' + q : ''));
});
router.post('/movimentacoes', requireRole('ADMIN', 'ALMOXARIFE'), EstoqueController.registrar);
router.post('/movimentacoes/:id/editar', requireRole('ADMIN', 'ALMOXARIFE'), EstoqueController.update);
router.post('/movimentacoes/:id/excluir', requireRole('ADMIN'), EstoqueController.delete);

// --- CONTROLE DE FICHAS DE COLABORADORES ---
router.get('/fichas', FichaController.index);
router.get('/fichas/:colaborador_id', (req, res) => res.redirect('/fichas?colaborador_id=' + req.params.colaborador_id));

// --- CONTROLE DE SUPRIMENTOS DO CANTEIRO ---
router.get('/suprimentos', SuprimentoController.index);
router.post('/suprimentos', requireRole('ADMIN', 'ALMOXARIFE'), SuprimentoController.store);
router.post('/suprimentos/movimentar', requireRole('ADMIN', 'ALMOXARIFE', 'OPERADOR_FICHAS'), SuprimentoController.movimentar);

// --- CENTRAL DE RELATÓRIOS (GERENCIAL, OPERACIONAL, PDF & EXCEL) ---
router.get('/relatorios', RelatorioController.index);
router.get('/relatorios/pdf', RelatorioController.pdf);
router.get('/relatorios/exportar/excel', RelatorioController.exportarExcel);

// --- COLABORADORES E USUÁRIOS DO SISTEMA ---
router.get('/colaboradores', ColaboradorController.index);
router.post('/colaboradores', requireRole('ADMIN', 'ALMOXARIFE', 'OPERADOR_FICHAS'), ColaboradorController.store);
router.get('/colaboradores/:id/ficha', (req, res) => res.redirect('/fichas?colaborador_id=' + req.params.id));
router.get('/colaboradores/:id/detalhes', ColaboradorController.detalhes);
router.post('/colaboradores/:id/editar', requireRole('ADMIN', 'ALMOXARIFE', 'OPERADOR_FICHAS'), ColaboradorController.update);
router.post('/colaboradores/:id/nivel-acesso', requireRole('ADMIN'), ColaboradorController.updateNivelAcesso);
router.post('/colaboradores/:id/excluir', requireRole('ADMIN'), ColaboradorController.delete);
router.get('/api/colaboradores', ColaboradorController.apiListar);

// --- SINCRONIZAÇÃO OFFLINE-FIRST (CANTEIRO DE OBRA / APK) ---
router.post('/api/offline/sync', requireRole('ADMIN', 'ALMOXARIFE', 'OPERADOR_FICHAS'), OfflineSyncController.sync);

// --- ROTA DE DIAGNÓSTICO (Health Check - Restrito a Administradores) ---
router.get('/api/diagnostico', requireRole('ADMIN'), async (req, res) => {
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
