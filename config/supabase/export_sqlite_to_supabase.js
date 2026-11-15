/**
 * Script de Exportação e Sincronização: SQLite -> Supabase PostgreSQL
 * Gera o arquivo SQL completo para recriação limpa do banco no Supabase
 * e opcionalmente sincroniza diretamente via Supabase REST API (Service Role) / DATABASE_URL.
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const sqlitePath = path.resolve(__dirname, '..', 'almoxarifado.sqlite');
const outputSqlPath = path.resolve(__dirname, 'recriar_banco_supabase.sql');

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

function gerarSqlRecriacao() {
  const produtos = db.prepare('SELECT * FROM produtos ORDER BY id ASC').all();
  const movimentacoes = db.prepare('SELECT * FROM movimentacoes ORDER BY id ASC').all();
  const colaboradores = db.prepare('SELECT * FROM colaboradores ORDER BY id ASC').all();

  let sql = `-- =============================================================================\n`;
  sql += `-- JPS ALMOXARIFADO - RECRIAÇÃO LIMPA DO BANCO DE DADOS NO SUPABASE\n`;
  sql += `-- Versão: Completa (Inventário + Balcão/Movimentações + Colaboradores/Usuários)\n`;
  sql += `-- Data de Geração: ${new Date().toLocaleString('pt-BR')}\n`;
  sql += `-- =============================================================================\n\n`;

  sql += `-- 1. LIMPEZA SEGURA DE TABELAS LEGADAS E ATUAIS\n`;
  sql += `DROP TABLE IF EXISTS requisicoes_obras CASCADE;\n`;
  sql += `DROP TABLE IF EXISTS estoques CASCADE;\n`;
  sql += `DROP TABLE IF EXISTS almoxarifados CASCADE;\n`;
  sql += `DROP TABLE IF EXISTS fornecedores CASCADE;\n`;
  sql += `DROP TABLE IF EXISTS movimentacoes CASCADE;\n`;
  sql += `DROP TABLE IF EXISTS colaboradores CASCADE;\n`;
  sql += `DROP TABLE IF EXISTS produtos CASCADE;\n\n`;

  sql += `-- 2. FUNÇÃO E TRIGGER PARA ATUALIZAÇÃO AUTOMÁTICA DE TIMESTAMP\n`;
  sql += `CREATE OR REPLACE FUNCTION update_updated_at_column()\n`;
  sql += `RETURNS TRIGGER AS $$\n`;
  sql += `BEGIN\n`;
  sql += `    NEW.atualizado_em = CURRENT_TIMESTAMP;\n`;
  sql += `    RETURN NEW;\n`;
  sql += `END;\n`;
  sql += `$$ LANGUAGE plpgsql;\n\n`;

  sql += `-- 3. TABELA: PRODUTOS (INVENTÁRIO)\n`;
  sql += `CREATE TABLE produtos (\n`;
  sql += `    id BIGSERIAL PRIMARY KEY,\n`;
  sql += `    sku VARCHAR(100) UNIQUE NOT NULL,\n`;
  sql += `    nome VARCHAR(255) NOT NULL,\n`;
  sql += `    categoria VARCHAR(100) NOT NULL DEFAULT 'Geral',\n`;
  sql += `    marca VARCHAR(150),\n`;
  sql += `    unidade_medida VARCHAR(20) NOT NULL DEFAULT 'UN',\n`;
  sql += `    quantidade NUMERIC(14, 2) NOT NULL DEFAULT 0,\n`;
  sql += `    estoque_minimo NUMERIC(14, 2) NOT NULL DEFAULT 0,\n`;
  sql += `    preco_unitario NUMERIC(14, 2) DEFAULT 0.00,\n`;
  sql += `    localizacao VARCHAR(150),\n`;
  sql += `    tamanho VARCHAR(100),\n`;
  sql += `    cor VARCHAR(100),\n`;
  sql += `    peso VARCHAR(100),\n`;
  sql += `    numero_serie VARCHAR(100),\n`;
  sql += `    ca VARCHAR(50),\n`;
  sql += `    patrimonio VARCHAR(100),\n`;
  sql += `    tag VARCHAR(100),\n`;
  sql += `    criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,\n`;
  sql += `    atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP\n`;
  sql += `);\n\n`;

  sql += `DROP TRIGGER IF EXISTS trigger_update_produtos_atualizado_em ON produtos;\n`;
  sql += `CREATE TRIGGER trigger_update_produtos_atualizado_em\n`;
  sql += `    BEFORE UPDATE ON produtos\n`;
  sql += `    FOR EACH ROW\n`;
  sql += `    EXECUTE FUNCTION update_updated_at_column();\n\n`;

  sql += `-- 4. TABELA: COLABORADORES E USUÁRIOS DO SISTEMA\n`;
  sql += `CREATE TABLE colaboradores (\n`;
  sql += `    id BIGSERIAL PRIMARY KEY,\n`;
  sql += `    nome VARCHAR(255) NOT NULL,\n`;
  sql += `    matricula VARCHAR(50) UNIQUE,\n`;
  sql += `    cargo VARCHAR(100),\n`;
  sql += `    departamento VARCHAR(100),\n`;
  sql += `    email VARCHAR(150),\n`;
  sql += `    telefone VARCHAR(50),\n`;
  sql += `    tipo_perfil VARCHAR(50) NOT NULL DEFAULT 'TECNICO' CHECK (tipo_perfil IN ('TECNICO', 'SISTEMA')),\n`;
  sql += `    nivel_acesso VARCHAR(50) NOT NULL DEFAULT 'SOLICITANTE' CHECK (nivel_acesso IN ('SOLICITANTE', 'ADMIN', 'ALMOXARIFE', 'VISUALIZADOR')),\n`;
  sql += `    status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INATIVO')),\n`;
  sql += `    observacoes TEXT,\n`;
  sql += `    criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,\n`;
  sql += `    atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP\n`;
  sql += `);\n\n`;

  sql += `DROP TRIGGER IF EXISTS trigger_update_colaboradores_atualizado_em ON colaboradores;\n`;
  sql += `CREATE TRIGGER trigger_update_colaboradores_atualizado_em\n`;
  sql += `    BEFORE UPDATE ON colaboradores\n`;
  sql += `    FOR EACH ROW\n`;
  sql += `    EXECUTE FUNCTION update_updated_at_column();\n\n`;

  sql += `-- 5. TABELA: MOVIMENTACOES (HISTÓRICO, BALCÃO E AUDITORIA)\n`;
  sql += `CREATE TABLE movimentacoes (\n`;
  sql += `    id BIGSERIAL PRIMARY KEY,\n`;
  sql += `    produto_id BIGINT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,\n`;
  sql += `    colaborador_id BIGINT REFERENCES colaboradores(id) ON DELETE SET NULL,\n`;
  sql += `    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA', 'EMPRESTIMO', 'DEVOLUCAO', 'TROCA')),\n`;
  sql += `    quantidade NUMERIC(14, 2) NOT NULL CHECK (quantidade > 0),\n`;
  sql += `    motivo TEXT,\n`;
  sql += `    responsavel VARCHAR(150),\n`;
  sql += `    documento_ref VARCHAR(100),\n`;
  sql += `    colaborador VARCHAR(150),\n`;
  sql += `    status_emprestimo VARCHAR(50) DEFAULT 'PENDENTE',\n`;
  sql += `    data_devolucao TIMESTAMPTZ,\n`;
  sql += `    movimentacao_origem_id BIGINT REFERENCES movimentacoes(id) ON DELETE SET NULL,\n`;
  sql += `    criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP\n`;
  sql += `);\n\n`;

  sql += `-- 6. ÍNDICES DE PERFORMANCE\n`;
  sql += `CREATE INDEX idx_produtos_sku ON produtos(UPPER(sku));\n`;
  sql += `CREATE INDEX idx_produtos_categoria ON produtos(categoria);\n`;
  sql += `CREATE INDEX idx_produtos_nome ON produtos(nome);\n`;
  sql += `CREATE INDEX idx_movimentacoes_produto_id ON movimentacoes(produto_id);\n`;
  sql += `CREATE INDEX idx_movimentacoes_colaborador_id ON movimentacoes(colaborador_id);\n`;
  sql += `CREATE INDEX idx_movimentacoes_tipo ON movimentacoes(tipo);\n`;
  sql += `CREATE INDEX idx_movimentacoes_status_emprestimo ON movimentacoes(status_emprestimo);\n`;
  sql += `CREATE INDEX idx_movimentacoes_colaborador ON movimentacoes(colaborador);\n`;
  sql += `CREATE INDEX idx_movimentacoes_criado_em ON movimentacoes(criado_em);\n`;
  sql += `CREATE INDEX idx_colaboradores_nome ON colaboradores(nome);\n`;
  sql += `CREATE INDEX idx_colaboradores_matricula ON colaboradores(matricula);\n`;
  sql += `CREATE INDEX idx_colaboradores_tipo_perfil ON colaboradores(tipo_perfil);\n\n`;

  sql += `-- 7. CARGA DE DADOS SINCRONIZADA DO BANCO LOCAL\n`;
  sql += `BEGIN;\n\n`;

  // Inserts de Produtos
  const colsProd = [
    'id', 'sku', 'nome', 'categoria', 'marca', 'unidade_medida',
    'quantidade', 'estoque_minimo', 'preco_unitario', 'localizacao',
    'tamanho', 'cor', 'peso', 'numero_serie', 'ca', 'patrimonio', 'tag',
    'criado_em', 'atualizado_em'
  ];

  sql += `-- Produtos cadastrados (${produtos.length} itens)\n`;
  produtos.forEach(p => {
    const vals = colsProd.map(col => escapeSqlValue(p[col])).join(', ');
    sql += `INSERT INTO produtos (${colsProd.join(', ')}) VALUES (${vals});\n`;
  });

  sql += `\n-- Atualização da sequência de IDs de produtos\n`;
  sql += `SELECT setval(pg_get_serial_sequence('produtos', 'id'), COALESCE((SELECT MAX(id) FROM produtos), 1));\n\n`;

  // Inserts de Colaboradores (Inseridos antes de Movimentações para respeitar FK)
  const colsColab = [
    'id', 'nome', 'matricula', 'cargo', 'departamento', 'email', 'telefone',
    'tipo_perfil', 'nivel_acesso', 'status', 'observacoes', 'criado_em', 'atualizado_em'
  ];

  sql += `-- Colaboradores cadastrados (${colaboradores.length} pessoas)\n`;
  colaboradores.forEach(c => {
    const vals = colsColab.map(col => escapeSqlValue(c[col])).join(', ');
    sql += `INSERT INTO colaboradores (${colsColab.join(', ')}) VALUES (${vals});\n`;
  });

  sql += `\n-- Atualização da sequência de IDs de colaboradores\n`;
  sql += `SELECT setval(pg_get_serial_sequence('colaboradores', 'id'), COALESCE((SELECT MAX(id) FROM colaboradores), 1));\n\n`;

  // Inserts de Movimentações
  const colsMov = [
    'id', 'produto_id', 'colaborador_id', 'tipo', 'quantidade', 'motivo', 'responsavel', 'documento_ref',
    'colaborador', 'status_emprestimo', 'data_devolucao', 'movimentacao_origem_id', 'criado_em'
  ];

  sql += `-- Movimentações registradas (${movimentacoes.length} registros)\n`;
  movimentacoes.forEach(m => {
    const vals = colsMov.map(col => escapeSqlValue(m[col])).join(', ');
    sql += `INSERT INTO movimentacoes (${colsMov.join(', ')}) VALUES (${vals});\n`;
  });

  sql += `\n-- Atualização da sequência de IDs de movimentações\n`;
  sql += `SELECT setval(pg_get_serial_sequence('movimentacoes', 'id'), COALESCE((SELECT MAX(id) FROM movimentacoes), 1));\n\n`;

  sql += `COMMIT;\n\n`;

  sql += `-- 8. HABILITAR ROW LEVEL SECURITY (RLS) COM POLÍTICAS PERMISSIVAS PARA API\n`;
  sql += `ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;\n`;
  sql += `ALTER TABLE movimentacoes ENABLE ROW LEVEL SECURITY;\n`;
  sql += `ALTER TABLE colaboradores ENABLE ROW LEVEL SECURITY;\n\n`;

  sql += `CREATE POLICY "Acesso completo a produtos" ON produtos FOR ALL USING (true) WITH CHECK (true);\n`;
  sql += `CREATE POLICY "Acesso completo a movimentacoes" ON movimentacoes FOR ALL USING (true) WITH CHECK (true);\n`;
  sql += `CREATE POLICY "Acesso completo a colaboradores" ON colaboradores FOR ALL USING (true) WITH CHECK (true);\n\n`;

  sql += `-- =============================================================================\n`;
  sql += `-- FIM DO SCRIPT DE MIGRAÇÃO\n`;
  sql += `-- =============================================================================\n`;

  fs.writeFileSync(outputSqlPath, sql, 'utf8');
  console.log(`Script SQL gerado com sucesso em: ${outputSqlPath}`);
  console.log(`• Total de produtos incluídos: ${produtos.length}`);
  console.log(`• Total de movimentações incluídas: ${movimentacoes.length}`);
  console.log(`• Total de colaboradores incluídos: ${colaboradores.length}`);
}

gerarSqlRecriacao();
