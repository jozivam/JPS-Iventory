const { Client } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

async function syncSupabaseToSqlite() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const sqlitePath = path.resolve(__dirname, '..', 'almoxarifado.sqlite');
  const db = new Database(sqlitePath);

  const resProds = await client.query('SELECT * FROM produtos ORDER BY id ASC');
  const resMovs = await client.query('SELECT * FROM movimentacoes ORDER BY id ASC');
  const resColabs = await client.query('SELECT * FROM colaboradores ORDER BY id ASC');

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('DELETE FROM movimentacoes;');
  db.exec('DELETE FROM produtos;');
  db.exec('DELETE FROM colaboradores;');

  const insertProd = db.prepare(`
    INSERT INTO produtos (
      id, sku, nome, categoria, marca, unidade_medida, quantidade, estoque_minimo, preco_unitario,
      localizacao, tamanho, cor, peso, numero_serie, ca, patrimonio, tag, observacao, condicao,
      criado_em, atualizado_em
    ) VALUES (
      @id, @sku, @nome, @categoria, @marca, @unidade_medida, @quantidade, @estoque_minimo, @preco_unitario,
      @localizacao, @tamanho, @cor, @peso, @numero_serie, @ca, @patrimonio, @tag, @observacao, @condicao,
      @criado_em, @atualizado_em
    )
  `);

  const insertMov = db.prepare(`
    INSERT INTO movimentacoes (
      id, produto_id, colaborador_id, tipo, quantidade, motivo, responsavel, documento_ref,
      colaborador, status_emprestimo, data_devolucao, movimentacao_origem_id, criado_em
    ) VALUES (
      @id, @produto_id, @colaborador_id, @tipo, @quantidade, @motivo, @responsavel, @documento_ref,
      @colaborador, @status_emprestimo, @data_devolucao, @movimentacao_origem_id, @criado_em
    )
  `);

  const insertColab = db.prepare(`
    INSERT INTO colaboradores (
      id, nome, matricula, cargo, departamento, email, telefone, tipo_perfil, nivel_acesso,
      status, login, senha_hash, observacoes, criado_em, atualizado_em
    ) VALUES (
      @id, @nome, @matricula, @cargo, @departamento, @email, @telefone, @tipo_perfil, @nivel_acesso,
      @status, @login, @senha_hash, @observacoes, @criado_em, @atualizado_em
    )
  `);

  function formatRow(row) {
    const obj = {};
    for (const key of Object.keys(row)) {
      const val = row[key];
      if (val instanceof Date) {
        obj[key] = val.toISOString().replace('T', ' ').substring(0, 19);
      } else {
        obj[key] = val;
      }
    }
    return obj;
  }

  const tx = db.transaction(() => {
    resColabs.rows.forEach(c => insertColab.run(formatRow(c)));
    resProds.rows.forEach(p => insertProd.run({
      ...formatRow(p),
      quantidade: Number(p.quantidade || 0),
      estoque_minimo: Number(p.estoque_minimo || 0),
      preco_unitario: Number(p.preco_unitario || 0)
    }));
    resMovs.rows.forEach(m => insertMov.run({
      ...formatRow(m),
      quantidade: Number(m.quantidade || 0)
    }));
  });

  tx();
  db.exec('PRAGMA foreign_keys = ON;');

  console.log(`SQLite sincronizado com sucesso: ${resProds.rows.length} produtos, ${resMovs.rows.length} movimentações, ${resColabs.rows.length} colaboradores.`);
  console.log('Soma no SQLite:', db.prepare('SELECT SUM(quantidade) as total FROM produtos').get().total);

  await client.end();
}

syncSupabaseToSqlite().catch(console.error);
