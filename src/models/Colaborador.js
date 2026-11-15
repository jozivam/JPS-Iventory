const db = require('../../config/database');
const { supabase } = require('../../config/supabase');

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
      observacoes: observacoes ? observacoes.trim() : null
    };

    if (useSupabase && supabase) {
      const { data, error } = await supabase.from('colaboradores').insert(payload).select().single();
      if (error) {
        if (error.code === '23505') {
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
          tipo_perfil, nivel_acesso, status, observacoes
        ) VALUES (
          @nome, @matricula, @cargo, @departamento, @email, @telefone,
          @tipo_perfil, @nivel_acesso, @status, @observacoes
        )
      `);
      const res = stmt.run(payload);
      return { id: res.lastInsertRowid, ...payload };
    } catch (err) {
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
    observacoes
  }) {
    if (!nome || !nome.trim()) {
      throw new Error('O nome do colaborador é obrigatório.');
    }

    const perfilFinal = tipo_perfil === 'SISTEMA' ? 'SISTEMA' : 'TECNICO';
    let nivelFinal = 'SOLICITANTE';
    if (perfilFinal === 'SISTEMA') {
      nivelFinal = ['ADMIN', 'ALMOXARIFE', 'VISUALIZADOR'].includes(nivel_acesso) ? nivel_acesso : 'ALMOXARIFE';
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
      observacoes: observacoes ? observacoes.trim() : null
    };

    if (useSupabase && supabase) {
      const { data, error } = await supabase.from('colaboradores').update(payload).eq('id', id).select().single();
      if (error) throw new Error('Erro ao atualizar no Supabase: ' + error.message);
      return data;
    }

    if (!db) throw new Error('Banco de dados não disponível');

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
        observacoes = @observacoes,
        atualizado_em = datetime('now', 'localtime')
      WHERE id = @id
    `).run({ id, ...payload });

    return this.findById(id);
  }

  /**
   * Atualiza especificamente o Nível de Acesso e Perfil do Usuário
   */
  static async updateNivelAcesso(id, { tipo_perfil, nivel_acesso }) {
    const perfilFinal = tipo_perfil === 'SISTEMA' ? 'SISTEMA' : 'TECNICO';
    let nivelFinal = 'SOLICITANTE';
    if (perfilFinal === 'SISTEMA') {
      nivelFinal = ['ADMIN', 'ALMOXARIFE', 'VISUALIZADOR'].includes(nivel_acesso) ? nivel_acesso : 'ALMOXARIFE';
    }

    const payload = {
      tipo_perfil: perfilFinal,
      nivel_acesso: nivelFinal
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
