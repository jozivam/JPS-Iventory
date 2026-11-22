const crypto = require('crypto');
const Colaborador = require('../models/Colaborador');

const COOKIE_NAME = 'jps_session';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias
const REMEMBER_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 dias

function getSessionSecret() {
  return (
    process.env.SESSION_SECRET ||
    'jps_almoxarifado_session_secret_2026_v1_chavesegura'
  );
}

/**
 * Remove campos sensíveis do objeto de usuário antes de expor em req/views
 */
function sanitizarUsuario(colab) {
  if (!colab) return null;
  return {
    id: colab.id,
    nome: colab.nome,
    matricula: colab.matricula || '',
    cargo: colab.cargo || '',
    departamento: colab.departamento || '',
    email: colab.email || '',
    telefone: colab.telefone || '',
    tipo_perfil: colab.tipo_perfil,
    nivel_acesso: colab.nivel_acesso,
    status: colab.status,
    login: colab.login || ''
  };
}

/**
 * Faz o parse manual do cabeçalho Cookie sem depender de pacotes extras
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return cookies;

  cookieHeader.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch (_) {
        cookies[key] = val;
      }
    }
  });

  return cookies;
}

/**
 * Gera assinatura HMAC-SHA256 em base64url
 */
function assinarDados(dadosBase64) {
  return crypto
    .createHmac('sha256', getSessionSecret())
    .update(dadosBase64)
    .digest('base64url');
}

/**
 * Cria token stateless assinado (compatível com Vercel Serverless & local)
 */
function criarTokenSessao(usuario, lembrar = true) {
  const ttl = lembrar ? REMEMBER_TTL_SECONDS : DEFAULT_TTL_SECONDS;
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    id: usuario.id,
    login: usuario.login,
    nivel_acesso: usuario.nivel_acesso,
    iat: nowSec,
    exp: nowSec + ttl
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = assinarDados(payloadB64);
  return {
    token: `${payloadB64}.${signature}`,
    maxAge: ttl
  };
}

/**
 * Valida assinatura e expiração do token de sessão
 */
function verificarTokenSessao(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) return null;

  const expectedSig = assinarDados(payloadB64);
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');

  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload || !payload.id || !payload.exp || payload.exp < nowSec) {
      return null;
    }
    return payload;
  } catch (_) {
    return null;
  }
}

function isHttpsRequest(req) {
  return !!(
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.VERCEL
  );
}

/**
 * Define o cookie de sessão seguro no response
 */
function definirCookieSessao(req, res, usuario, lembrar = true) {
  const { token, maxAge } = criarTokenSessao(usuario, lembrar);
  const secureFlag = isHttpsRequest(req) ? '; Secure' : '';
  const cookieStr = `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureFlag}`;
  res.setHeader('Set-Cookie', cookieStr);
}

/**
 * Remove o cookie de sessão
 */
function limparCookieSessao(req, res) {
  const secureFlag = isHttpsRequest(req) ? '; Secure' : '';
  const cookieStr = `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}`;
  res.setHeader('Set-Cookie', cookieStr);
}

/**
 * Valida se um caminho de redirecionamento é interno e seguro
 */
function isSafeRedirect(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith('/')) return false;
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return false;
  if (trimmed.startsWith('/login') || trimmed.startsWith('/logout')) return false;
  return true;
}

/**
 * Detecta se a requisição espera resposta JSON (API ou AJAX)
 */
function isJsonRequest(req) {
  return !!(
    req.path.startsWith('/api/') ||
    req.xhr ||
    (req.headers.accept && req.headers.accept.includes('application/json')) ||
    (req.headers['content-type'] && req.headers['content-type'].includes('application/json'))
  );
}

/**
 * Middleware global: carrega o usuário autenticado a partir do cookie assinado
 * e valida em tempo real se ele continua ATIVO e com perfil SISTEMA no banco.
 */
async function carregarUsuario(req, res, next) {
  req.user = null;
  res.locals.usuarioLogado = null;

  try {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[COOKIE_NAME];
    if (!token) return next();

    const payload = verificarTokenSessao(token);
    if (!payload) {
      limparCookieSessao(req, res);
      return next();
    }

    const colab = await Colaborador.findById(payload.id);
    if (!colab || colab.tipo_perfil !== 'SISTEMA' || colab.status !== 'ATIVO') {
      limparCookieSessao(req, res);
      return next();
    }

    const usuario = sanitizarUsuario(colab);
    req.user = usuario;
    res.locals.usuarioLogado = usuario;
    return next();
  } catch (err) {
    console.error('Erro ao validar sessão do usuário:', err);
    return next();
  }
}

/**
 * Middleware de proteção de rotas: exige usuário autenticado e autorizado
 */
function requireAuth(req, res, next) {
  if (req.user) {
    return next();
  }

  if (isJsonRequest(req)) {
    return res.status(401).json({
      ok: false,
      authRequired: true,
      erro: 'Sessão expirada ou acesso não autenticado. Faça login para continuar.',
      redirect: '/login'
    });
  }

  const destino = req.method === 'GET' && isSafeRedirect(req.originalUrl)
    ? `?next=${encodeURIComponent(req.originalUrl)}`
    : '';

  return res.redirect('/login' + destino);
}

/**
 * Middleware de autorização por nível de acesso (RBAC)
 * Ex: requireRole('ADMIN') ou requireRole('ADMIN', 'ALMOXARIFE')
 */
function requireRole(...niveisPermitidos) {
  return (req, res, next) => {
    if (!req.user) {
      return requireAuth(req, res, next);
    }

    if (niveisPermitidos.includes(req.user.nivel_acesso)) {
      return next();
    }

    const mensagemErro =
      req.user.nivel_acesso === 'VISUALIZADOR'
        ? 'Acesso negado: seu perfil (Visualizador) possui permissão apenas de consulta.'
        : req.user.nivel_acesso === 'OPERADOR_FICHAS'
          ? 'Acesso negado: seu perfil (Operador de Fichas) permite visualização e lançamentos em fichas de colaboradores, mas não permite cadastrar ou editar produtos e cadastros.'
          : 'Acesso restrito: esta ação exige permissão de Administrador.';

    if (isJsonRequest(req)) {
      return res.status(403).json({
        ok: false,
        erro: mensagemErro
      });
    }

    // Se veio de um formulário POST, tenta redirecionar para a página anterior com aviso amigável
    const referer = req.headers.referer;
    if (req.method !== 'GET' && referer) {
      try {
        const refUrl = new URL(referer);
        const caminhoSeguro = refUrl.pathname;
        if (isSafeRedirect(caminhoSeguro)) {
          return res.redirect(`${caminhoSeguro}?erro=${encodeURIComponent(mensagemErro)}`);
        }
      } catch (_) {}
    }

    return res.status(403).render('layouts/erro', {
      title: 'Acesso Restrito',
      currentPage: '',
      mensagem: 'Permissão Insuficiente',
      detalhes: mensagemErro
    });
  };
}

module.exports = {
  COOKIE_NAME,
  sanitizarUsuario,
  parseCookies,
  criarTokenSessao,
  verificarTokenSessao,
  definirCookieSessao,
  limparCookieSessao,
  isSafeRedirect,
  isJsonRequest,
  carregarUsuario,
  requireAuth,
  requireRole
};
