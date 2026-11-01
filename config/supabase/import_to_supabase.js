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

  const dbUrl = process.env.DATABASE_URL || '';

  if (!dbUrl || dbUrl.includes('[YOUR-PASSWORD]') || dbUrl.includes('[SUA-SENHA-AQUI]')) {
    console.error('\n[ATENÇÃO] A sua senha do banco de dados ainda não foi inserida na DATABASE_URL!');
    console.log('\nNo seu arquivo .env, substitua [SUA-SENHA-AQUI] pela senha que você criou para o projeto Supabase:');
    console.log('Exemplo: DATABASE_URL=postgresql://postgres:SuaSenhaReal123@db.nhomnkckccszanrqpnki.supabase.co:5432/postgres\n');
    console.log('💡 DICA: Se você não lembra a senha criada no Supabase, você pode:');
    console.log(' 1. No Supabase, clicar no ícone de Engrenagem (Project Settings) -> Database -> "Reset Database Password".');
    console.log(' OU');
    console.log(' 2. Subir sem precisar de senha pelo navegador usando o SQL Editor do Supabase em 2 cliques:');
    console.log('    - Abra o SQL Editor no painel do Supabase');
    console.log('    - Cole o conteúdo de config/supabase/schema_supabase.sql e clique em RUN');
    console.log('    - Cole o conteúdo de config/supabase/dados_supabase.sql e clique em RUN');
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
