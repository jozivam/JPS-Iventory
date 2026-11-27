const db = require('../../config/database');
const { supabase } = require('../../config/supabase');
const Movimentacao = require('./Movimentacao');
const Produto = require('./Produto');

const isVercel = !!process.env.VERCEL;
const isSupabaseDriver = process.env.DB_DRIVER === 'supabase';
const useSupabase = isVercel || isSupabaseDriver;

class Requisicao {
  /**
   * Gera um código de requisição amigável único (ex: REQ-4821)
   */
  static gerarCodigo() {
    const num = Math.floor(1000 + Math.random() * 9000);
    return `REQ-${num}`;
  }

  /**
   * Lista requisições com filtros e dados do produto e colaborador
   */
  static async findAll({ status, produto_id, colaborador_id, solicitante, limite = 100 } = {}) {
    if (useSupabase && supabase) {
      let q = supabase
        .from('requisicoes')
        .select(`
          *,
          produtos(id, nome, sku, unidade_medida, categoria, marca, quantidade, estoque_minimo),
          colaboradores(id, matricula, cargo, departamento, telefone)
        `);

      if (status && status.trim() && status.trim() !== 'TODAS') {
        q = q.eq('status', status.trim());
      }
      if (produto_id) {
        q = q.eq('produto_id', parseInt(produto_id, 10));
      }
      if (colaborador_id) {
        q = q.eq('colaborador_id', parseInt(colaborador_id, 10));
      }
      if (solicitante && solicitante.trim()) {
        q = q.ilike('solicitante_nome', `%${solicitante.trim()}%`);
      }

      const { data, error } = await q.order('id', { ascending: false }).limit(limite);
      if (error) {
        console.error('Erro ao buscar requisições no Supabase:', error);
        return [];
      }

      return (data || []).map(r => ({
        ...r,
        produto_nome: r.produtos ? r.produtos.nome : 'Item',
        produto_sku: r.produtos ? r.produtos.sku : '',
        produto_unidade: r.produtos ? r.produtos.unidade_medida : 'UN',
        produto_categoria: r.produtos ? r.produtos.categoria : 'Geral',
        produto_saldo_atual: r.produtos ? r.produtos.quantidade : 0,
        produto_estoque_minimo: r.produtos ? r.produtos.estoque_minimo : 0,
        colaborador_matricula: r.colaboradores ? r.colaboradores.matricula : '',
        colaborador_cargo: r.colaboradores ? r.colaboradores.cargo : '',
        colaborador_departamento: r.colaboradores ? r.colaboradores.departamento : ''
      }));
    }

    if (!db) return [];

    let sql = `
      SELECT 
        r.*,
        p.nome as produto_nome,
        p.sku as produto_sku,
        p.unidade_medida as produto_unidade,
        p.categoria as produto_categoria,
        p.quantidade as produto_saldo_atual,
        p.estoque_minimo as produto_estoque_minimo,
        c.matricula as colaborador_matricula,
        c.cargo as colaborador_cargo,
        c.departamento as colaborador_departamento
      FROM requisicoes r
      JOIN produtos p ON r.produto_id = p.id
      LEFT JOIN colaboradores c ON r.colaborador_id = c.id
      WHERE 1=1
    `;
    const params = {};

    if (status && status.trim() && status.trim() !== 'TODAS') {
      sql += ` AND r.status = @status`;
      params.status = status.trim();
    }
    if (produto_id) {
      sql += ` AND r.produto_id = @produto_id`;
      params.produto_id = parseInt(produto_id, 10);
    }
    if (colaborador_id) {
      sql += ` AND r.colaborador_id = @colaborador_id`;
      params.colaborador_id = parseInt(colaborador_id, 10);
    }
    if (solicitante && solicitante.trim()) {
      sql += ` AND r.solicitante_nome LIKE @solicitante`;
      params.solicitante = `%${solicitante.trim()}%`;
    }

    sql += ` ORDER BY r.id DESC LIMIT ${parseInt(limite, 10) || 100}`;
    return db.prepare(sql).all(params);
  }

