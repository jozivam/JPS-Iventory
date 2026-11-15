const db = require('../../config/database');
const { supabase } = require('../../config/supabase');

const isVercel = !!process.env.VERCEL;
const isSupabaseDriver = process.env.DB_DRIVER === 'supabase';
const useSupabase = isVercel || isSupabaseDriver;

class Movimentacao {
  /**
   * Lista histórico de movimentações com filtros opcionais
   */
  static async findAll({ produto_id, tipo, data_inicio, data_fim, busca, limite = 200 } = {}) {
    if (useSupabase && supabase) {
      let q = supabase.from('movimentacoes').select('*, produtos(nome, sku, unidade_medida, marca, tag, patrimonio)');

      if (produto_id) {
        q = q.eq('produto_id', parseInt(produto_id, 10));
      }

      if (tipo && (tipo === 'ENTRADA' || tipo === 'SAIDA')) {
        q = q.eq('tipo', tipo);
      }

      if (data_inicio && data_inicio.trim()) {
        q = q.gte('criado_em', data_inicio.trim() + 'T00:00:00');
      }

      if (data_fim && data_fim.trim()) {
        q = q.lte('criado_em', data_fim.trim() + 'T23:59:59');
      }

      const { data, error } = await q.order('id', { ascending: false }).limit(limite);
      if (error) {
        console.error('Erro ao buscar movimentações no Supabase:', error);
        return [];
      }

      let list = (data || []).map(m => ({
        ...m,
        produto_nome: m.produtos ? m.produtos.nome : 'Item',
        produto_sku: m.produtos ? m.produtos.sku : '',
        produto_unidade: m.produtos ? m.produtos.unidade_medida : 'UN'
      }));

      if (busca && busca.trim()) {
        const b = busca.trim().toLowerCase();
        list = list.filter(m => 
          (m.responsavel && m.responsavel.toLowerCase().includes(b)) ||
          (m.motivo && m.motivo.toLowerCase().includes(b)) ||
          (m.documento_ref && m.documento_ref.toLowerCase().includes(b)) ||
          (m.produto_nome && m.produto_nome.toLowerCase().includes(b)) ||
          (m.produto_sku && m.produto_sku.toLowerCase().includes(b))
        );
      }

      return list;
    }

    if (!db) return [];

    let sql = `
      SELECT 
        m.*,
        p.nome as produto_nome,
        p.sku as produto_sku,
        p.unidade_medida as produto_unidade
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      WHERE 1=1
    `;
    const params = {};

    if (produto_id) {
      sql += ` AND m.produto_id = @produto_id`;
      params.produto_id = parseInt(produto_id, 10);
    }

    if (tipo && (tipo === 'ENTRADA' || tipo === 'SAIDA')) {
      sql += ` AND m.tipo = @tipo`;
      params.tipo = tipo;
    }

    if (data_inicio && data_inicio.trim()) {
      sql += ` AND date(m.criado_em) >= date(@data_inicio)`;
      params.data_inicio = data_inicio.trim();
    }

    if (data_fim && data_fim.trim()) {
      sql += ` AND date(m.criado_em) <= date(@data_fim)`;
      params.data_fim = data_fim.trim();
    }

    if (busca && busca.trim()) {
      sql += ` AND (
        m.responsavel LIKE @busca
        OR m.motivo LIKE @busca
        OR m.documento_ref LIKE @busca
        OR p.nome LIKE @busca
        OR p.sku LIKE @busca
      )`;
      params.busca = `%${busca.trim()}%`;
    }

    sql += ` ORDER BY m.id DESC LIMIT @limite`;
    params.limite = limite;

    return db.prepare(sql).all(params);
  }

  /**
   * Busca movimentação por ID
   */
  static async findById(id) {
    if (useSupabase && supabase) {
      const { data, error } = await supabase.from('movimentacoes').select('*, produtos(nome, sku, unidade_medida, quantidade)').eq('id', id).maybeSingle();
      if (error || !data) return null;
      return {
        ...data,
        produto_nome: data.produtos ? data.produtos.nome : 'Item',
        produto_sku: data.produtos ? data.produtos.sku : '',
        produto_unidade: data.produtos ? data.produtos.unidade_medida : 'UN',
        produto_quantidade_atual: data.produtos ? data.produtos.quantidade : 0
      };
    }

    if (!db) return null;

    const sql = `
      SELECT 
        m.*,
        p.nome as produto_nome,
        p.sku as produto_sku,
        p.unidade_medida as produto_unidade,
        p.quantidade as produto_quantidade_atual
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      WHERE m.id = ?
    `;
    return db.prepare(sql).get(id);
  }

