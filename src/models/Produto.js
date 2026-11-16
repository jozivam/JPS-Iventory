const db = require('../../config/database');
const { supabase } = require('../../config/supabase');

const isVercel = !!process.env.VERCEL;
const isSupabaseDriver = process.env.DB_DRIVER === 'supabase';
const useSupabase = isVercel || isSupabaseDriver;

class Produto {
  /**
   * Lista todos os produtos com filtros opcionais
   */
  static async findAll({ busca, categoria, status } = {}) {
    if (useSupabase && supabase) {
      let q = supabase.from('produtos').select('*');

      if (busca && busca.trim()) {
        const b = busca.trim();
        q = q.or(`nome.ilike.%${b}%,sku.ilike.%${b}%,marca.ilike.%${b}%,tag.ilike.%${b}%,patrimonio.ilike.%${b}%,ca.ilike.%${b}%,localizacao.ilike.%${b}%,numero_serie.ilike.%${b}%,observacao.ilike.%${b}%,condicao.ilike.%${b}%`);
      }

      if (categoria && categoria.trim()) {
        q = q.eq('categoria', categoria.trim());
      }

      const { data, error } = await q.order('id', { ascending: false });
      if (error) {
        console.error('Erro ao buscar produtos no Supabase:', error);
        return [];
      }

      let list = (data || []).map(p => ({
        ...p,
        status_estoque: Number(p.quantidade) === 0 ? 'CRITICO' : (Number(p.quantidade) <= Number(p.estoque_minimo) ? 'BAIXO' : 'NORMAL')
      }));

      if (status) {
        list = list.filter(p => p.status_estoque === status);
      }

      return list;
    }

    // Modo SQLite Local
    if (!db) return [];

    let sql = `
      SELECT 
        p.*,
        CASE 
          WHEN p.quantidade = 0 THEN 'CRITICO'
          WHEN p.quantidade <= p.estoque_minimo THEN 'BAIXO'
          ELSE 'NORMAL'
        END as status_estoque
      FROM produtos p
      WHERE 1=1
    `;
    const params = {};

    if (busca && busca.trim()) {
      sql += ` AND (
        p.nome LIKE @busca 
        OR p.sku LIKE @busca 
        OR p.marca LIKE @busca
        OR p.localizacao LIKE @busca
        OR p.tag LIKE @busca
        OR p.patrimonio LIKE @busca
        OR p.numero_serie LIKE @busca
        OR p.ca LIKE @busca
        OR p.observacao LIKE @busca
        OR p.condicao LIKE @busca
      )`;
      params.busca = `%${busca.trim()}%`;
    }

    if (categoria && categoria.trim()) {
      sql += ` AND p.categoria = @categoria`;
      params.categoria = categoria.trim();
    }

    if (status) {
      if (status === 'NORMAL') {
        sql += ` AND p.quantidade > p.estoque_minimo`;
      } else if (status === 'BAIXO') {
        sql += ` AND p.quantidade > 0 AND p.quantidade <= p.estoque_minimo`;
      } else if (status === 'CRITICO') {
        sql += ` AND p.quantidade = 0`;
      }
    }

    sql += ` ORDER BY p.id DESC`;

    return db.prepare(sql).all(params);
  }

  /**
   * Busca um produto por ID
   */
  static async findById(id) {
    if (useSupabase && supabase) {
      const { data, error } = await supabase.from('produtos').select('*').eq('id', id).maybeSingle();
      if (error || !data) return null;
      return {
        ...data,
        status_estoque: Number(data.quantidade) === 0 ? 'CRITICO' : (Number(data.quantidade) <= Number(data.estoque_minimo) ? 'BAIXO' : 'NORMAL')
      };
    }

    if (!db) return null;

    const sql = `
      SELECT 
        p.*,
        CASE 
          WHEN p.quantidade = 0 THEN 'CRITICO'
          WHEN p.quantidade <= p.estoque_minimo THEN 'BAIXO'
          ELSE 'NORMAL'
        END as status_estoque
      FROM produtos p
      WHERE p.id = ?
    `;
    return db.prepare(sql).get(id);
  }

