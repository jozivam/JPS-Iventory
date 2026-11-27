const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { Client } = require('pg');
const Database = require('better-sqlite3');

async function migrate() {
  console.log('=== INICIANDO MIGRAÇÃO: TABELA REQUISICOES ===');

  // 1. Supabase (PostgreSQL)
  if (process.env.DATABASE_URL) {
    try {
      console.log('-> Conectando ao PostgreSQL (Supabase)...');
      const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });
      await client.connect();

      const querySql = `
        CREATE TABLE IF NOT EXISTS requisicoes (
          id SERIAL PRIMARY KEY,
          codigo TEXT UNIQUE,
          produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
          colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
          colaborador_nome TEXT NOT NULL,
          solicitante_nome TEXT NOT NULL,
          solicitante_id INTEGER,
          tipo_operacao TEXT NOT NULL DEFAULT 'SAIDA' CHECK(tipo_operacao IN ('SAIDA', 'EMPRESTIMO', 'TROCA')),
          quantidade INTEGER NOT NULL DEFAULT 1 CHECK(quantidade > 0),
          status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE', 'APROVADA', 'RECUSADA', 'CANCELADA')),
          motivo TEXT,
          documento_ref TEXT,
          almoxarife_responsavel TEXT,
          motivo_recusa TEXT,
          movimentacao_id INTEGER REFERENCES movimentacoes(id) ON DELETE SET NULL,
          criado_em TIMESTAMPTZ DEFAULT now(),
          respondido_em TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_requisicoes_status ON requisicoes(status);
        CREATE INDEX IF NOT EXISTS idx_requisicoes_produto ON requisicoes(produto_id);
        CREATE INDEX IF NOT EXISTS idx_requisicoes_colaborador ON requisicoes(colaborador_id);
        CREATE INDEX IF NOT EXISTS idx_requisicoes_criado_em ON requisicoes(criado_em DESC);
      `;

      await client.query(querySql);
      console.log('✅ Tabela "requisicoes" criada/atualizada com sucesso no Supabase!');
      await client.end();
    } catch (err) {
      console.error('❌ Erro no Supabase:', err.message);
    }
  }

  // 2. SQLite Local
  try {
    console.log('-> Conectando ao SQLite local...');
    const dbPath = path.resolve(__dirname, '../almoxarifado.sqlite');
    const db = new Database(dbPath);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS requisicoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE,
        produto_id INTEGER NOT NULL,
        colaborador_id INTEGER,
        colaborador_nome TEXT NOT NULL,
        solicitante_nome TEXT NOT NULL,
        solicitante_id INTEGER,
        tipo_operacao TEXT NOT NULL DEFAULT 'SAIDA' CHECK(tipo_operacao IN ('SAIDA', 'EMPRESTIMO', 'TROCA')),
        quantidade INTEGER NOT NULL DEFAULT 1 CHECK(quantidade > 0),
        status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE', 'APROVADA', 'RECUSADA', 'CANCELADA')),
        motivo TEXT,
        documento_ref TEXT,
        almoxarife_responsavel TEXT,
        motivo_recusa TEXT,
        movimentacao_id INTEGER,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
        respondido_em DATETIME,
        FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
        FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE SET NULL,
        FOREIGN KEY (movimentacao_id) REFERENCES movimentacoes(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_req_status ON requisicoes(status);
      CREATE INDEX IF NOT EXISTS idx_req_produto ON requisicoes(produto_id);
      CREATE INDEX IF NOT EXISTS idx_req_colab ON requisicoes(colaborador_id);
    `);
    console.log('✅ Tabela "requisicoes" criada/atualizada com sucesso no SQLite local!');
    db.close();
  } catch (err) {
    console.error('❌ Erro no SQLite:', err.message);
  }

  console.log('=== MIGRAÇÃO CONCLUÍDA ===');
}

migrate();