  /**
   * Registra uma nova movimentação atômica
   */
  static async registrar({ produto_id, tipo, quantidade, motivo, responsavel, documento_ref }) {
    const qtd = parseInt(quantidade, 10);
    if (!qtd || qtd <= 0) {
      throw new Error('A quantidade deve ser um número inteiro maior que zero.');
    }

    if (!['ENTRADA', 'SAIDA'].includes(tipo)) {
      throw new Error('Tipo de movimentação inválido. Deve ser ENTRADA ou SAIDA.');
    }

    if (useSupabase && supabase) {
      const { data: prod, error: errProd } = await supabase.from('produtos').select('id, nome, quantidade').eq('id', produto_id).single();
      if (errProd || !prod) {
        throw new Error('Produto selecionado não existe.');
      }

      if (tipo === 'SAIDA' && Number(prod.quantidade) < qtd) {
        throw new Error(`Saldo insuficiente para o produto "${prod.nome}". Saldo atual: ${prod.quantidade}, solicitado: ${qtd}.`);
      }

      const fator = tipo === 'ENTRADA' ? 1 : -1;
      const novoSaldo = Number(prod.quantidade) + (qtd * fator);

      await supabase.from('produtos').update({ quantidade: novoSaldo }).eq('id', produto_id);

      const { data: mov, error: errMov } = await supabase.from('movimentacoes').insert({
        produto_id,
        tipo,
        quantidade: qtd,
        motivo: motivo ? motivo.trim() : (tipo === 'ENTRADA' ? 'Entrada no estoque' : 'Baixa de material'),
        responsavel: responsavel ? responsavel.trim() : 'Não informado',
        documento_ref: documento_ref ? documento_ref.trim() : null
      }).select().single();

      if (errMov) throw new Error('Falha ao registrar movimentação no Supabase: ' + errMov.message);

      return {
        id: mov.id,
        produto_id,
        produto_nome: prod.nome,
        novo_saldo: novoSaldo
      };
    }

    if (!db) throw new Error('Banco de dados não disponível');

    const tx = db.transaction(() => {
      const produto = db.prepare('SELECT id, nome, quantidade FROM produtos WHERE id = ?').get(produto_id);
      if (!produto) {
        throw new Error('Produto selecionado não existe.');
      }

      if (tipo === 'SAIDA' && produto.quantidade < qtd) {
        throw new Error(`Saldo insuficiente para o produto "${produto.nome}". Saldo atual: ${produto.quantidade}, solicitado: ${qtd}.`);
      }

      const fator = tipo === 'ENTRADA' ? 1 : -1;
      const novoSaldo = produto.quantidade + (qtd * fator);

      db.prepare(`
        UPDATE produtos 
        SET quantidade = ?, atualizado_em = datetime('now', 'localtime') 
        WHERE id = ?
      `).run(novoSaldo, produto_id);

      const insertStmt = db.prepare(`
        INSERT INTO movimentacoes (
          produto_id, tipo, quantidade, motivo, responsavel, documento_ref
        ) VALUES (
          @produto_id, @tipo, @quantidade, @motivo, @responsavel, @documento_ref
        )
      `);

      const res = insertStmt.run({
        produto_id,
        tipo,
        quantidade: qtd,
        motivo: motivo ? motivo.trim() : (tipo === 'ENTRADA' ? 'Entrada no estoque' : 'Baixa de material'),
        responsavel: responsavel ? responsavel.trim() : 'Não informado',
        documento_ref: documento_ref ? documento_ref.trim() : null
      });

      return {
        id: res.lastInsertRowid,
        produto_id,
        produto_nome: produto.nome,
        novo_saldo: novoSaldo
      };
    });

    return tx();
  }