  /**
   * Busca produto por código SKU
   */
  static async findBySku(sku) {
    if (!sku) return null;

    if (useSupabase && supabase) {
      const { data, error } = await supabase.from('produtos').select('*').ilike('sku', sku.trim()).maybeSingle();
      return data || null;
    }

    if (!db) return null;
    return db.prepare('SELECT * FROM produtos WHERE UPPER(sku) = UPPER(?)').get(sku);
  }

  /**
   * Busca produto por nome exato (case-insensitive e sem espaços extras nas pontas)
   */
  static async findByNomeExato(nome) {
    if (!nome || !nome.trim()) return null;
    const nomeTrim = nome.trim();

    if (useSupabase && supabase) {
      const { data } = await supabase
        .from('produtos')
        .select('*')
        .ilike('nome', nomeTrim)
        .limit(1);
      return (data && data.length > 0) ? data[0] : null;
    }

    if (!db) return null;
    return db.prepare('SELECT * FROM produtos WHERE UPPER(TRIM(nome)) = UPPER(?)').get(nomeTrim);
  }

  /**
   * Busca produtos com nomes parecidos/similares para autocomplete
   */
  static async buscarSimilares(termo, limite = 6) {
    if (!termo || !termo.trim()) return [];
    const t = termo.trim();

    if (useSupabase && supabase) {
      const { data } = await supabase
        .from('produtos')
        .select('id, sku, nome, categoria, marca, quantidade, unidade_medida, estoque_minimo')
        .ilike('nome', `%${t}%`)
        .order('id', { ascending: false })
        .limit(limite);
      return data || [];
    }

    if (!db) return [];
    return db.prepare(`
      SELECT id, sku, nome, categoria, marca, quantidade, unidade_medida, estoque_minimo
      FROM produtos 
      WHERE nome LIKE @t
      ORDER BY id DESC 
      LIMIT @limite
    `).all({ t: `%${t}%`, limite });
  }

  /**
   * Cadastra um novo produto
   */
  static async create(dados) {
    const nomeFormatado = dados.nome && dados.nome.trim() ? dados.nome.trim() : 'Item sem descrição';
    const skuFormatado = dados.sku && dados.sku.trim() 
      ? dados.sku.trim().toUpperCase() 
      : Produto.gerarSku(dados.categoria);

    const payload = {
      sku: skuFormatado,
      nome: nomeFormatado,
      categoria: dados.categoria && dados.categoria.trim() ? dados.categoria.trim() : 'Outros',
      marca: dados.marca && dados.marca.trim() ? dados.marca.trim() : null,
      unidade_medida: dados.unidade_medida && dados.unidade_medida.trim() ? dados.unidade_medida.trim().toUpperCase() : 'UN',
      quantidade: parseInt(dados.quantidade, 10) || 0,
      estoque_minimo: parseInt(dados.estoque_minimo, 10) || 0,
      preco_unitario: parseFloat(dados.preco_unitario) || 0.0,
      localizacao: dados.localizacao && dados.localizacao.trim() ? dados.localizacao.trim() : null,
      tamanho: dados.tamanho && dados.tamanho.trim() ? dados.tamanho.trim() : null,
      cor: dados.cor && dados.cor.trim() ? dados.cor.trim() : null,
      peso: dados.peso && dados.peso.trim() ? dados.peso.trim() : null,
      numero_serie: dados.numero_serie && dados.numero_serie.trim() ? dados.numero_serie.trim() : null,
      ca: dados.ca && dados.ca.trim() ? dados.ca.trim() : null,
      patrimonio: dados.patrimonio && dados.patrimonio.trim() ? dados.patrimonio.trim() : null,
      tag: dados.tag && dados.tag.trim() ? dados.tag.trim().toUpperCase() : null,
      observacao: dados.observacao && dados.observacao.trim() ? dados.observacao.trim() : null,
      condicao: dados.condicao && dados.condicao.trim() ? dados.condicao.trim().toUpperCase() : 'NOVO'
    };

    if (useSupabase && supabase) {
      const { data, error } = await supabase.from('produtos').insert(payload).select().single();
      if (error) throw new Error('Falha ao cadastrar no Supabase: ' + error.message);
      return data.id;
    }

    if (!db) throw new Error('Banco de dados não disponível');

    const stmt = db.prepare(`
      INSERT INTO produtos (
        sku, nome, categoria, marca, unidade_medida, quantidade, 
        estoque_minimo, preco_unitario, localizacao,
        tamanho, cor, peso, numero_serie, ca, patrimonio, tag, observacao, condicao
      ) VALUES (
        @sku, @nome, @categoria, @marca, @unidade_medida, @quantidade, 
        @estoque_minimo, @preco_unitario, @localizacao,
        @tamanho, @cor, @peso, @numero_serie, @ca, @patrimonio, @tag, @observacao, @condicao
      )
    `);

    const result = stmt.run(payload);
    return result.lastInsertRowid;
  }

