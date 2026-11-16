const db = require('../../config/database');
const { supabase } = require('../../config/supabase');
const bcrypt = require('bcryptjs');

const isVercel = !!process.env.VERCEL;
const isSupabaseDriver = process.env.DB_DRIVER === 'supabase';
const useSupabase = isVercel || isSupabaseDriver;

class Colaborador {
  /**
   * Lista todos os colaboradores com filtros opcionais
   */
  static async findAll({ busca, tipo_perfil, nivel_acesso, status } = {}) {
    if (useSupabase && supabase) {
      let q = supabase.from('colaboradores').select('*');

      if (busca && busca.trim()) {
        const b = busca.trim();
        q = q.or(`nome.ilike.%${b}%,matricula.ilike.%${b}%,cargo.ilike.%${b}%,departamento.ilike.%${b}%,email.ilike.%${b}%,telefone.ilike.%${b}%`);
      }

      if (tipo_perfil && tipo_perfil.trim()) {
        q = q.eq('tipo_perfil', tipo_perfil.trim());
      }

      if (nivel_acesso && nivel_acesso.trim()) {
        q = q.eq('nivel_acesso', nivel_acesso.trim());
      }

      if (status && status.trim()) {
        q = q.eq('status', status.trim());
      }

      const { data, error } = await q.order('nome', { ascending: true });
      if (error) {
        console.error('Erro ao buscar colaboradores no Supabase:', error);
        return [];
      }
      return data || [];
    }

    if (!db) return [];

    let sql = `SELECT * FROM colaboradores WHERE 1=1`;
    const params = {};

    if (busca && busca.trim()) {
      sql += ` AND (
        nome LIKE @busca 
        OR matricula LIKE @busca 
        OR cargo LIKE @busca 
        OR departamento LIKE @busca 
        OR email LIKE @busca 
        OR telefone LIKE @busca
      )`;
      params.busca = `%${busca.trim()}%`;
    }

    if (tipo_perfil && tipo_perfil.trim()) {
      sql += ` AND tipo_perfil = @tipo_perfil`;
      params.tipo_perfil = tipo_perfil.trim();
    }

    if (nivel_acesso && nivel_acesso.trim()) {
      sql += ` AND nivel_acesso = @nivel_acesso`;
      params.nivel_acesso = nivel_acesso.trim();
    }

    if (status && status.trim()) {
      sql += ` AND status = @status`;
      params.status = status.trim();
    }

    sql += ` ORDER BY nome ASC`;

    return db.prepare(sql).all(params);
  }

  /**
   * Busca um colaborador por ID
   */
  static async findById(id) {
    if (useSupabase && supabase) {
      const { data, error } = await supabase.from('colaboradores').select('*').eq('id', id).single();
      if (error) return null;
      return data;
    }

    if (!db) return null;
    return db.prepare('SELECT * FROM colaboradores WHERE id = ?').get(id);
  }

  /**
   * Estatísticas da equipe (Total, Usuários do Sistema, Técnicos Solicitantes, Ativos)
   */
  static async getEstatisticas() {
    const todos = await this.findAll();

    const total = todos.length;
    const sistema = todos.filter(c => c.tipo_perfil === 'SISTEMA').length;
    const tecnicos = todos.filter(c => c.tipo_perfil === 'TECNICO').length;
    const ativos = todos.filter(c => c.status === 'ATIVO').length;
    const inativos = todos.filter(c => c.status === 'INATIVO').length;

    return { total, sistema, tecnicos, ativos, inativos };
  }