  /**
   * Busca requisição por ID com todos os detalhes
   */
  static async findById(id) {
    if (!id) return null;
    const reqId = parseInt(id, 10);

    if (useSupabase && supabase) {
      const { data, error } = await supabase
        .from('requisicoes')
        .select(`
          *,
          produtos(id, nome, sku, unidade_medida, categoria, marca, quantidade, estoque_minimo),
          colaboradores(id, matricula, cargo, departamento, telefone)
        `)
        .eq('id', reqId)
        .maybeSingle();

      if (error || !data) return null;

      return {
        ...data,
        produto_nome: data.produtos ? data.produtos.nome : 'Item',
        produto_sku: data.produtos ? data.produtos.sku : '',
        produto_unidade: data.produtos ? data.produtos.unidade_medida : 'UN',
        produto_categoria: data.produtos ? data.produtos.categoria : 'Geral',
        produto_saldo_atual: data.produtos ? data.produtos.quantidade : 0,
        produto_estoque_minimo: data.produtos ? data.produtos.estoque_minimo : 0,
        colaborador_matricula: data.colaboradores ? data.colaboradores.matricula : '',
        colaborador_cargo: data.colaboradores ? data.colaboradores.cargo : '',
        colaborador_departamento: data.colaboradores ? data.colaboradores.departamento : ''
      };
    }

    if (!db) return null;

    const sql = `
      SELECT 
        r.*,
        p.nome as produto_nome,
        p.sku as produto_sku,
        p.unidade_medida as produto_unidade,
        p.categoria as produto_categoria,
        p.quantidade as produto_saldo_atual,
        p.estoque_minimo as produto_estoque_minimo,
        c.matricula as colaborador_matricula,
        c.cargo as colaborador_cargo,
        c.departamento as colaborador_departamento
      FROM requisicoes r
      JOIN produtos p ON r.produto_id = p.id
      LEFT JOIN colaboradores c ON r.colaborador_id = c.id
      WHERE r.id = ?
    `;
    return db.prepare(sql).get(reqId);
  }

  /**
   * Busca requisições pendentes aguardando aprovação do almoxarife
   */
  static async findPendentes(limite = 20) {
    return this.findAll({ status: 'PENDENTE', limite });
  }

  /**
   * Cria uma nova requisição (feita por Técnico de Segurança, encarregado ou solicitante)
   */
  static async create({
    produto_id,
    colaborador_id,
    colaborador_nome,
    solicitante_nome,
    solicitante_id,
    tipo_operacao = 'SAIDA',
    quantidade = 1,
    motivo,
    documento_ref
  }) {
    if (!produto_id) throw new Error('Produto é obrigatório para abrir requisição.');
    
    // Se não informou colaborador ou se for Balcão, padroniza como 'Balcão' (uso geral sem ficha)
    const colabNomeFinal = (colaborador_nome && colaborador_nome.trim() && colaborador_nome.trim().toLowerCase() !== 'balcão' && colaborador_nome.trim().toLowerCase() !== 'balcao')
      ? colaborador_nome.trim()
      : 'Balcão';
    const colabIdFinal = (colabNomeFinal === 'Balcão') ? null : (colaborador_id ? parseInt(colaborador_id, 10) : null);

    if (!solicitante_nome || !solicitante_nome.trim()) {
      throw new Error('Nome do solicitante (ex: Técnico de Segurança) é obrigatório.');
    }

    const qtd = parseInt(quantidade, 10);
    if (!qtd || qtd <= 0) throw new Error('A quantidade requisitada deve ser maior que zero.');

    const codigo = this.gerarCodigo();
    const tipoOp = ['SAIDA', 'EMPRESTIMO', 'TROCA'].includes(tipo_operacao) ? tipo_operacao : 'SAIDA';

    if (useSupabase && supabase) {
      const { data, error } = await supabase
        .from('requisicoes')
        .insert([{
          codigo,
          produto_id: parseInt(produto_id, 10),
          colaborador_id: colabIdFinal,
          colaborador_nome: colabNomeFinal,
          solicitante_nome: solicitante_nome.trim(),
          solicitante_id: solicitante_id ? parseInt(solicitante_id, 10) : null,
          tipo_operacao: tipoOp,
          quantidade: qtd,
          status: 'PENDENTE',
          motivo: motivo ? motivo.trim() : null,
          documento_ref: documento_ref ? documento_ref.trim() : null
        }])
        .select()
        .single();

      if (error) {
        console.error('Erro ao criar requisição no Supabase:', error);
        throw new Error('Não foi possível registrar a requisição no Supabase: ' + error.message);
      }
      return data;
    }

    if (!db) throw new Error('Banco de dados local não disponível.');

    const stmt = db.prepare(`
      INSERT INTO requisicoes (
        codigo, produto_id, colaborador_id, colaborador_nome, solicitante_nome,
        solicitante_id, tipo_operacao, quantidade, status, motivo, documento_ref
      ) VALUES (
        @codigo, @produto_id, @colaborador_id, @colaborador_nome, @solicitante_nome,
        @solicitante_id, @tipo_operacao, @quantidade, 'PENDENTE', @motivo, @documento_ref
      )
    `);

    const info = stmt.run({
      codigo,
      produto_id: parseInt(produto_id, 10),
      colaborador_id: colabIdFinal,
      colaborador_nome: colabNomeFinal,
      solicitante_nome: solicitante_nome.trim(),
      solicitante_id: solicitante_id ? parseInt(solicitante_id, 10) : null,
      tipo_operacao: tipoOp,
      quantidade: qtd,
      motivo: motivo ? motivo.trim() : null,
      documento_ref: documento_ref ? documento_ref.trim() : null
    });

    return { id: info.lastInsertRowid, codigo, status: 'PENDENTE' };
  }