  /**
   * Atualiza um produto existente
   */
  static async update(id, dados) {
    const nomeFormatado = dados.nome && dados.nome.trim() ? dados.nome.trim() : 'Item sem descrição';
    const payload = {
      sku: dados.sku && dados.sku.trim() ? dados.sku.trim().toUpperCase() : dados.sku_atual,
      nome: nomeFormatado,
      categoria: dados.categoria && dados.categoria.trim() ? dados.categoria.trim() : 'Outros',
      marca: dados.marca && dados.marca.trim() ? dados.marca.trim() : null,
      unidade_medida: dados.unidade_medida && dados.unidade_medida.trim() ? dados.unidade_medida.trim().toUpperCase() : 'UN',
      quantidade: parseInt(dados.quantidade, 10) || 0,
      estoque_minimo: parseInt(dados.estoque_minimo, 10) || 0,
      preco_unitario: parseFloat(dados.preco_unitario) || 0.0,
      localizacao: dados.localizacao && dados.localizacao.trim() ? dados.localizacao.trim() : null,
      tamanho: dados.tamanho && dados.tamanho.trim() ? dados.tamanho.trim() : null,
      cor: dados.cor && dados.cor.trim() ? dados.cor.trim() : null,
      peso: dados.peso && dados.peso.trim() ? dados.peso.trim() : null,
      numero_serie: dados.numero_serie && dados.numero_serie.trim() ? dados.numero_serie.trim() : null,
      ca: dados.ca && dados.ca.trim() ? dados.ca.trim() : null,
      patrimonio: dados.patrimonio && dados.patrimonio.trim() ? dados.patrimonio.trim() : null,
      tag: dados.tag && dados.tag.trim() ? dados.tag.trim().toUpperCase() : null,
      observacao: dados.observacao !== undefined ? (dados.observacao && dados.observacao.trim() ? dados.observacao.trim() : null) : (dados.observacao_atual || null),
      condicao: dados.condicao && dados.condicao.trim() ? dados.condicao.trim().toUpperCase() : (dados.condicao_atual || 'NOVO')
    };

    if (useSupabase && supabase) {
      const { error } = await supabase.from('produtos').update(payload).eq('id', id);
      if (error) throw new Error('Falha ao atualizar no Supabase: ' + error.message);
      return true;
    }

    if (!db) throw new Error('Banco de dados não disponível');

    const stmt = db.prepare(`
      UPDATE produtos SET
        sku = @sku,
        nome = @nome,
        categoria = @categoria,
        marca = @marca,
        unidade_medida = @unidade_medida,
        quantidade = @quantidade,
        estoque_minimo = @estoque_minimo,
        preco_unitario = @preco_unitario,
        localizacao = @localizacao,
        tamanho = @tamanho,
        cor = @cor,
        peso = @peso,
        numero_serie = @numero_serie,
        ca = @ca,
        patrimonio = @patrimonio,
        tag = @tag,
        observacao = @observacao,
        condicao = @condicao,
        atualizado_em = datetime('now', 'localtime')
      WHERE id = @id
    `);

    return stmt.run({ id, ...payload });
  }