  /**
   * Busca empréstimos em aberto vinculados ao colaborador
   */
  static async findEmprestimosAtivos(colaboradorNome) {
    if (!colaboradorNome || !colaboradorNome.trim()) return [];
    const nome = colaboradorNome.trim();

    if (useSupabase && supabase) {
      const { data, error } = await supabase
        .from('movimentacoes')
        .select('*, produtos(nome, sku, unidade_medida)')
        .eq('status_emprestimo', 'PENDENTE')
        .ilike('colaborador', `%${nome}%`)
        .order('id', { ascending: false });

      if (error) {
        console.warn('Erro ao buscar empréstimos do colaborador no Supabase:', error);
        return [];
      }

      return (data || []).map(m => ({
        ...m,
        produto_nome: m.produtos ? m.produtos.nome : 'Item',
        produto_sku: m.produtos ? m.produtos.sku : '',
        produto_unidade: m.produtos ? m.produtos.unidade_medida : 'UN'
      }));
    }

    if (!db) return [];

    const sql = `
      SELECT 
        m.*,
        p.nome as produto_nome,
        p.sku as produto_sku,
        p.unidade_medida as produto_unidade
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      WHERE m.status_emprestimo = 'PENDENTE'
        AND m.colaborador LIKE ?
      ORDER BY m.id DESC
    `;
    return db.prepare(sql).all(`%${nome}%`);
  }

  /**
   * Obtém a Ficha Completa e Isolada do Colaborador
   * Vincula e totaliza todos os produtos movimentados do inventário para a ficha deste colaborador.
   */
  static async getFicha(id) {
    const colaborador = await this.findById(id);
    if (!colaborador) {
      throw new Error('Colaborador não encontrado.');
    }

    let movimentacoes = [];

    if (useSupabase && supabase) {
      // Busca movimentações onde colaborador_id = id OU onde o nome do colaborador coincida
      const { data, error } = await supabase
        .from('movimentacoes')
        .select('*, produtos(nome, sku, unidade_medida, categoria, marca)')
        .or(`colaborador_id.eq.${colaborador.id},colaborador.ilike.%${colaborador.nome}%`)
        .order('id', { ascending: false });

      if (error) {
        console.error('Erro ao buscar movimentações da ficha no Supabase:', error);
      } else if (data) {
        movimentacoes = data.map(m => ({
          ...m,
          produto_nome: m.produtos ? m.produtos.nome : 'Item',
          produto_sku: m.produtos ? m.produtos.sku : '',
          produto_unidade: m.produtos ? m.produtos.unidade_medida : 'UN',
          produto_categoria: m.produtos ? m.produtos.categoria : 'Geral',
          produto_marca: m.produtos ? m.produtos.marca : ''
        }));
      }
    } else if (db) {
      const sql = `
        SELECT 
          m.*,
          p.nome as produto_nome,
          p.sku as produto_sku,
          p.unidade_medida as produto_unidade,
          p.categoria as produto_categoria,
          p.marca as produto_marca
        FROM movimentacoes m
        JOIN produtos p ON m.produto_id = p.id
        WHERE m.colaborador_id = ? OR m.colaborador LIKE ?
        ORDER BY m.id DESC
      `;
      movimentacoes = db.prepare(sql).all(colaborador.id, `%${colaborador.nome}%`);
    }

    // Métricas consolidadas da Ficha
    const totalSaidasQtd = movimentacoes
      .filter(m => m.tipo === 'SAIDA')
      .reduce((acc, m) => acc + Number(m.quantidade || 0), 0);

    const totalEmprestimosQtd = movimentacoes
      .filter(m => m.tipo === 'EMPRESTIMO')
      .reduce((acc, m) => acc + Number(m.quantidade || 0), 0);

    const emprestimosAtivos = movimentacoes.filter(m => m.tipo === 'EMPRESTIMO' && m.status_emprestimo === 'PENDENTE');
    const totalEmprestimosAtivosQtd = emprestimosAtivos.reduce((acc, m) => acc + Number(m.quantidade || 0), 0);

    const totalDevolucoesQtd = movimentacoes
      .filter(m => m.tipo === 'DEVOLUCAO' || (m.tipo === 'EMPRESTIMO' && m.status_emprestimo === 'DEVOLVIDO'))
      .reduce((acc, m) => acc + Number(m.quantidade || 0), 0);

    const estatisticasFicha = {
      totalLancamentos: movimentacoes.length,
      totalSaidasQtd,
      totalEmprestimosQtd,
      totalEmprestimosAtivosQtd,
      totalDevolucoesQtd,
      totalEmprestimosPendentesCount: emprestimosAtivos.length
    };

    return {
      colaborador,
      estatisticasFicha,
      emprestimosAtivos,
      movimentacoes
    };
  }

