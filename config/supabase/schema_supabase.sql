-- =============================================================================
-- JPS Almoxarifado - Schema PostgreSQL para Supabase
-- Executar no SQL Editor do Supabase (Dashboard -> SQL Editor -> New Query)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Função trigger para atualizar coluna atualizado_em automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. TABELA: FORNECEDORES
-- =============================================================================
CREATE TABLE IF NOT EXISTS fornecedores (
    id BIGSERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    cnpj VARCHAR(30),
    email VARCHAR(255),
    telefone VARCHAR(50),
    contato VARCHAR(100),
    criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 2. TABELA: ALMOXARIFADOS (Matriz Central e Canteiros de Obras)
-- =============================================================================
CREATE TABLE IF NOT EXISTS almoxarifados (
    id BIGSERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(50) DEFAULT 'OBRA',
    endereco TEXT,
    responsavel VARCHAR(150),
    telefone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'ATIVO',
    criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 3. TABELA: PRODUTOS (Catálogo de Materiais e Insumos)
-- =============================================================================
CREATE TABLE IF NOT EXISTS produtos (
    id BIGSERIAL PRIMARY KEY,
    sku VARCHAR(100) UNIQUE NOT NULL,
    tag VARCHAR(100),
    nome VARCHAR(255) NOT NULL,
    categoria VARCHAR(100) NOT NULL DEFAULT 'Geral',
    unidade_medida VARCHAR(20) DEFAULT 'UN',
    quantidade NUMERIC(14, 2) NOT NULL DEFAULT 0,
    estoque_minimo NUMERIC(14, 2) NOT NULL DEFAULT 5,
    preco_unitario NUMERIC(14, 2) DEFAULT 0.00,
    localizacao VARCHAR(150),
    fornecedor_id BIGINT REFERENCES fornecedores(id) ON DELETE SET NULL,
    criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS update_produtos_atualizado_em ON produtos;
CREATE TRIGGER update_produtos_atualizado_em
    BEFORE UPDATE ON produtos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 4. TABELA: ESTOQUES (Saldos Físicos por Almoxarifado / Canteiro)
-- =============================================================================
CREATE TABLE IF NOT EXISTS estoques (
    id BIGSERIAL PRIMARY KEY,
    produto_id BIGINT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
    almoxarifado_id BIGINT NOT NULL REFERENCES almoxarifados(id) ON DELETE CASCADE,
    quantidade NUMERIC(14, 2) NOT NULL DEFAULT 0,
    localizacao VARCHAR(150),
    atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_estoque_produto_almox UNIQUE(produto_id, almoxarifado_id)
);

DROP TRIGGER IF EXISTS update_estoques_atualizado_em ON estoques;
CREATE TRIGGER update_estoques_atualizado_em
    BEFORE UPDATE ON estoques
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 5. TABELA: MOVIMENTAÇÕES (Histórico de Entradas, Saídas e Transferências)
-- =============================================================================
CREATE TABLE IF NOT EXISTS movimentacoes (
    id BIGSERIAL PRIMARY KEY,
    produto_id BIGINT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA', 'TRANSFERENCIA')),
    quantidade NUMERIC(14, 2) NOT NULL,
    motivo TEXT NOT NULL,
    responsavel VARCHAR(150) NOT NULL,
    documento_ref VARCHAR(100),
    almoxarifado_origem_id BIGINT REFERENCES almoxarifados(id) ON DELETE SET NULL,
    almoxarifado_destino_id BIGINT REFERENCES almoxarifados(id) ON DELETE SET NULL,
    criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 6. TABELA: REQUISIÇÕES DE OBRAS (Pedidos entre Canteiros)
-- =============================================================================
CREATE TABLE IF NOT EXISTS requisicoes_obras (
    id BIGSERIAL PRIMARY KEY,
    codigo VARCHAR(100) UNIQUE,
    almoxarifado_origem_id BIGINT NOT NULL REFERENCES almoxarifados(id) ON DELETE RESTRICT,
    almoxarifado_destino_id BIGINT NOT NULL REFERENCES almoxarifados(id) ON DELETE RESTRICT,
    produto_id BIGINT NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
    quantidade NUMERIC(14, 2) NOT NULL,
    solicitante VARCHAR(150) NOT NULL,
    motivo TEXT,
    status VARCHAR(50) DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'APROVADA', 'ATENDIDA', 'FINALIZADA', 'CANCELADA')),
    observacoes TEXT,
    criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS update_requisicoes_atualizado_em ON requisicoes_obras;
CREATE TRIGGER update_requisicoes_atualizado_em
    BEFORE UPDATE ON requisicoes_obras
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ÍNDICES DE PERFORMANCE
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_produtos_sku ON produtos(sku);
CREATE INDEX IF NOT EXISTS idx_produtos_tag ON produtos(tag);
CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos(categoria);
CREATE INDEX IF NOT EXISTS idx_estoques_almox ON estoques(almoxarifado_id);
CREATE INDEX IF NOT EXISTS idx_estoques_produto ON estoques(produto_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_produto ON movimentacoes(produto_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_criado_em ON movimentacoes(criado_em);
CREATE INDEX IF NOT EXISTS idx_requisicoes_status ON requisicoes_obras(status);
CREATE INDEX IF NOT EXISTS idx_requisicoes_destino ON requisicoes_obras(almoxarifado_destino_id);

-- =============================================================================
-- SEGURANÇA (RLS - Row Level Security)
-- =============================================================================
ALTER TABLE fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE almoxarifados ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoques ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisicoes_obras ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso público/autenticado para a aplicação
DO $$
BEGIN
    DROP POLICY IF EXISTS "Permissao Total Fornecedores" ON fornecedores;
    CREATE POLICY "Permissao Total Fornecedores" ON fornecedores FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Permissao Total Almoxarifados" ON almoxarifados;
    CREATE POLICY "Permissao Total Almoxarifados" ON almoxarifados FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Permissao Total Produtos" ON produtos;
    CREATE POLICY "Permissao Total Produtos" ON produtos FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Permissao Total Estoques" ON estoques;
    CREATE POLICY "Permissao Total Estoques" ON estoques FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Permissao Total Movimentacoes" ON movimentacoes;
    CREATE POLICY "Permissao Total Movimentacoes" ON movimentacoes FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Permissao Total Requisicoes" ON requisicoes_obras;
    CREATE POLICY "Permissao Total Requisicoes" ON requisicoes_obras FOR ALL USING (true) WITH CHECK (true);
END $$;
