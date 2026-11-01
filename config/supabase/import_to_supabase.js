/**
 * Script de Deploy Automático para o Supabase
 * Executa o Schema DDL e os dados exportados diretamente no Supabase PostgreSQL.
 * Requer DATABASE_URL configurada no .env
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pgPool, testConnection } = require('../supabase');

async function executarMigracao() {
  console.log('--- MIGRAÇÃO DE BANCO DE DADOS: JPS ALMOXARIFADO -> SUPABASE ---');

  if (!process.env.DATABASE_URL) {
    console.error('\n[ATENÇÃO] A variável DATABASE_URL não está configurada no seu arquivo .env!');
    console.log('Para obter a DATABASE_URL:');
    console.log('1. Acesse https://supabase.com/dashboard');
    console.log('2. Entre no seu projeto -> Project Settings -> Database');
    console.log('3. Copie a Connection String (Modo URI) e cole no .env:');
    console.log('   DATABASE_URL="postgres://postgres.[ref]:[senha]@aws-0-[regiao].pooler.supabase.com:6543/postgres?pgbouncer=true"\n');
    console.log('Alternativamente, você pode copiar os arquivos SQL e colar direto no SQL Editor do Supabase:');
    console.log(' - config/supabase/schema_supabase.sql (Estrutura das Tabelas)');
    console.log(' - config/supabase/dados_supabase.sql (Seus dados atuais)');
    process.exit(1);
  }

  const test = await testConnection();
  if (!test.conectado) {
    console.error('\nErro ao conectar ao Supabase:', test.mensagem);
    process.exit(1);
  }

  console.log('✓ ' + test.mensagem);

  const schemaPath = path.resolve(__dirname, 'schema_supabase.sql');
  const dadosPath = path.resolve(__dirname, 'dados_supabase.sql');

  try {
    const client = await pgPool.connect();
    try {
      // 1. Executa Schema DDL
      console.log('\n[Passo 1/2] Aplicando Schema DDL no Supabase (Tabelas, Triggers, Índices)...');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await client.query(schemaSql);
      console.log('✓ Schema DDL aplicado com sucesso!');

      // 2. Executa Carga de Dados
      if (fs.existsSync(dadosPath)) {
        console.log('\n[Passo 2/2] Migrando dados do SQLite para o Supabase...');
        const dadosSql = fs.readFileSync(dadosPath, 'utf8');
        await client.query(dadosSql);
        console.log('✓ Dados migrados com sucesso!');
      }

      // Validação final de contagem
      console.log('\n--- RESUMO DA MIGRAÇÃO NO SUPABASE ---');
      const resAlmox = await client.query('SELECT COUNT(*) FROM almoxarifados');
      const resProds = await client.query('SELECT COUNT(*) FROM produtos');
      const resEst = await client.query('SELECT COUNT(*) FROM estoques WHERE quantidade > 0');
      const resMov = await client.query('SELECT COUNT(*) FROM movimentacoes');
      const resReq = await client.query('SELECT COUNT(*) FROM requisicoes_obras');

      console.log(`• Almoxarifados / Canteiros: ${resAlmox.rows[0].count}`);
      console.log(`• Produtos no Catálogo: ${resProds.rows[0].count}`);
      console.log(`• Estoques com Saldo Ativo: ${resEst.rows[0].count}`);
      console.log(`• Movimentações Registradas: ${resMov.rows[0].count}`);
      console.log(`• Requisições de Obras: ${resReq.rows[0].count}`);
      console.log('\n✓ MIGRAÇÃO CONCLUÍDA COM SUCESSO NO SUPABASE!');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('\nErro durante a execução do script no Supabase:', error);
  } finally {
    await pgPool.end();
  }
}

executarMigracao();
