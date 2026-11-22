const Colaborador = require('../models/Colaborador');

class ColaboradorController {
  /**
   * Página Principal: Lista de Colaboradores e Usuários
   */
  static async index(req, res) {
    try {
      const { busca, tipo_perfil, nivel_acesso, status, sucesso, erro } = req.query;

      const [colaboradoresRaw, estatisticas] = await Promise.all([
        Colaborador.findAll({ busca, tipo_perfil, nivel_acesso, status }),
        Colaborador.getEstatisticas()
      ]);

      // Remove senha_hash antes de enviar para a view/HTML
      const colaboradores = (colaboradoresRaw || []).map(({ senha_hash, ...dados }) => ({
        ...dados,
        tem_senha: !!senha_hash
      }));

      res.render('colaboradores/index', {
        title: 'Colaboradores e Usuários do Sistema',
        currentPage: 'colaboradores',
        colaboradores,
        estatisticas,
        filtros: {
          busca: busca || '',
          tipo_perfil: tipo_perfil || '',
          nivel_acesso: nivel_acesso || '',
          status: status || ''
        },
        sucesso: sucesso || null,
        erro: erro || null
      });
    } catch (error) {
      console.error('Erro ao listar colaboradores:', error);
      res.status(500).render('layouts/erro', {
        title: 'Erro em Colaboradores',
        currentPage: 'colaboradores',
        mensagem: 'Não foi possível carregar a lista de colaboradores.',
        detalhes: error.message
      });
    }
  }

