/**
 * Utilitário de Migração de Dados: SQLite -> Supabase (PostgreSQL)
 * Lê os dados atuais do arquivo local almoxarifado.sqlite e gera
 * o arquivo SQL com todos os INSERTs e acertos de sequências para o Supabase.
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const sqlitePath = path.resolve(__dirname, '..', 'almoxarifado.sqlite');
const outputSqlPath = path.resolve(__dirname, 'dados_supabase.sql');

if (!fs.existsSync(sqlitePath)) {
  console.error('Arquivo SQLite não encontrado em:', sqlitePath);
  process.exit(1);
}

const db = new Database(sqlitePath);

function escapeSqlValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val;
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

function gerarInserts(tabela, colunas, idCol = 'id') {
  const rows = db.prepare(`SELECT * FROM ${tabela} ORDER BY ${idCol} ASC`).all();
  if (rows.length === 0) return `-- Tabela ${tabela}: nenhum registro.\n`;

  let sql = `-- =============================================================================\n`;
  sql += `-- DADOS: ${tabela.toUpperCase()} (${rows.length} registros)\n`;
  sql += `-- =============================================================================\n`;

  rows.forEach(row => {
    const cols = colunas.join(', ');
    const vals = colunas.map(col => escapeSqlValue(row[col])).join(', ');
    sql += `INSERT INTO ${tabela} (${cols}) VALUES (${vals}) ON CONFLICT (${idCol}) DO NOTHING;\n`;
  });

  // Atualiza sequência do PostgreSQL para o próximo ID
  sql += `SELECT setval(pg_get_serial_sequence('${tabela}', '${idCol}'), COALESCE((SELECT MAX(${idCol}) FROM ${tabela}), 1));\n\n`;
  return sql;
}

function exportar() {
  console.log('Iniciando exportação do SQLite para formato Supabase (PostgreSQL)...');
  let sqlFinal = `-- =============================================================================\n`;
  sqlFinal += `-- MIGRAÇÃO DE DADOS - JPS ALMOXARIFADO\n`;
  sqlFinal += `-- Gerado automaticamente a partir do banco local SQLite\n`;
  sqlFinal += `-- Data de geração: ${new Date().toISOString()}\n`;
  sqlFinal += `-- =============================================================================\n\n`;
  sqlFinal += `BEGIN;\n\n`;

  // 1. Fornecedores
  sqlFinal += gerarInserts('fornecedores', ['id', 'nome', 'cnpj', 'email', 'telefone', 'contato', 'criado_em']);

  // 2. Almoxarifados
  sqlFinal += gerarInserts('almoxarifados', ['id', 'codigo', 'nome', 'tipo', 'endereco', 'responsavel', 'telefone', 'status', 'criado_em']);

  // 3. Produtos
  sqlFinal += gerarInserts('produtos', ['id', 'sku', 'tag', 'nome', 'categoria', 'unidade_medida', 'quantidade', 'estoque_minimo', 'preco_unitario', 'localizacao', 'fornecedor_id', 'criado_em', 'atualizado_em']);

  // 4. Estoques
  sqlFinal += gerarInserts('estoques', ['id', 'produto_id', 'almoxarifado_id', 'quantidade', 'localizacao', 'atualizado_em']);

  // 5. Movimentacoes
  sqlFinal += gerarInserts('movimentacoes', ['id', 'produto_id', 'tipo', 'quantidade', 'motivo', 'responsavel', 'documento_ref', 'almoxarifado_origem_id', 'almoxarifado_destino_id', 'criado_em']);

  // 6. Requisicoes Obras
  sqlFinal += gerarInserts('requisicoes_obras', ['id', 'codigo', 'almoxarifado_origem_id', 'almoxarifado_destino_id', 'produto_id', 'quantidade', 'solicitante', 'motivo', 'status', 'observacoes', 'criado_em', 'atualizado_em']);

  sqlFinal += `COMMIT;\n`;

  fs.writeFileSync(outputSqlPath, sqlFinal, 'utf8');
  console.log(`Sucesso! Arquivo gerado em: ${outputSqlPath}`);
}

exportar();
