const db = require('../../config/database');

class Movimentacao {
  /**
   * Lista histórico de movimentações com filtros opcionais
   */
  static findAll({ produto_id, tipo, data_inicio, data_fim, limite = 200 } = {}) {
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

    sql += ` ORDER BY m.id DESC LIMIT @limite`;
    params.limite = limite;

    return db.prepare(sql).all(params);
  }

  /**
   * Busca movimentação por ID
   */
  static findById(id) {
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
   * Atualiza imediatamente o estoque do produto.
   */
  static registrar({ produto_id, tipo, quantidade, motivo, responsavel, documento_ref }) {
    const qtd = parseInt(quantidade, 10);
    if (!qtd || qtd <= 0) {
      throw new Error('A quantidade deve ser um número inteiro maior que zero.');
    }

    if (!['ENTRADA', 'SAIDA'].includes(tipo)) {
      throw new Error('Tipo de movimentação inválido. Deve ser ENTRADA ou SAIDA.');
    }

    const tx = db.transaction(() => {
      // 1. Verifica produto e saldo atual
      const produto = db.prepare('SELECT id, nome, quantidade FROM produtos WHERE id = ?').get(produto_id);
      if (!produto) {
        throw new Error('Produto selecionado não existe.');
      }

      // 2. Valida saldo se for saída
      if (tipo === 'SAIDA' && produto.quantidade < qtd) {
        throw new Error(`Saldo insuficiente para o produto "${produto.nome}". Saldo atual: ${produto.quantidade}, solicitado: ${qtd}.`);
      }

      // 3. Atualiza saldo no produto
      const fator = tipo === 'ENTRADA' ? 1 : -1;
      const novoSaldo = produto.quantidade + (qtd * fator);

      db.prepare(`
        UPDATE produtos 
        SET quantidade = ?, atualizado_em = datetime('now', 'localtime') 
        WHERE id = ?
      `).run(novoSaldo, produto_id);

      // 4. Grava registro na movimentação
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
   * Edita uma movimentação existente e recalcula o inventário de forma atômica
   */
  static update(id, { produto_id, tipo, quantidade, motivo, responsavel, documento_ref }) {
    const novaQtd = parseInt(quantidade, 10);
    if (!novaQtd || novaQtd <= 0) {
      throw new Error('A quantidade deve ser um número maior que zero.');
    }

    if (!['ENTRADA', 'SAIDA'].includes(tipo)) {
      throw new Error('Tipo de movimentação inválido. Deve ser ENTRADA ou SAIDA.');
    }

    const tx = db.transaction(() => {
      // 1. Busca movimentação antiga
      const movAntiga = db.prepare('SELECT * FROM movimentacoes WHERE id = ?').get(id);
      if (!movAntiga) {
        throw new Error('Movimentação não encontrada.');
      }

      const prodAntigo = db.prepare('SELECT id, nome, quantidade FROM produtos WHERE id = ?').get(movAntiga.produto_id);
      if (!prodAntigo) {
        throw new Error('Produto de origem da movimentação não encontrado.');
      }

      const novoProdutoId = produto_id ? parseInt(produto_id, 10) : movAntiga.produto_id;
      const mesmoProduto = (novoProdutoId === movAntiga.produto_id);

      // 2. Reverte o efeito da movimentação antiga
      // Se era ENTRADA: o saldo original subiu movAntiga.quantidade -> para reverter, subtraímos
      // Se era SAIDA: o saldo original caiu movAntiga.quantidade -> para reverter, somamos
      const estornoAntigo = (movAntiga.tipo === 'ENTRADA') ? -movAntiga.quantidade : movAntiga.quantidade;
      const saldoProdAntigoRevertido = prodAntigo.quantidade + estornoAntigo;

      if (mesmoProduto) {
        // Aplica o novo efeito sobre o saldo revertido
        const efeitoNovo = (tipo === 'ENTRADA') ? novaQtd : -novaQtd;
        const saldoFinal = saldoProdAntigoRevertido + efeitoNovo;

        if (saldoFinal < 0) {
          throw new Error(`Esta alteração deixaria o estoque de "${prodAntigo.nome}" negativo (${saldoFinal}). Operação não permitida.`);
        }

        db.prepare("UPDATE produtos SET quantidade = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?")
          .run(saldoFinal, prodAntigo.id);
      } else {
        // Troca de produto
        if (saldoProdAntigoRevertido < 0) {
          throw new Error(`O estorno desta movimentação deixaria o estoque do produto antigo "${prodAntigo.nome}" negativo. Operação não permitida.`);
        }

        // Atualiza produto antigo com saldo revertido
        db.prepare("UPDATE produtos SET quantidade = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?")
          .run(saldoProdAntigoRevertido, prodAntigo.id);

        // Busca e atualiza novo produto
        const prodNovo = db.prepare('SELECT id, nome, quantidade FROM produtos WHERE id = ?').get(novoProdutoId);
        if (!prodNovo) {
          throw new Error('Novo produto selecionado não existe.');
        }

        const efeitoNovo = (tipo === 'ENTRADA') ? novaQtd : -novaQtd;
        const saldoNovoFinal = prodNovo.quantidade + efeitoNovo;

        if (saldoNovoFinal < 0) {
          throw new Error(`Esta operação deixaria o estoque de "${prodNovo.nome}" negativo (${saldoNovoFinal}). Operação não permitida.`);
        }

        db.prepare("UPDATE produtos SET quantidade = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?")
          .run(saldoNovoFinal, prodNovo.id);
      }

      // 3. Atualiza os dados da movimentação
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
        motivo: motivo ? motivo.trim() : null,
        responsavel: responsavel ? responsavel.trim() : 'Não informado',
        documento_ref: documento_ref ? documento_ref.trim() : null
      });

      return { id };
    });

    return tx();
  }

  /**
   * Exclui uma movimentação e reverte seu impacto no estoque do produto
   */
  static delete(id) {
    const tx = db.transaction(() => {
      // 1. Busca movimentação
      const mov = db.prepare('SELECT * FROM movimentacoes WHERE id = ?').get(id);
      if (!mov) {
        throw new Error('Movimentação não encontrada.');
      }

      // 2. Busca produto
      const prod = db.prepare('SELECT id, nome, quantidade FROM produtos WHERE id = ?').get(mov.produto_id);
      if (prod) {
        // Reverte o saldo:
        // Se era ENTRADA: subtrai do estoque
        // Se era SAIDA: devolve ao estoque
        const ajuste = (mov.tipo === 'ENTRADA') ? -mov.quantidade : mov.quantidade;
        const saldoResultante = prod.quantidade + ajuste;

        if (saldoResultante < 0) {
          throw new Error(`Não é possível excluir esta entrada porque o estoque de "${prod.nome}" ficaria negativo (${saldoResultante}). Ajuste o saldo primeiro.`);
        }

        db.prepare("UPDATE produtos SET quantidade = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?")
          .run(saldoResultante, prod.id);
      }

      // 3. Exclui a movimentação
      db.prepare('DELETE FROM movimentacoes WHERE id = ?').run(id);

      return {
        id,
        produto_nome: prod ? prod.nome : 'Item'
      };
    });

    return tx();
  }
}

module.exports = Movimentacao;