  /**
   * Lista todos os colaboradores acompanhados do resumo de sua ficha (ferramentas em posse, etc)
   */
  static async listarComResumoFicha() {
    const colaboradores = await this.findAll();

    let pendencias = [];

    if (useSupabase && supabase) {
      const { data: p } = await supabase
        .from('movimentacoes')
        .select('colaborador_id, colaborador, tipo, status_emprestimo, quantidade');
      pendencias = p || [];
    } else if (db) {
      pendencias = db.prepare('SELECT colaborador_id, colaborador, tipo, status_emprestimo, quantidade FROM movimentacoes').all();
    }

    return colaboradores.map(c => {
      // Movimentações vinculadas a este colaborador
      const movsDoColab = pendencias.filter(m => 
        (m.colaborador_id && String(m.colaborador_id) === String(c.id)) ||
        (m.colaborador && m.colaborador.toLowerCase() === c.nome.toLowerCase())
      );

      const ferramentasEmAberto = movsDoColab
        .filter(m => m.tipo === 'EMPRESTIMO' && m.status_emprestimo === 'PENDENTE')
        .reduce((acc, m) => acc + Number(m.quantidade || 0), 0);

      const totalSaidas = movsDoColab
        .filter(m => m.tipo === 'SAIDA')
        .reduce((acc, m) => acc + Number(m.quantidade || 0), 0);

      const totalDevolucoes = movsDoColab
        .filter(m => m.tipo === 'DEVOLUCAO' || (m.tipo === 'EMPRESTIMO' && m.status_emprestimo === 'DEVOLVIDO'))
        .reduce((acc, m) => acc + Number(m.quantidade || 0), 0);

      return {
        ...c,
        ferramentasEmAberto,
        totalSaidas,
        totalDevolucoes,
        totalLancamentos: movsDoColab.length,
        temPendencia: ferramentasEmAberto > 0
      };
    });
  }

