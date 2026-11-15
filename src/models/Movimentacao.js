const db = require('../../config/database');
const { supabase } = require('../../config/supabase');

const isVercel = !!process.env.VERCEL;
const isSupabaseDriver = process.env.DB_DRIVER === 'supabase';
const useSupabase = isVercel || isSupabaseDriver;

const TIPOS_VALIDOS = ['ENTRADA', 'SAIDA', 'EMPRESTIMO', 'DEVOLUCAO', 'TROCA'];

function getFatorTipo(tipo) {
  if (tipo === 'ENTRADA' || tipo === 'DEVOLUCAO') return 1;
  if (tipo === 'SAIDA' || tipo === 'EMPRESTIMO') return -1;
  if (tipo === 'TROCA') return 0;
  return 0;
}

class Movimentacao {
  /**
   * Lista histórico de movimentações com filtros opcionais
   */
  static async findAll({ produto_id, colaborador_id, tipo, data_inicio, data_fim, busca, status_emprestimo, limite = 200 } = {}) {
    if (useSupabase && supabase) {
      let q = supabase.from('movimentacoes').select('*, produtos(nome, sku, unidade_medida, marca, tag, patrimonio)');

      if (produto_id) {
        q = q.eq('produto_id', parseInt(produto_id, 10));
      }

      if (colaborador_id) {
        q = q.eq('colaborador_id', parseInt(colaborador_id, 10));
      }

      if (tipo && TIPOS_VALIDOS.includes(tipo)) {
        q = q.eq('tipo', tipo);
      }

      if (status_emprestimo) {
        q = q.eq('status_emprestimo', status_emprestimo);
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
          (m.colaborador && m.colaborador.toLowerCase().includes(b)) ||
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

    if (colaborador_id) {
      sql += ` AND m.colaborador_id = @colaborador_id`;
      params.colaborador_id = parseInt(colaborador_id, 10);
    }

    if (tipo && TIPOS_VALIDOS.includes(tipo)) {
      sql += ` AND m.tipo = @tipo`;
      params.tipo = tipo;
    }

    if (status_emprestimo) {
      sql += ` AND m.status_emprestimo = @status_emprestimo`;
      params.status_emprestimo = status_emprestimo;
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
        OR m.colaborador LIKE @busca
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
  static async registrar({ produto_id, tipo, quantidade, motivo, responsavel, documento_ref, colaborador, colaborador_id, status_emprestimo, movimentacao_origem_id }) {
    const qtd = parseInt(quantidade, 10);
    if (!qtd || qtd <= 0) {
      throw new Error('A quantidade deve ser um número inteiro maior que zero.');
    }

    if (!TIPOS_VALIDOS.includes(tipo)) {
      throw new Error(`Tipo de movimentação inválido (${tipo}). Deve ser ENTRADA, SAIDA, EMPRESTIMO, DEVOLUCAO ou TROCA.`);
    }

    const fator = getFatorTipo(tipo);
    const colaboradorFinal = (colaborador && colaborador.trim()) ? colaborador.trim() : 'Balcão';
    const responsavelFinal = responsavel ? responsavel.trim() : 'Almoxarife';
    const statusFinal = status_emprestimo || (tipo === 'EMPRESTIMO' ? 'PENDENTE' : (tipo === 'DEVOLUCAO' ? 'CONCLUIDO' : null));
    let colabIdFinal = colaborador_id ? parseInt(colaborador_id, 10) : null;

    if (useSupabase && supabase) {
      // Se não passou o colaborador_id mas passou o nome do colaborador, tenta associar automaticamente
      if (!colabIdFinal && colaboradorFinal && colaboradorFinal.toLowerCase() !== 'balcão') {
        try {
          const { data: c } = await supabase.from('colaboradores').select('id').ilike('nome', colaboradorFinal).limit(1).maybeSingle();
          if (c) colabIdFinal = c.id;
        } catch (e) {
          console.warn('Aviso ao resolver colaborador_id no Supabase:', e.message);
        }
      }

      const { data: prod, error: errProd } = await supabase.from('produtos').select('id, nome, quantidade, unidade_medida').eq('id', produto_id).single();
      if (errProd || !prod) {
        throw new Error('Produto selecionado não existe.');
      }

      // Valida saldo e impede saída ou empréstimo de produto zerado
      if (fator < 0) {
        const op = tipo === 'EMPRESTIMO' ? 'empréstimo' : 'saída';
        const un = prod.unidade_medida || 'UN';
        if (Number(prod.quantidade) <= 0) {
          throw new Error(`Operação Bloqueada: O produto "${prod.nome}" está com estoque ZERADO (0 ${un}). Não é permitido realizar ${op} de produtos sem estoque disponível. Realize uma Entrada para reabastecer.`);
        }
        if (Number(prod.quantidade) < qtd) {
          throw new Error(`Saldo insuficiente para o ${op} de "${prod.nome}". Saldo disponível: ${prod.quantidade} ${un}, solicitado: ${qtd} ${un}.`);
        }
      }

      const novoSaldo = Number(prod.quantidade) + (qtd * fator);

      // Atualiza saldo do produto se a operação afetar estoque
      if (fator !== 0) {
        await supabase.from('produtos').update({ quantidade: novoSaldo }).eq('id', produto_id);
      }

      // Se for devolução e tiver origem vinculada, atualiza o empréstimo original
      if (tipo === 'DEVOLUCAO' && movimentacao_origem_id) {
        try {
          await supabase.from('movimentacoes').update({
            status_emprestimo: 'DEVOLVIDO',
            data_devolucao: new Date().toISOString()
          }).eq('id', parseInt(movimentacao_origem_id, 10));
        } catch (e) {
          console.warn('Aviso ao atualizar empréstimo de origem no Supabase:', e.message);
        }
      }

      const payloadMov = {
        produto_id,
        tipo,
        quantidade: qtd,
        motivo: motivo ? motivo.trim() : `Lançamento de ${tipo.toLowerCase()} no balcão`,
        responsavel: responsavelFinal,
        documento_ref: documento_ref ? documento_ref.trim() : null
      };

      // Tenta inserir com as novas colunas
      try {
        const { data: mov, error: errMov } = await supabase.from('movimentacoes').insert({
          ...payloadMov,
          colaborador: colaboradorFinal,
          colaborador_id: colabIdFinal,
          status_emprestimo: statusFinal,
          movimentacao_origem_id: movimentacao_origem_id ? parseInt(movimentacao_origem_id, 10) : null
        }).select().single();

        if (errMov) throw errMov;

        return {
          id: mov.id,
          produto_id,
          produto_nome: prod.nome,
          novo_saldo: novoSaldo
        };
      } catch (errSupabase) {
        // Fallback caso colunas ainda não existam no Supabase
        const { data: mov2, error: errMov2 } = await supabase.from('movimentacoes').insert({
          ...payloadMov,
          motivo: `${payloadMov.motivo} [Colaborador: ${colaboradorFinal}]`
        }).select().single();

        if (errMov2) throw new Error('Falha ao registrar movimentação no Supabase: ' + errMov2.message);

        return {
          id: mov2.id,
          produto_id,
          produto_nome: prod.nome,
          novo_saldo: novoSaldo
        };
      }
    }

    if (!db) throw new Error('Banco de dados não disponível');

    const tx = db.transaction(() => {
      // Se não passou o colaborador_id mas passou o nome do colaborador, tenta associar automaticamente
      if (!colabIdFinal && colaboradorFinal && colaboradorFinal.toLowerCase() !== 'balcão') {
        const c = db.prepare('SELECT id FROM colaboradores WHERE LOWER(nome) = LOWER(?)').get(colaboradorFinal);
        if (c) colabIdFinal = c.id;
      }

      const produto = db.prepare('SELECT id, nome, quantidade, unidade_medida FROM produtos WHERE id = ?').get(produto_id);
      if (!produto) {
        throw new Error('Produto selecionado não existe.');
      }

      if (fator < 0) {
        const op = tipo === 'EMPRESTIMO' ? 'empréstimo' : 'saída';
        const un = produto.unidade_medida || 'UN';
        if (Number(produto.quantidade) <= 0) {
          throw new Error(`Operação Bloqueada: O produto "${produto.nome}" está com estoque ZERADO (0 ${un}). Não é permitido realizar ${op} de produtos sem estoque disponível. Realize uma Entrada para reabastecer.`);
        }
        if (Number(produto.quantidade) < qtd) {
          throw new Error(`Saldo insuficiente para o ${op} de "${produto.nome}". Saldo disponível: ${produto.quantidade} ${un}, solicitado: ${qtd} ${un}.`);
        }
      }

      const novoSaldo = produto.quantidade + (qtd * fator);

      if (fator !== 0) {
        db.prepare(`
          UPDATE produtos 
          SET quantidade = ?, atualizado_em = datetime('now', 'localtime') 
          WHERE id = ?
        `).run(novoSaldo, produto_id);
      }

      // Se for devolução e houver empréstimo vinculado, dá baixa no original
      if (tipo === 'DEVOLUCAO' && movimentacao_origem_id) {
        db.prepare(`
          UPDATE movimentacoes 
          SET status_emprestimo = 'DEVOLVIDO', data_devolucao = datetime('now', 'localtime')
          WHERE id = ?
        `).run(parseInt(movimentacao_origem_id, 10));
      }

      const insertStmt = db.prepare(`
        INSERT INTO movimentacoes (
          produto_id, colaborador_id, tipo, quantidade, motivo, responsavel, documento_ref,
          colaborador, status_emprestimo, movimentacao_origem_id
        ) VALUES (
          @produto_id, @colaborador_id, @tipo, @quantidade, @motivo, @responsavel, @documento_ref,
          @colaborador, @status_emprestimo, @movimentacao_origem_id
        )
      `);

      const res = insertStmt.run({
        produto_id,
        colaborador_id: colabIdFinal,
        tipo,
        quantidade: qtd,
        motivo: motivo ? motivo.trim() : `Lançamento de ${tipo.toLowerCase()} no balcão`,
        responsavel: responsavelFinal,
        documento_ref: documento_ref ? documento_ref.trim() : null,
        colaborador: colaboradorFinal,
        status_emprestimo: statusFinal,
        movimentacao_origem_id: movimentacao_origem_id ? parseInt(movimentacao_origem_id, 10) : null
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
   * Dá baixa direta em um empréstimo ativo (registra DEVOLUCAO e restaura estoque)
   */
  static async devolverEmprestimo(movimentacaoId, { responsavel, motivo, documento_ref } = {}) {
    const id = parseInt(movimentacaoId, 10);
    const emprestimo = await Movimentacao.findById(id);

    if (!emprestimo) {
      throw new Error('Registro de empréstimo não encontrado.');
    }

    if (emprestimo.tipo !== 'EMPRESTIMO') {
      throw new Error('Esta movimentação não é um empréstimo.');
    }

    if (emprestimo.status_emprestimo === 'DEVOLVIDO') {
      throw new Error('Este empréstimo já foi devolvido anteriormente.');
    }

    return await Movimentacao.registrar({
      produto_id: emprestimo.produto_id,
      tipo: 'DEVOLUCAO',
      quantidade: emprestimo.quantidade,
      motivo: motivo || `Devolução de ferramenta emprestada (Ref: MOV-${String(id).padStart(4, '0')})`,
      responsavel: responsavel || 'Balcão de Atendimento',
      colaborador: emprestimo.colaborador || emprestimo.responsavel,
      documento_ref: documento_ref || `DEV-MOV-${String(id).padStart(4, '0')}`,
      movimentacao_origem_id: id
    });
  }

  /**
   * Lista todos os empréstimos pendentes de devolução
   */
  static async findEmprestimosPendentes() {
    if (useSupabase && supabase) {
      const { data, error } = await supabase
        .from('movimentacoes')
        .select('*, produtos(nome, sku, unidade_medida, marca, categoria)')
        .eq('tipo', 'EMPRESTIMO')
        .or('status_emprestimo.eq.PENDENTE,status_emprestimo.is.null')
        .order('id', { ascending: false });

      if (error) {
        console.error('Erro ao buscar empréstimos no Supabase:', error);
        return [];
      }

      return (data || []).map(m => ({
        ...m,
        produto_nome: m.produtos ? m.produtos.nome : 'Item',
        produto_sku: m.produtos ? m.produtos.sku : '',
        produto_unidade: m.produtos ? m.produtos.unidade_medida : 'UN',
        produto_marca: m.produtos ? m.produtos.marca : '',
        produto_categoria: m.produtos ? m.produtos.categoria : ''
      }));
    }

    if (!db) return [];

    const sql = `
      SELECT 
        m.*,
        p.nome as produto_nome,
        p.sku as produto_sku,
        p.unidade_medida as produto_unidade,
        p.marca as produto_marca,
        p.categoria as produto_categoria
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      WHERE m.tipo = 'EMPRESTIMO' 
        AND (m.status_emprestimo = 'PENDENTE' OR m.status_emprestimo IS NULL)
      ORDER BY m.id DESC
    `;

    return db.prepare(sql).all();
  }

  /**
   * Retorna estatísticas rápidas para o painel do Balcão
   */
  static async getEstatisticasBalcao() {
    const hojeYMD = new Date().toISOString().split('T')[0];

    if (useSupabase && supabase) {
      const { data: todasMovs } = await supabase.from('movimentacoes').select('tipo, quantidade, status_emprestimo, criado_em');
      const list = todasMovs || [];

      const emprestimosAtivos = list.filter(m => m.tipo === 'EMPRESTIMO' && (m.status_emprestimo === 'PENDENTE' || !m.status_emprestimo)).length;
      const movsHoje = list.filter(m => (m.criado_em || '').startsWith(hojeYMD));

      const totalAtendimentosHoje = movsHoje.length;
      const entradasHoje = movsHoje.filter(m => m.tipo === 'ENTRADA' || m.tipo === 'DEVOLUCAO').reduce((acc, m) => acc + Number(m.quantidade || 0), 0);
      const saidasHoje = movsHoje.filter(m => m.tipo === 'SAIDA' || m.tipo === 'EMPRESTIMO').reduce((acc, m) => acc + Number(m.quantidade || 0), 0);

      return {
        emprestimosAtivos,
        totalAtendimentosHoje,
        entradasHoje,
        saidasHoje
      };
    }

    if (!db) {
      return { emprestimosAtivos: 0, totalAtendimentosHoje: 0, entradasHoje: 0, saidasHoje: 0 };
    }

    const empCount = db.prepare(`
      SELECT COUNT(*) as t 
      FROM movimentacoes 
      WHERE tipo = 'EMPRESTIMO' AND (status_emprestimo = 'PENDENTE' OR status_emprestimo IS NULL)
    `).get()?.t || 0;

    const statsHoje = db.prepare(`
      SELECT 
        COUNT(*) as total_atendimentos,
        COALESCE(SUM(CASE WHEN tipo IN ('ENTRADA', 'DEVOLUCAO') THEN quantidade ELSE 0 END), 0) as entradas_hoje,
        COALESCE(SUM(CASE WHEN tipo IN ('SAIDA', 'EMPRESTIMO') THEN quantidade ELSE 0 END), 0) as saidas_hoje
      FROM movimentacoes 
      WHERE date(criado_em) = date('now', 'localtime')
    `).get();

    return {
      emprestimosAtivos: empCount,
      totalAtendimentosHoje: statsHoje?.total_atendimentos || 0,
      entradasHoje: statsHoje?.entradas_hoje || 0,
      saidasHoje: statsHoje?.saidas_hoje || 0
    };
  }

  /**
   * Edita uma movimentação existente e recalcula o inventário
   */
  static async update(id, { produto_id, tipo, quantidade, motivo, responsavel, documento_ref, colaborador }) {
    const novaQtd = parseInt(quantidade, 10);
    if (!novaQtd || novaQtd <= 0) {
      throw new Error('A quantidade deve ser um número maior que zero.');
    }

    if (!TIPOS_VALIDOS.includes(tipo)) {
      throw new Error(`Tipo de movimentação inválido (${tipo}).`);
    }

    const novoFator = getFatorTipo(tipo);

    if (useSupabase && supabase) {
      const { data: movAntiga, error: errMov } = await supabase.from('movimentacoes').select('*').eq('id', id).single();
      if (errMov || !movAntiga) throw new Error('Movimentação não encontrada.');

      const { data: prodAntigo, error: errProd } = await supabase.from('produtos').select('*').eq('id', movAntiga.produto_id).single();
      if (errProd || !prodAntigo) throw new Error('Produto de origem da movimentação não encontrado.');

      const novoProdutoId = produto_id ? parseInt(produto_id, 10) : movAntiga.produto_id;
      const mesmoProduto = (novoProdutoId === movAntiga.produto_id);

      const antigoFator = getFatorTipo(movAntiga.tipo);
      // Reverte efeito antigo: se fator era 1 (+qtd), estorno é -qtd; se fator era -1 (-qtd), estorno é +qtd
      const estornoAntigo = -antigoFator * Number(movAntiga.quantidade);
      const saldoProdAntigoRevertido = Number(prodAntigo.quantidade) + estornoAntigo;

      if (mesmoProduto) {
        const efeitoNovo = novoFator * novaQtd;
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

        const efeitoNovo = novoFator * novaQtd;
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
        colaborador: (colaborador && colaborador.trim()) ? colaborador.trim() : 'Balcão',
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

      const antigoFator = getFatorTipo(movAntiga.tipo);
      const estornoAntigo = -antigoFator * movAntiga.quantidade;
      const saldoProdAntigoRevertido = prodAntigo.quantidade + estornoAntigo;

      if (mesmoProduto) {
        const efeitoNovo = novoFator * novaQtd;
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

        const efeitoNovo = novoFator * novaQtd;
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
          colaborador = @colaborador,
          documento_ref = @documento_ref
        WHERE id = @id
      `).run({
        id,
        produto_id: novoProdutoId,
        tipo,
        quantidade: novaQtd,
        motivo: motivo ? motivo.trim() : '',
        responsavel: responsavel ? responsavel.trim() : 'Não informado',
        colaborador: (colaborador && colaborador.trim()) ? colaborador.trim() : 'Balcão',
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

      const fator = getFatorTipo(mov.tipo);
      const estorno = -fator * Number(mov.quantidade);
      const novoSaldo = Number(prod.quantidade) + estorno;

      if (novoSaldo < 0) {
        throw new Error(`A exclusão desta movimentação deixaria o estoque de "${prod.nome}" negativo (${novoSaldo}). Operação cancelada.`);
      }

      if (fator !== 0) {
        await supabase.from('produtos').update({ quantidade: novoSaldo }).eq('id', prod.id);
      }

      // Se for devolução e tiver origem vinculada, reabre o empréstimo
      if (mov.tipo === 'DEVOLUCAO' && mov.movimentacao_origem_id) {
        try {
          await supabase.from('movimentacoes').update({
            status_emprestimo: 'PENDENTE',
            data_devolucao: null
          }).eq('id', mov.movimentacao_origem_id);
        } catch (e) {}
      }

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

      const fator = getFatorTipo(mov.tipo);
      const estorno = -fator * mov.quantidade;
      const novoSaldo = prod.quantidade + estorno;

      if (novoSaldo < 0) {
        throw new Error(`A exclusão desta movimentação deixaria o estoque de "${prod.nome}" negativo (${novoSaldo}). Operação cancelada.`);
      }

      if (fator !== 0) {
        db.prepare("UPDATE produtos SET quantidade = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?")
          .run(novoSaldo, prod.id);
      }

      if (mov.tipo === 'DEVOLUCAO' && mov.movimentacao_origem_id) {
        db.prepare(`
          UPDATE movimentacoes 
          SET status_emprestimo = 'PENDENTE', data_devolucao = NULL 
          WHERE id = ?
        `).run(mov.movimentacao_origem_id);
      }

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