  /**
   * Remove um produto pelo ID
   */
  static async delete(id) {
    if (useSupabase && supabase) {
      const { error } = await supabase.from('produtos').delete().eq('id', id);
      if (error) throw new Error('Falha ao excluir no Supabase: ' + error.message);
      return true;
    }

    if (!db) throw new Error('Banco de dados não disponível');
    return db.prepare('DELETE FROM produtos WHERE id = ?').run(id);
  }

  /**
   * Retorna estatísticas gerais do inventário
   */
  static async getEstatisticas() {
    if (useSupabase && supabase) {
      const { data, error } = await supabase.from('produtos').select('quantidade, estoque_minimo, preco_unitario');
      if (error || !data) {
        return { total_itens: 0, total_unidades: 0, valor_patrimonial: 0, inStockCount: 0, lowStockCount: 0, outOfStockCount: 0 };
      }
      return {
        total_itens: data.length,
        total_unidades: data.reduce((acc, p) => acc + Number(p.quantidade || 0), 0),
        valor_patrimonial: data.reduce((acc, p) => acc + (Number(p.quantidade || 0) * Number(p.preco_unitario || 0)), 0),
        inStockCount: data.filter(p => Number(p.quantidade || 0) > Number(p.estoque_minimo || 0)).length,
        lowStockCount: data.filter(p => Number(p.quantidade || 0) > 0 && Number(p.quantidade || 0) <= Number(p.estoque_minimo || 0)).length,
        outOfStockCount: data.filter(p => Number(p.quantidade || 0) === 0).length
      };
    }

    if (!db) {
      return { total_itens: 0, total_unidades: 0, valor_patrimonial: 0, inStockCount: 0, lowStockCount: 0, outOfStockCount: 0 };
    }

    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_itens,
        COALESCE(SUM(quantidade), 0) as total_unidades,
        COALESCE(SUM(quantidade * preco_unitario), 0) as valor_patrimonial,
        COALESCE(SUM(CASE WHEN quantidade > estoque_minimo THEN 1 ELSE 0 END), 0) as inStockCount,
        COALESCE(SUM(CASE WHEN quantidade > 0 AND quantidade <= estoque_minimo THEN 1 ELSE 0 END), 0) as lowStockCount,
        COALESCE(SUM(CASE WHEN quantidade = 0 THEN 1 ELSE 0 END), 0) as outOfStockCount
      FROM produtos
    `).get();

    return stats;
  }

  /**
   * Retorna lista de categorias cadastradas, sempre incluindo "Outros"
   */
  static async getCategorias() {
    const categoriasBase = [
      'Ferramentas',
      'EPI / Segurança',
      'Elétrica e TI',
      'Hidráulica',
      'Pintura e Acabamento',
      'Suprimentos Gerais'
    ];

    if (useSupabase && supabase) {
      const { data } = await supabase.from('produtos').select('categoria');
      const cats = (data || []).map(r => r.categoria).filter(c => c && c !== 'Outros');
      const todas = Array.from(new Set([...categoriasBase, ...cats]));
      return [...todas, 'Outros'];
    }

    if (!db) return [...categoriasBase, 'Outros'];

    const rows = db.prepare(`
      SELECT DISTINCT categoria 
      FROM produtos 
      WHERE categoria IS NOT NULL AND TRIM(categoria) != ''
      ORDER BY categoria ASC
    `).all();

    const doBanco = rows.map(r => r.categoria).filter(c => c !== 'Outros');
    const todas = Array.from(new Set([...categoriasBase, ...doBanco]));

    return [...todas, 'Outros'];
  }

  /**
   * Gerador automático de SKU
   */
  static gerarSku(categoria = 'GER') {
    const prefixo = categoria ? categoria.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'ITM') : 'ITM';
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `${prefixo}-${randomNum}`;
  }
}

module.exports = Produto;