  /**
   * Edita uma movimentação existente e recalcula o inventário
   */
  static async update(id, { produto_id, tipo, quantidade, motivo, responsavel, documento_ref }) {
    const novaQtd = parseInt(quantidade, 10);
    if (!novaQtd || novaQtd <= 0) {
      throw new Error('A quantidade deve ser um número maior que zero.');
    }

    if (!['ENTRADA', 'SAIDA'].includes(tipo)) {
      throw new Error('Tipo de movimentação inválido. Deve ser ENTRADA ou SAIDA.');
    }

    if (useSupabase && supabase) {
      const { data: movAntiga, error: errMov } = await supabase.from('movimentacoes').select('*').eq('id', id).single();
      if (errMov || !movAntiga) throw new Error('Movimentação não encontrada.');

      const { data: prodAntigo, error: errProd } = await supabase.from('produtos').select('*').eq('id', movAntiga.produto_id).single();
      if (errProd || !prodAntigo) throw new Error('Produto de origem da movimentação não encontrado.');

      const novoProdutoId = produto_id ? parseInt(produto_id, 10) : movAntiga.produto_id;
      const mesmoProduto = (novoProdutoId === movAntiga.produto_id);

      const estornoAntigo = (movAntiga.tipo === 'ENTRADA') ? -Number(movAntiga.quantidade) : Number(movAntiga.quantidade);
      const saldoProdAntigoRevertido = Number(prodAntigo.quantidade) + estornoAntigo;

      if (mesmoProduto) {
        const efeitoNovo = (tipo === 'ENTRADA') ? novaQtd : -novaQtd;
        const saldoFinal = saldoProdAntigoRevertido + efeitoNovo;
        if (saldoFinal < 0) {
          throw new Error(`Esta alteração deixaria o estoque de "${prodAntigo.nome}" negativo (${saldoFinal}). Operação não permitida.`);
        }
        await supabase.from('produtos').update({ quantidade: saldoFinal }).eq('id', prodAntigo.id);
      } else {
        if (saldoProdAntigoRevertido < 0) {
          throw new Error(`O estorno deixaria o estoque do produto antigo "${prodAntigo.nome}" negativo. Operação não permitida.`);
        }
        await supabase.from('produtos').update({ quantidade: saldoProdAntigoRevertido }).eq('id', prodAntigo.id);

        const { data: prodNovo, error: errProdNovo } = await supabase.from('produtos').select('*').eq('id', novoProdutoId).single();
        if (errProdNovo || !prodNovo) throw new Error('Novo produto selecionado não encontrado.');

        const efeitoNovo = (tipo === 'ENTRADA') ? novaQtd : -novaQtd;
        const saldoNovoFinal = Number(prodNovo.quantidade) + efeitoNovo;
        if (saldoNovoFinal < 0) {
          throw new Error(`Esta alteração deixaria o estoque de "${prodNovo.nome}" negativo (${saldoNovoFinal}). Operação não permitida.`);
        }
        await supabase.from('produtos').update({ quantidade: saldoNovoFinal }).eq('id', prodNovo.id);
      }

      await supabase.from('movimentacoes').update({
        produto_id: novoProdutoId,
        tipo,
        quantidade: novaQtd,
        motivo: motivo ? motivo.trim() : '',
        responsavel: responsavel ? responsavel.trim() : 'Não informado',
        documento_ref: documento_ref ? documento_ref.trim() : null
      }).eq('id', id);

      return true;
    }

    if (!db) throw new Error('Banco de dados não disponível');

    const tx = db.transaction(() => {
      const movAntiga = db.prepare('SELECT * FROM movimentacoes WHERE id = ?').get(id);
      if (!movAntiga) throw new Error('Movimentação não encontrada.');

      const prodAntigo = db.prepare('SELECT id, nome, quantidade FROM produtos WHERE id = ?').get(movAntiga.produto_id);
      if (!prodAntigo) throw new Error('Produto de origem da movimentação não encontrado.');

      const novoProdutoId = produto_id ? parseInt(produto_id, 10) : movAntiga.produto_id;
      const mesmoProduto = (novoProdutoId === movAntiga.produto_id);

      const estornoAntigo = (movAntiga.tipo === 'ENTRADA') ? -movAntiga.quantidade : movAntiga.quantidade;
      const saldoProdAntigoRevertido = prodAntigo.quantidade + estornoAntigo;

      if (mesmoProduto) {
        const efeitoNovo = (tipo === 'ENTRADA') ? novaQtd : -novaQtd;
        const saldoFinal = saldoProdAntigoRevertido + efeitoNovo;
        if (saldoFinal < 0) {
          throw new Error(`Esta alteração deixaria o estoque de "${prodAntigo.nome}" negativo (${saldoFinal}). Operação não permitida.`);
        }
        db.prepare("UPDATE produtos SET quantidade = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?")
          .run(saldoFinal, prodAntigo.id);
      } else {
        if (saldoProdAntigoRevertido < 0) {
          throw new Error(`O estorno deixaria o estoque do produto antigo "${prodAntigo.nome}" negativo. Operação não permitida.`);
        }
        db.prepare("UPDATE produtos SET quantidade = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?")
          .run(saldoProdAntigoRevertido, prodAntigo.id);

        const prodNovo = db.prepare('SELECT id, nome, quantidade FROM produtos WHERE id = ?').get(novoProdutoId);
        if (!prodNovo) throw new Error('Novo produto selecionado não encontrado.');

        const efeitoNovo = (tipo === 'ENTRADA') ? novaQtd : -novaQtd;
        const saldoNovoFinal = prodNovo.quantidade + efeitoNovo;
        if (saldoNovoFinal < 0) {
          throw new Error(`Esta alteração deixaria o estoque de "${prodNovo.nome}" negativo (${saldoNovoFinal}). Operação não permitida.`);
        }
        db.prepare("UPDATE produtos SET quantidade = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?")
          .run(saldoNovoFinal, prodNovo.id);
      }

      db.prepare(`
        UPDATE movimentacoes SET
          produto_id = @produto_id,
          tipo = @tipo,
          quantidade = @quantidade,
          motivo = @motivo,
          responsavel = @responsavel,
          documento_ref = @documento_ref
        WHERE id = @id
      `).run({
        id,
        produto_id: novoProdutoId,
        tipo,
        quantidade: novaQtd,
        motivo: motivo ? motivo.trim() : '',
        responsavel: responsavel ? responsavel.trim() : 'Não informado',
        documento_ref: documento_ref ? documento_ref.trim() : null
      });

      return true;
    });

    return tx();
  }