  /**
   * Cadastra novo colaborador ou usuário do sistema
   */
  static async store(req, res) {
    try {
      const { 
        nome, matricula, cargo, departamento, email, telefone, 
        tipo_perfil, nivel_acesso, status, login, senha, observacoes 
      } = req.body;

      // Apenas ADMIN pode cadastrar usuários com acesso ao sistema
      if (tipo_perfil === 'SISTEMA' && req.user?.nivel_acesso !== 'ADMIN') {
        throw new Error('Apenas Administradores podem cadastrar ou autorizar Usuários do Sistema.');
      }

      const colab = await Colaborador.create({
        nome,
        matricula,
        cargo,
        departamento,
        email,
        telefone,
        tipo_perfil,
        nivel_acesso,
        status,
        login,
        senha,
        observacoes
      });

      const perfilDesc = colab.tipo_perfil === 'SISTEMA' 
        ? `Usuário do Sistema (${colab.nivel_acesso}) [Login: ${colab.login}]` 
        : 'Técnico Solicitante';

      res.redirect('/colaboradores?sucesso=' + encodeURIComponent(`"${colab.nome}" cadastrado com sucesso como ${perfilDesc}!`));
    } catch (error) {
      console.error('Erro ao cadastrar colaborador:', error);
      res.redirect('/colaboradores?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Retorna os detalhes de um colaborador em JSON (para o modal interativo)
   */
  static async detalhes(req, res) {
    try {
      const { id } = req.params;
      const colaborador = await Colaborador.findById(id);

      if (!colaborador) {
        return res.status(404).json({ erro: 'Colaborador não encontrado.' });
      }

      const emprestimosAtivos = await Colaborador.findEmprestimosAtivos(colaborador.nome);

      // Não expõe a hash da senha, mas sinaliza se já possui senha
      const { senha_hash, ...dadosSeguros } = colaborador;

      res.json({
        sucesso: true,
        colaborador: {
          ...dadosSeguros,
          tem_senha: !!senha_hash
        },
        emprestimosAtivos
      });
    } catch (error) {
      console.error('Erro ao buscar detalhes do colaborador:', error);
      res.status(500).json({ erro: error.message });
    }
  }

  /**
   * Atualiza dados cadastrais
   */
  static async update(req, res) {
    try {
      const { id } = req.params;
      const { 
        nome, matricula, cargo, departamento, email, telefone, 
        tipo_perfil, nivel_acesso, status, login, senha, observacoes 
      } = req.body;

      const colabAlvo = await Colaborador.findById(id);
      if (!colabAlvo) {
        throw new Error('Colaborador não encontrado.');
      }

      // Apenas ADMIN pode alterar contas do tipo SISTEMA ou promover alguém para SISTEMA
      if ((colabAlvo.tipo_perfil === 'SISTEMA' || tipo_perfil === 'SISTEMA') && req.user?.nivel_acesso !== 'ADMIN') {
        throw new Error('Apenas Administradores podem editar Usuários do Sistema ou conceder acesso à plataforma.');
      }

      // Impede remover/inativar o último Administrador ativo ou bloquear a si mesmo
      const eraAdminAtivo = colabAlvo.tipo_perfil === 'SISTEMA' && colabAlvo.nivel_acesso === 'ADMIN' && colabAlvo.status === 'ATIVO';
      const continuaraAdminAtivo = tipo_perfil === 'SISTEMA' && nivel_acesso === 'ADMIN' && status !== 'INATIVO';
      if (eraAdminAtivo && !continuaraAdminAtivo) {
        if (req.user && String(req.user.id) === String(colabAlvo.id)) {
          throw new Error('Você não pode inativar ou remover seu próprio acesso de Administrador.');
        }
        const totalAdmins = await Colaborador.countAdminsAtivos();
        if (totalAdmins <= 1) {
          throw new Error('Não é possível remover ou inativar o último Administrador ativo do sistema.');
        }
      }

      await Colaborador.update(id, {
        nome,
        matricula,
        cargo,
        departamento,
        email,
        telefone,
        tipo_perfil,
        nivel_acesso,
        status,
        login,
        senha,
        observacoes
      });

      res.redirect('/colaboradores?sucesso=' + encodeURIComponent(`Dados de "${nome}" atualizados com sucesso!`));
    } catch (error) {
      console.error('Erro ao atualizar colaborador:', error);
      res.redirect('/colaboradores?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Atualiza especificamente o Nível de Acesso (acionado pelo modal de detalhes)
   */
  static async updateNivelAcesso(req, res) {
    try {
      const { id } = req.params;
      const { tipo_perfil, nivel_acesso, login, senha } = req.body;

      const colabAlvo = await Colaborador.findById(id);
      if (!colabAlvo) {
        throw new Error('Colaborador não encontrado.');
      }

      const eraAdminAtivo = colabAlvo.tipo_perfil === 'SISTEMA' && colabAlvo.nivel_acesso === 'ADMIN' && colabAlvo.status === 'ATIVO';
      const continuaraAdmin = tipo_perfil === 'SISTEMA' && nivel_acesso === 'ADMIN';
      if (eraAdminAtivo && !continuaraAdmin) {
        if (req.user && String(req.user.id) === String(colabAlvo.id)) {
          throw new Error('Você não pode rebaixar seu próprio perfil de Administrador.');
        }
        const totalAdmins = await Colaborador.countAdminsAtivos();
        if (totalAdmins <= 1) {
          throw new Error('Não é possível remover o perfil de Administrador do último administrador ativo.');
        }
      }

      const atualizado = await Colaborador.updateNivelAcesso(id, { tipo_perfil, nivel_acesso, login, senha });
      const { senha_hash, ...atualizadoSeguro } = atualizado || {};

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ sucesso: true, colaborador: atualizadoSeguro });
      }

      const perfilDesc = atualizado.tipo_perfil === 'SISTEMA' 
        ? `Usuário do Sistema (${atualizado.nivel_acesso})` 
        : 'Técnico de Campo (Apenas Balcão)';

      res.redirect('/colaboradores?sucesso=' + encodeURIComponent(`Nível de acesso de "${atualizado.nome}" atualizado para: ${perfilDesc}.`));
    } catch (error) {
      console.error('Erro ao alterar nível de acesso:', error);
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ erro: error.message });
      }
      res.redirect('/colaboradores?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Exclui um colaborador
   */
  static async delete(req, res) {
    try {
      const { id } = req.params;
      if (req.user && String(req.user.id) === String(id)) {
        throw new Error('Você não pode excluir o seu próprio cadastro enquanto está logado.');
      }

      const colabAlvo = await Colaborador.findById(id);
      if (colabAlvo && colabAlvo.tipo_perfil === 'SISTEMA' && colabAlvo.nivel_acesso === 'ADMIN' && colabAlvo.status === 'ATIVO') {
        const totalAdmins = await Colaborador.countAdminsAtivos();
        if (totalAdmins <= 1) {
          throw new Error('Não é possível excluir o último Administrador ativo do sistema.');
        }
      }

      const colabExcluido = await Colaborador.delete(id);

      res.redirect('/colaboradores?sucesso=' + encodeURIComponent(`Colaborador "${colabExcluido.nome}" excluído com sucesso!`));
    } catch (error) {
      console.error('Erro ao excluir colaborador:', error);
      res.redirect('/colaboradores?erro=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Redireciona para a nova página de Controle de Fichas
   */
  static async ficha(req, res) {
    return res.redirect('/fichas?colaborador_id=' + req.params.id);
  }

  /**
   * Endpoint de API para listagem rápida (utilizado no autocomplete do Balcão)
   */
  static async apiListar(req, res) {
    try {
      const { tipo_perfil } = req.query;
      const colaboradores = await Colaborador.findAll({ 
        tipo_perfil: tipo_perfil || '',
        status: 'ATIVO' 
      });

      res.json(colaboradores.map(c => ({
        id: c.id,
        nome: c.nome,
        matricula: c.matricula,
        cargo: c.cargo,
        departamento: c.departamento,
        tipo_perfil: c.tipo_perfil,
        nivel_acesso: c.nivel_acesso
      })));
    } catch (error) {
      res.status(500).json({ erro: error.message });
    }
  }
}

module.exports = ColaboradorController;
