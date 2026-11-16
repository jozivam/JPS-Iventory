const { Client } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function runMigration() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL não configurada no .env');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Conectado ao Supabase PostgreSQL.');

    // 1. Coluna condicao em produtos
    await client.query(`
      ALTER TABLE produtos ADD COLUMN IF NOT EXISTS condicao VARCHAR(50) DEFAULT 'NOVO';
    `);
    console.log('OK: Coluna "condicao" verificada/adicionada em "produtos".');

    // 2. Colunas login e senha_hash em colaboradores
    await client.query(`
      ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS login VARCHAR(100) UNIQUE;
      ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS senha_hash VARCHAR(255);
    `);
    console.log('OK: Colunas "login" e "senha_hash" verificadas/adicionadas em "colaboradores".');

    // 3. Atualiza Jozivam Silva com login e senha inicial
    const senhaHash = bcrypt.hashSync('123456', 10);
    const updateRes = await client.query(`
      UPDATE colaboradores 
      SET login = COALESCE(login, 'jozivam'),
          senha_hash = COALESCE(senha_hash, $1)
      WHERE matricula = 'ALM-001' OR email LIKE 'jozivam%' OR nome ILIKE '%jozivam%';
    `, [senhaHash]);

    console.log(`OK: Jozivam Silva atualizado com login "jozivam" (linhas afetadas: ${updateRes.rowCount}).`);

    // 4. Verificação das colunas
    const resProd = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'produtos'
      ORDER BY ordinal_position;
    `);
    console.log('Colunas de produtos no Supabase:', resProd.rows.map(r => r.column_name));

    const resColab = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'colaboradores'
      ORDER BY ordinal_position;
    `);
    console.log('Colunas de colaboradores no Supabase:', resColab.rows.map(r => r.column_name));

    const resAdmin = await client.query(`
      SELECT id, nome, login, nivel_acesso, (senha_hash IS NOT NULL) as tem_senha 
      FROM colaboradores;
    `);
    console.log('Colaboradores no Supabase:', resAdmin.rows);

  } catch (error) {
    console.error('Erro na migração do Supabase:', error);
  } finally {
    await client.end();
  }
}

runMigration();