  /**
   * Exclui uma movimentação e estorna o saldo correspondente
   */
  static async delete(id) {
    if (useSupabase && supabase) {
      const { data: mov, error: errMov } = await supabase.from('movimentacoes').select('*').eq('id', id).single();
      if (errMov || !mov) throw new Error('Movimentação não encontrada.');

      const { data: prod, error: errProd } = await supabase.from('produtos').select('id, nome, quantidade').eq('id', mov.produto_id).single();
      if (errProd || !prod) throw new Error('Produto associado não encontrado.');

      const estorno = (mov.tipo === 'ENTRADA') ? -Number(mov.quantidade) : Number(mov.quantidade);
      const novoSaldo = Number(prod.quantidade) + estorno;

      if (novoSaldo < 0) {
        throw new Error(`A exclusão desta movimentação deixaria o estoque de "${prod.nome}" negativo (${novoSaldo}). Operação cancelada.`);
      }

      await supabase.from('produtos').update({ quantidade: novoSaldo }).eq('id', prod.id);
      await supabase.from('movimentacoes').delete().eq('id', id);

      return {
        id,
        produto_id: prod.id,
        produto_nome: prod.nome,
        novo_saldo: novoSaldo
      };
    }

    if (!db) throw new Error('Banco de dados não disponível');

    const tx = db.transaction(() => {
      const mov = db.prepare('SELECT * FROM movimentacoes WHERE id = ?').get(id);
      if (!mov) throw new Error('Movimentação não encontrada.');

      const prod = db.prepare('SELECT id, nome, quantidade FROM produtos WHERE id = ?').get(mov.produto_id);
      if (!prod) throw new Error('Produto associado não encontrado.');

      const estorno = (mov.tipo === 'ENTRADA') ? -mov.quantidade : mov.quantidade;
      const novoSaldo = prod.quantidade + estorno;

      if (novoSaldo < 0) {
        throw new Error(`A exclusão desta movimentação deixaria o estoque de "${prod.nome}" negativo (${novoSaldo}). Operação cancelada.`);
      }

      db.prepare("UPDATE produtos SET quantidade = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?")
        .run(novoSaldo, prod.id);

      db.prepare('DELETE FROM movimentacoes WHERE id = ?').run(id);

      return {
        id,
        produto_id: prod.id,
        produto_nome: prod.nome,
        novo_saldo: novoSaldo
      };
    });

    return tx();
  }
}

module.exports = Movimentacao;
