/**
 * Script de Deploy Automático para o Supabase
 * Executa o script completo de recriação limpa (recriar_banco_supabase.sql)
 * diretamente no Supabase PostgreSQL.
 * Requer DATABASE_URL configurada no .env
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pgPool, testConnection } = require('../supabase');

async function executarMigracao() {
  console.log('--- RECRIAÇÃO E MIGRAÇÃO DO BANCO DE DADOS NO SUPABASE ---');

  const dbUrl = process.env.DATABASE_URL || '';

  if (!dbUrl || dbUrl.includes('[YOUR-PASSWORD]') || dbUrl.includes('[SUA-SENHA-AQUI]')) {
    console.error('\n[ATENÇÃO] A sua senha do banco de dados ainda não foi inserida na DATABASE_URL!');
    console.log('\n💡 Você pode subir sem precisar de senha pelo navegador usando o SQL Editor do Supabase em 1 clique:');
    console.log('    1. Abra o painel do Supabase -> SQL Editor -> New Query');
    console.log('    2. Cole o conteúdo de config/supabase/recriar_banco_supabase.sql e clique em RUN');
    process.exit(1);
  }

  const test = await testConnection();
  if (!test.conectado) {
    console.error('\nErro ao conectar ao Supabase via DATABASE_URL:', test.mensagem);
    console.log('\n💡 Como alternativa recomendada:');
    console.log('    Abra o SQL Editor no painel do Supabase, cole o conteúdo de:');
    console.log('    config/supabase/recriar_banco_supabase.sql e clique em RUN.');
    process.exit(1);
  }

  console.log('✓ ' + test.mensagem);

  const sqlPath = path.resolve(__dirname, 'recriar_banco_supabase.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('Arquivo SQL de migração não encontrado em:', sqlPath);
    process.exit(1);
  }

  try {
    const client = await pgPool.connect();
    try {
      console.log('\n[Passo 1/1] Aplicando Schema limpo e importando dados no Supabase...');
      const sqlCompleto = fs.readFileSync(sqlPath, 'utf8');
      await client.query(sqlCompleto);
      console.log('✓ Banco de dados recriado e sincronizado com sucesso no Supabase!');

      // Validação final de contagem
      console.log('\n--- RESUMO DO BANCO NO SUPABASE ---');
      const resProds = await client.query('SELECT COUNT(*) FROM produtos');
      const resMov = await client.query('SELECT COUNT(*) FROM movimentacoes');
      const resColab = await client.query('SELECT COUNT(*) FROM colaboradores');

      console.log(`• Produtos no Inventário: ${resProds.rows[0].count}`);
      console.log(`• Movimentações Registradas: ${resMov.rows[0].count}`);
      console.log(`• Colaboradores / Usuários: ${resColab.rows[0].count}`);
      console.log('\n✓ OPERAÇÃO CONCLUÍDA COM SUCESSO NO SUPABASE!');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('\nErro durante a execução no Supabase:', error);
  } finally {
    if (pgPool) await pgPool.end();
  }
}

executarMigracao();