  /**
   * Cadastra novo colaborador ou usuário do sistema
   */
  static async create({
    nome,
    matricula,
    cargo,
    departamento,
    email,
    telefone,
    tipo_perfil = 'TECNICO',
    nivel_acesso = 'SOLICITANTE',
    status = 'ATIVO',
    login,
    senha,
    observacoes
  }) {
    if (!nome || !nome.trim()) {
      throw new Error('O nome do colaborador é obrigatório.');
    }

    // Regra de negócio: Técnico é estritamente Solicitante de Balcão
    const perfilFinal = tipo_perfil === 'SISTEMA' ? 'SISTEMA' : 'TECNICO';
    let nivelFinal = 'SOLICITANTE';
    if (perfilFinal === 'SISTEMA') {
      nivelFinal = ['ADMIN', 'ALMOXARIFE', 'VISUALIZADOR'].includes(nivel_acesso) ? nivel_acesso : 'ALMOXARIFE';
    }

    // Gera matrícula automática caso não informada
    let matriculaFinal = matricula ? matricula.trim().toUpperCase() : null;
    if (!matriculaFinal) {
      const prefixo = perfilFinal === 'SISTEMA' ? 'ALM' : 'TEC';
      const randomNum = Math.floor(100 + Math.random() * 900);
      matriculaFinal = `${prefixo}-${randomNum}`;
    }

    // Configuração de Login e Senha para Usuários do Sistema
    let loginFinal = null;
    let senhaHashFinal = null;

    if (perfilFinal === 'SISTEMA') {
      if (login && login.trim()) {
        loginFinal = login.trim().toLowerCase();
      } else if (email && email.includes('@')) {
        loginFinal = email.split('@')[0].trim().toLowerCase();
      } else {
        loginFinal = matriculaFinal.toLowerCase();
      }

      const senhaPlana = (senha && senha.trim()) ? senha.trim() : '123456';
      senhaHashFinal = bcrypt.hashSync(senhaPlana, 10);
    }

    const payload = {
      nome: nome.trim(),
      matricula: matriculaFinal,
      cargo: cargo ? cargo.trim() : null,
      departamento: departamento ? departamento.trim() : null,
      email: email ? email.trim() : null,
      telefone: telefone ? telefone.trim() : null,
      tipo_perfil: perfilFinal,
      nivel_acesso: nivelFinal,
      status: status === 'INATIVO' ? 'INATIVO' : 'ATIVO',
      login: loginFinal,
      senha_hash: senhaHashFinal,
      observacoes: observacoes ? observacoes.trim() : null
    };

    if (useSupabase && supabase) {
      const { data, error } = await supabase.from('colaboradores').insert(payload).select().single();
      if (error) {
        if (error.code === '23505') {
          if (error.message.includes('login') || error.details?.includes('login')) {
            throw new Error(`O login "${loginFinal}" já está cadastrado para outro usuário.`);
          }
          throw new Error(`A matrícula "${matriculaFinal}" já está cadastrada para outro colaborador.`);
        }
        throw new Error('Erro ao salvar no Supabase: ' + error.message);
      }
      return data;
    }

    if (!db) throw new Error('Banco de dados não disponível');

    try {
      const stmt = db.prepare(`
        INSERT INTO colaboradores (
          nome, matricula, cargo, departamento, email, telefone,
          tipo_perfil, nivel_acesso, status, login, senha_hash, observacoes
        ) VALUES (
          @nome, @matricula, @cargo, @departamento, @email, @telefone,
          @tipo_perfil, @nivel_acesso, @status, @login, @senha_hash, @observacoes
        )
      `);
      const res = stmt.run(payload);
      return { id: res.lastInsertRowid, ...payload };
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed: colaboradores.login')) {
        throw new Error(`O login "${loginFinal}" já está cadastrado para outro usuário.`);
      }
      if (err.message.includes('UNIQUE constraint failed: colaboradores.matricula')) {
        throw new Error(`A matrícula "${matriculaFinal}" já está cadastrada.`);
      }
      throw err;
    }
  }

  /**
   * Atualiza dados cadastrais
   */
  static async update(id, {
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
  }) {
    if (!nome || !nome.trim()) {
      throw new Error('O nome do colaborador é obrigatório.');
    }

    const colabAtual = await this.findById(id);
    if (!colabAtual) {
      throw new Error('Colaborador não encontrado.');
    }

    const perfilFinal = tipo_perfil === 'SISTEMA' ? 'SISTEMA' : 'TECNICO';
    let nivelFinal = 'SOLICITANTE';
    if (perfilFinal === 'SISTEMA') {
      nivelFinal = ['ADMIN', 'ALMOXARIFE', 'VISUALIZADOR'].includes(nivel_acesso) ? nivel_acesso : 'ALMOXARIFE';
    }

    let loginFinal = null;
    let senhaHashFinal = null;

    if (perfilFinal === 'SISTEMA') {
      if (login && login.trim()) {
        loginFinal = login.trim().toLowerCase();
      } else {
        loginFinal = colabAtual.login || (email && email.includes('@') ? email.split('@')[0].trim().toLowerCase() : (matricula || colabAtual.matricula || '').toLowerCase());
      }

      if (senha && senha.trim()) {
        senhaHashFinal = bcrypt.hashSync(senha.trim(), 10);
      } else {
        senhaHashFinal = colabAtual.senha_hash || bcrypt.hashSync('123456', 10);
      }
    }

    const payload = {
      nome: nome.trim(),
      matricula: matricula ? matricula.trim().toUpperCase() : null,
      cargo: cargo ? cargo.trim() : null,
      departamento: departamento ? departamento.trim() : null,
      email: email ? email.trim() : null,
      telefone: telefone ? telefone.trim() : null,
      tipo_perfil: perfilFinal,
      nivel_acesso: nivelFinal,
      status: status === 'INATIVO' ? 'INATIVO' : 'ATIVO',
      login: loginFinal,
      senha_hash: senhaHashFinal,
      observacoes: observacoes ? observacoes.trim() : null
    };

    if (useSupabase && supabase) {
      const { data, error } = await supabase.from('colaboradores').update(payload).eq('id', id).select().single();
      if (error) {
        if (error.code === '23505') {
          if (error.message.includes('login') || error.details?.includes('login')) {
            throw new Error(`O login "${loginFinal}" já está cadastrado para outro usuário.`);
          }
        }
        throw new Error('Erro ao atualizar no Supabase: ' + error.message);
      }
      return data;
    }

    if (!db) throw new Error('Banco de dados não disponível');

    try {
      db.prepare(`
        UPDATE colaboradores SET
          nome = @nome,
          matricula = @matricula,
          cargo = @cargo,
          departamento = @departamento,
          email = @email,
          telefone = @telefone,
          tipo_perfil = @tipo_perfil,
          nivel_acesso = @nivel_acesso,
          status = @status,
          login = @login,
          senha_hash = @senha_hash,
          observacoes = @observacoes,
          atualizado_em = datetime('now', 'localtime')
        WHERE id = @id
      `).run({ id, ...payload });
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed: colaboradores.login')) {
        throw new Error(`O login "${loginFinal}" já está cadastrado para outro usuário.`);
      }
      throw err;
    }

    return this.findById(id);
  }

  /**
   * Atualiza especificamente o Nível de Acesso e Perfil do Usuário
   */
  static async updateNivelAcesso(id, { tipo_perfil, nivel_acesso, login, senha }) {
    const colabAtual = await this.findById(id);
    if (!colabAtual) {
      throw new Error('Colaborador não encontrado.');
    }

    const perfilFinal = tipo_perfil === 'SISTEMA' ? 'SISTEMA' : 'TECNICO';
    let nivelFinal = 'SOLICITANTE';
    if (perfilFinal === 'SISTEMA') {
      nivelFinal = ['ADMIN', 'ALMOXARIFE', 'VISUALIZADOR'].includes(nivel_acesso) ? nivel_acesso : 'ALMOXARIFE';
    }

    let loginFinal = colabAtual.login;
    let senhaHashFinal = colabAtual.senha_hash;

    if (perfilFinal === 'SISTEMA') {
      if (login && login.trim()) {
        loginFinal = login.trim().toLowerCase();
      } else if (!loginFinal) {
        loginFinal = colabAtual.email ? colabAtual.email.split('@')[0].trim().toLowerCase() : colabAtual.matricula.toLowerCase();
      }

      if (senha && senha.trim()) {
        senhaHashFinal = bcrypt.hashSync(senha.trim(), 10);
      } else if (!senhaHashFinal) {
        senhaHashFinal = bcrypt.hashSync('123456', 10);
      }
    } else {
      loginFinal = null;
      senhaHashFinal = null;
    }

    const payload = {
      tipo_perfil: perfilFinal,
      nivel_acesso: nivelFinal,
      login: loginFinal,
      senha_hash: senhaHashFinal
    };

    if (useSupabase && supabase) {
      const { data, error } = await supabase.from('colaboradores').update(payload).eq('id', id).select().single();
      if (error) throw new Error('Erro ao alterar nível de acesso no Supabase: ' + error.message);
      return data;
    }

    if (!db) throw new Error('Banco de dados não disponível');

    db.prepare(`
      UPDATE colaboradores SET
        tipo_perfil = @tipo_perfil,
        nivel_acesso = @nivel_acesso,
        login = @login,
        senha_hash = @senha_hash,
        atualizado_em = datetime('now', 'localtime')
      WHERE id = @id
    `).run({ id, ...payload });

    return this.findById(id);
  }

  /**
   * Exclui um colaborador
   */
  static async delete(id) {
    const colab = await this.findById(id);
    if (!colab) {
      throw new Error('Colaborador não encontrado.');
    }

    // Verifica se possui empréstimos pendentes
    const pendentes = await this.findEmprestimosAtivos(colab.nome);
    if (pendentes.length > 0) {
      throw new Error(`Não é possível excluir "${colab.nome}". Existem ${pendentes.length} ferramenta(s) emprestada(s) em aberto vinculadas a este colaborador.`);
    }

    if (useSupabase && supabase) {
      const { error } = await supabase.from('colaboradores').delete().eq('id', id);
      if (error) throw new Error('Erro ao excluir no Supabase: ' + error.message);
      return colab;
    }

    if (!db) throw new Error('Banco de dados não disponível');

    db.prepare('DELETE FROM colaboradores WHERE id = ?').run(id);
    return colab;
  }
}

module.exports = Colaborador;