  /**
   * Almoxarife aceita e entrega a requisição:
   * Efetiva a movimentação real no estoque (baixa, empréstimo ou troca) e vincula
   */
  static async aprovar(id, { almoxarife_responsavel = 'Jozivam Silva', motivo_atendimento } = {}) {
    const req = await this.findById(id);
    if (!req) throw new Error('Requisição não encontrada.');
    if (req.status !== 'PENDENTE') {
      throw new Error(`Esta requisição já foi finalizada anteriormente (Status: ${req.status}).`);
    }

    // Validação de saldo em estoque
    const prod = await Produto.findById(req.produto_id);
    if (!prod) throw new Error('Produto associado à requisição não encontrado.');

    if (Number(prod.quantidade) < req.quantidade) {
      throw new Error(`Estoque insuficiente para atender esta requisição! Disponível: ${prod.quantidade} ${prod.unidade_medida || 'UN'}, Solicitado: ${req.quantidade} ${prod.unidade_medida || 'UN'}.`);
    }

    const motivoMov = motivo_atendimento && motivo_atendimento.trim() 
      ? motivo_atendimento.trim() 
      : (req.motivo ? `[Atendendo Req ${req.codigo}] ${req.motivo}` : `Atendimento da requisição ${req.codigo}`);

    // Registra a movimentação no estoque
    const movResultado = await Movimentacao.registrar({
      produto_id: req.produto_id,
      tipo: req.tipo_operacao,
      quantidade: req.quantidade,
      colaborador: req.colaborador_nome,
      colaborador_id: req.colaborador_id,
      responsavel: almoxarife_responsavel.trim(),
      motivo: motivoMov,
      documento_ref: req.codigo
    });

    const nowIso = new Date().toISOString();

    if (useSupabase && supabase) {
      const { data, error } = await supabase
        .from('requisicoes')
        .update({
          status: 'APROVADA',
          almoxarife_responsavel: almoxarife_responsavel.trim(),
          movimentacao_id: movResultado.id || null,
          respondido_em: nowIso
        })
        .eq('id', req.id)
        .select()
        .single();

      if (error) {
        console.error('Erro ao aprovar requisição no Supabase:', error);
      }
      return {
        requisicao: data || req,
        movimentacao: movResultado,
        novo_saldo: movResultado.novo_saldo
      };
    }

    if (db) {
      db.prepare(`
        UPDATE requisicoes 
        SET status = 'APROVADA',
            almoxarife_responsavel = @almoxarife,
            movimentacao_id = @mov_id,
            respondido_em = datetime('now', 'localtime')
        WHERE id = @id
      `).run({
        id: req.id,
        almoxarife: almoxarife_responsavel.trim(),
        mov_id: movResultado.id || null
      });
    }

    return {
      requisicao: { ...req, status: 'APROVADA', almoxarife_responsavel },
      movimentacao: movResultado,
      novo_saldo: movResultado.novo_saldo
    };
  }

