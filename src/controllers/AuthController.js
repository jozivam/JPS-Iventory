const Colaborador = require('../models/Colaborador');
const {
  definirCookieSessao,
  limparCookieSessao,
  isSafeRedirect,
  isJsonRequest
} = require('../middleware/auth');

// Controle leve em memória contra tentativas excessivas de senha incorreta
const tentativasFalhas = new Map();
const MAX_TENTATIVAS = 10;
const JANELA_BLOQUEIO_MS = 15 * 60 * 1000; // 15 minutos

function obterChaveTentativa(req, login) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'local';
  return `${String(ip).split(',')[0].trim()}::${String(login || '').trim().toLowerCase()}`;
}

function verificarBloqueio(chave) {
  const registro = tentativasFalhas.get(chave);
  if (!registro) return false;
  if (Date.now() - registro.ultimoErro > JANELA_BLOQUEIO_MS) {
    tentativasFalhas.delete(chave);
    return false;
  }
  return registro.count >= MAX_TENTATIVAS;
}

function registrarFalha(chave) {
  const atual = tentativasFalhas.get(chave) || { count: 0, ultimoErro: Date.now() };
  if (Date.now() - atual.ultimoErro > JANELA_BLOQUEIO_MS) {
    tentativasFalhas.set(chave, { count: 1, ultimoErro: Date.now() });
  } else {
    tentativasFalhas.set(chave, { count: atual.count + 1, ultimoErro: Date.now() });
  }
}

function limparFalhas(chave) {
  tentativasFalhas.delete(chave);
}

class AuthController {
  /**
   * Exibe a tela de login
   */
  static showLogin(req, res) {
    if (req.user) {
      const nextUrl = isSafeRedirect(req.query.next) ? req.query.next : '/produtos';
      return res.redirect(nextUrl);
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.render('auth/login', {
      title: 'Acesso ao Sistema — JPS Almoxarifado',
      erro: req.query.erro || null,
      sucesso: req.query.sucesso || null,
      nextUrl: isSafeRedirect(req.query.next) ? req.query.next : '',
      loginInformado: '',
      isLogout: req.query.logout === '1'
    });
  }

  /**
   * Processa o login do usuário autorizado
   */
  static async login(req, res) {
    const login = req.body.login ? String(req.body.login).trim() : '';
    const senha = req.body.senha ? String(req.body.senha) : '';
    const lembrar = req.body.lembrar === 'on' || req.body.lembrar === '1' || req.body.lembrar === true;
    const nextUrl = isSafeRedirect(req.body.next) ? req.body.next : '/produtos';

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    const renderErro = (statusCode, mensagem) => {
      return res.status(statusCode).render('auth/login', {
        title: 'Acesso ao Sistema — JPS Almoxarifado',
        erro: mensagem,
        sucesso: null,
        nextUrl: nextUrl !== '/produtos' ? nextUrl : '',
        loginInformado: login,
        isLogout: false
      });
    };

    if (!login || !senha) {
      return renderErro(400, 'Informe seu usuário (login, e-mail ou matrícula) e senha para entrar.');
    }

    const chave = obterChaveTentativa(req, login);
    if (verificarBloqueio(chave)) {
      return renderErro(
        429,
        'Muitas tentativas incorretas. Aguarde alguns minutos e tente novamente ou contate o administrador.'
      );
    }

    try {
      const resultado = await Colaborador.autenticar(login, senha);

      if (!resultado.ok) {
        registrarFalha(chave);
        return renderErro(401, resultado.erro);
      }

      limparFalhas(chave);
      definirCookieSessao(req, res, resultado.usuario, lembrar);

      return res.redirect(nextUrl);
    } catch (error) {
      console.error('Erro ao processar login:', error);
      return renderErro(500, 'Não foi possível validar suas credenciais no momento. Tente novamente.');
    }
  }

  /**
   * Encerra a sessão do usuário
   */
  static logout(req, res) {
    limparCookieSessao(req, res);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.redirect('/login?logout=1&sucesso=' + encodeURIComponent('Você saiu do sistema com segurança.'));
  }

  /**
   * Permite que o usuário autenticado altere a própria senha
   */
  static async alterarSenha(req, res) {
    try {
      const { senha_atual, nova_senha, confirmar_senha } = req.body || {};

      if (!senha_atual || !nova_senha) {
        throw new Error('Preencha a senha atual e a nova senha.');
      }

      if (nova_senha.trim().length < 4) {
        throw new Error('A nova senha deve ter pelo menos 4 caracteres.');
      }

      if (confirmar_senha !== undefined && nova_senha !== confirmar_senha) {
        throw new Error('A confirmação de senha não confere com a nova senha.');
      }

      await Colaborador.alterarPropriaSenha(req.user.id, senha_atual, nova_senha);

      if (isJsonRequest(req)) {
        return res.json({
          ok: true,
          mensagem: 'Sua senha foi alterada com sucesso!'
        });
      }

      const referer = req.headers.referer;
      let destino = '/produtos';
      if (referer) {
        try {
          const parsed = new URL(referer);
          if (isSafeRedirect(parsed.pathname)) destino = parsed.pathname;
        } catch (_) {}
      }

      return res.redirect(`${destino}?sucesso=${encodeURIComponent('Sua senha de acesso foi atualizada com sucesso!')}`);
    } catch (error) {
      if (isJsonRequest(req)) {
        return res.status(400).json({ ok: false, erro: error.message });
      }

      const referer = req.headers.referer;
      let destino = '/produtos';
      if (referer) {
        try {
          const parsed = new URL(referer);
          if (isSafeRedirect(parsed.pathname)) destino = parsed.pathname;
        } catch (_) {}
      }

      return res.redirect(`${destino}?erro=${encodeURIComponent(error.message)}`);
    }
  }
}

module.exports = AuthController;
