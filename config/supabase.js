/**
 * Configuração e Cliente de Conexão com o Supabase (PostgreSQL / REST)
 * Suporta tanto o client SDK (@supabase/supabase-js) quanto conexão direta PostgreSQL via Pooler (pg).
 */
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://nhomnkckccszanrqpnki.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const databaseUrl = process.env.DATABASE_URL || '';

// 1. Cliente Supabase JS SDK (para chamadas REST, Auth, Storage e RPC)
let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

// 2. Pool de conexão direta PostgreSQL (usado para queries relacionais e transações de alta performance)
let pgPool = null;
if (databaseUrl) {
  pgPool = new Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false // Necessário para conexão segura com o pooler do Supabase
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });

  pgPool.on('error', (err) => {
    console.error('Erro inesperado no Pool do Supabase PostgreSQL:', err);
  });
}

/**
 * Executa uma consulta SQL no Supabase PostgreSQL usando o pooler
 * @param {string} text Query SQL parametrizada ($1, $2...)
 * @param {Array} params Parâmetros da query
 */
async function query(text, params = []) {
  if (!pgPool) {
    throw new Error('DATABASE_URL do Supabase não configurada no arquivo .env.');
  }
  const start = Date.now();
  const res = await pgPool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Supabase SQL] Executou em ${duration}ms | Linhas: ${res.rowCount}`);
  }
  return res;
}

/**
 * Testa a conexão com o Supabase
 */
async function testConnection() {
  const status = {
    sdkConfigurado: !!supabase,
    poolConfigurado: !!pgPool,
    conectado: false,
    mensagem: ''
  };

  if (pgPool) {
    try {
      const res = await pgPool.query('SELECT NOW() as agora, current_database() as db_name, version()');
      status.conectado = true;
      status.mensagem = `Conectado ao PostgreSQL Supabase: ${res.rows[0].db_name} (${res.rows[0].agora})`;
      return status;
    } catch (err) {
      status.mensagem = `Falha ao conectar via DATABASE_URL: ${err.message}`;
      return status;
    }
  }

  if (supabase) {
    try {
      const { data, error } = await supabase.from('almoxarifados').select('count', { count: 'exact', head: true });
      if (error) throw error;
      status.conectado = true;
      status.mensagem = 'Conectado ao Supabase via REST SDK com sucesso!';
      return status;
    } catch (err) {
      status.mensagem = `Falha ao consultar Supabase SDK: ${err.message}`;
      return status;
    }
  }

  status.mensagem = 'Nenhuma credencial do Supabase (SUPABASE_URL ou DATABASE_URL) preenchida ainda no arquivo .env.';
  return status;
}

module.exports = {
  supabase,
  pgPool,
  query,
  testConnection
};