  /**
   * Almoxarife recusa a solicitação com justificativa
   */
  static async recusar(id, { almoxarife_responsavel = 'Jozivam Silva', motivo_recusa } = {}) {
    const req = await this.findById(id);
    if (!req) throw new Error('Requisição não encontrada.');
    if (req.status !== 'PENDENTE') {
      throw new Error(`Esta requisição já foi finalizada anteriormente (Status: ${req.status}).`);
    }
    if (!motivo_recusa || !motivo_recusa.trim()) {
      throw new Error('Por favor, informe a justificativa da recusa da requisição.');
    }

    const nowIso = new Date().toISOString();

    if (useSupabase && supabase) {
      const { data, error } = await supabase
        .from('requisicoes')
        .update({
          status: 'RECUSADA',
          almoxarife_responsavel: almoxarife_responsavel.trim(),
          motivo_recusa: motivo_recusa.trim(),
          respondido_em: nowIso
        })
        .eq('id', req.id)
        .select()
        .single();

      if (error) {
        console.error('Erro ao recusar requisição no Supabase:', error);
      }
      return data || req;
    }

    if (db) {
      db.prepare(`
        UPDATE requisicoes 
        SET status = 'RECUSADA',
            almoxarife_responsavel = @almoxarife,
            motivo_recusa = @motivo,
            respondido_em = datetime('now', 'localtime')
        WHERE id = @id
      `).run({
        id: req.id,
        almoxarife: almoxarife_responsavel.trim(),
        motivo: motivo_recusa.trim()
      });
    }

    return { ...req, status: 'RECUSADA', motivo_recusa, almoxarife_responsavel };
  }

  /**
   * Solicitante cancela a requisição própria se ainda estiver pendente
   */
  static async cancelar(id, { solicitante_nome } = {}) {
    const req = await this.findById(id);
    if (!req) throw new Error('Requisição não encontrada.');
    if (req.status !== 'PENDENTE') {
      throw new Error('Apenas requisições pendentes podem ser canceladas.');
    }

    const nowIso = new Date().toISOString();

    if (useSupabase && supabase) {
      await supabase
        .from('requisicoes')
        .update({
          status: 'CANCELADA',
          motivo_recusa: `Cancelado pelo solicitante (${solicitante_nome || 'Usuário'})`,
          respondido_em: nowIso
        })
        .eq('id', req.id);
    } else if (db) {
      db.prepare(`
        UPDATE requisicoes 
        SET status = 'CANCELADA',
            motivo_recusa = 'Cancelado pelo solicitante',
            respondido_em = datetime('now', 'localtime')
        WHERE id = ?
      `).run(req.id);
    }
    return { ...req, status: 'CANCELADA' };
  }

  /**
   * Resumo de contagens para o Dashboard e Menu
   */
  static async getEstatisticas() {
    let pendentes = 0;
    let aprovadas = 0;
    let recusadas = 0;
    let total = 0;

    if (useSupabase && supabase) {
      const { data } = await supabase.from('requisicoes').select('status');
      if (data && data.length > 0) {
        total = data.length;
        data.forEach(r => {
          if (r.status === 'PENDENTE') pendentes++;
          else if (r.status === 'APROVADA') aprovadas++;
          else if (r.status === 'RECUSADA') recusadas++;
        });
      }
    } else if (db) {
      const rows = db.prepare(`SELECT status, COUNT(*) as qtd FROM requisicoes GROUP BY status`).all();
      rows.forEach(r => {
        if (r.status === 'PENDENTE') pendentes = r.qtd;
        else if (r.status === 'APROVADA') aprovadas = r.qtd;
        else if (r.status === 'RECUSADA') recusadas = r.qtd;
        total += r.qtd;
      });
    }

    return { pendentes, aprovadas, recusadas, total };
  }
}

module.exports = Requisicao;
