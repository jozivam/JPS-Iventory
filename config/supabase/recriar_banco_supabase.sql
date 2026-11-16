-- =============================================================================
-- JPS ALMOXARIFADO - RECRIAÇÃO LIMPA DO BANCO DE DADOS NO SUPABASE
-- Versão: Completa (Inventário + Balcão/Movimentações + Colaboradores/Usuários)
-- Data de Geração: 15/11/2026, 20:08:35
-- =============================================================================

-- 1. LIMPEZA SEGURA DE TABELAS LEGADAS E ATUAIS
DROP TABLE IF EXISTS requisicoes_obras CASCADE;
DROP TABLE IF EXISTS estoques CASCADE;
DROP TABLE IF EXISTS almoxarifados CASCADE;
DROP TABLE IF EXISTS fornecedores CASCADE;
DROP TABLE IF EXISTS movimentacoes CASCADE;
DROP TABLE IF EXISTS colaboradores CASCADE;
DROP TABLE IF EXISTS produtos CASCADE;

-- 2. FUNÇÃO E TRIGGER PARA ATUALIZAÇÃO AUTOMÁTICA DE TIMESTAMP
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. TABELA: PRODUTOS (INVENTÁRIO)
CREATE TABLE produtos (
    id BIGSERIAL PRIMARY KEY,
    sku VARCHAR(100) UNIQUE NOT NULL,
    nome VARCHAR(255) NOT NULL,
    categoria VARCHAR(100) NOT NULL DEFAULT 'Geral',
    marca VARCHAR(150),
    unidade_medida VARCHAR(20) NOT NULL DEFAULT 'UN',
    quantidade NUMERIC(14, 2) NOT NULL DEFAULT 0,
    estoque_minimo NUMERIC(14, 2) NOT NULL DEFAULT 0,
    preco_unitario NUMERIC(14, 2) DEFAULT 0.00,
    localizacao VARCHAR(150),
    tamanho VARCHAR(100),
    cor VARCHAR(100),
    peso VARCHAR(100),
    numero_serie VARCHAR(100),
    ca VARCHAR(50),
    patrimonio VARCHAR(100),
    tag VARCHAR(100),
    observacao TEXT,
    condicao VARCHAR(50) DEFAULT 'NOVO',
    criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trigger_update_produtos_atualizado_em ON produtos;
CREATE TRIGGER trigger_update_produtos_atualizado_em
    BEFORE UPDATE ON produtos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4. TABELA: COLABORADORES E USUÁRIOS DO SISTEMA
CREATE TABLE colaboradores (
    id BIGSERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    matricula VARCHAR(50) UNIQUE,
    cargo VARCHAR(100),
    departamento VARCHAR(100),
    email VARCHAR(150),
    telefone VARCHAR(50),
    tipo_perfil VARCHAR(50) NOT NULL DEFAULT 'TECNICO' CHECK (tipo_perfil IN ('TECNICO', 'SISTEMA')),
    nivel_acesso VARCHAR(50) NOT NULL DEFAULT 'SOLICITANTE' CHECK (nivel_acesso IN ('SOLICITANTE', 'ADMIN', 'ALMOXARIFE', 'VISUALIZADOR')),
    status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INATIVO')),
    login VARCHAR(100) UNIQUE,
    senha_hash VARCHAR(255),
    observacoes TEXT,
    criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trigger_update_colaboradores_atualizado_em ON colaboradores;
CREATE TRIGGER trigger_update_colaboradores_atualizado_em
    BEFORE UPDATE ON colaboradores
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. TABELA: MOVIMENTACOES (HISTÓRICO, BALCÃO E AUDITORIA)
CREATE TABLE movimentacoes (
    id BIGSERIAL PRIMARY KEY,
    produto_id BIGINT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
    colaborador_id BIGINT REFERENCES colaboradores(id) ON DELETE SET NULL,
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA', 'EMPRESTIMO', 'DEVOLUCAO', 'TROCA')),
    quantidade NUMERIC(14, 2) NOT NULL CHECK (quantidade > 0),
    motivo TEXT,
    responsavel VARCHAR(150),
    documento_ref VARCHAR(100),
    colaborador VARCHAR(150),
    status_emprestimo VARCHAR(50) DEFAULT 'PENDENTE',
    data_devolucao TIMESTAMPTZ,
    movimentacao_origem_id BIGINT REFERENCES movimentacoes(id) ON DELETE SET NULL,
    criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. ÍNDICES DE PERFORMANCE
CREATE INDEX idx_produtos_sku ON produtos(UPPER(sku));
CREATE INDEX idx_produtos_categoria ON produtos(categoria);
CREATE INDEX idx_produtos_nome ON produtos(nome);
CREATE INDEX idx_movimentacoes_produto_id ON movimentacoes(produto_id);
CREATE INDEX idx_movimentacoes_colaborador_id ON movimentacoes(colaborador_id);
CREATE INDEX idx_movimentacoes_tipo ON movimentacoes(tipo);
CREATE INDEX idx_movimentacoes_status_emprestimo ON movimentacoes(status_emprestimo);
CREATE INDEX idx_movimentacoes_colaborador ON movimentacoes(colaborador);
CREATE INDEX idx_movimentacoes_criado_em ON movimentacoes(criado_em);
CREATE INDEX idx_colaboradores_nome ON colaboradores(nome);
CREATE INDEX idx_colaboradores_matricula ON colaboradores(matricula);
CREATE INDEX idx_colaboradores_login ON colaboradores(login);
CREATE INDEX idx_colaboradores_tipo_perfil ON colaboradores(tipo_perfil);

-- 7. CARGA DE DADOS SINCRONIZADA DO BANCO LOCAL
BEGIN;

-- Produtos cadastrados (0 itens)

-- Atualização da sequência de IDs de produtos
SELECT setval(pg_get_serial_sequence('produtos', 'id'), COALESCE((SELECT MAX(id) FROM produtos), 1));

-- Colaboradores cadastrados (1 pessoas)
INSERT INTO colaboradores (id, nome, matricula, cargo, departamento, email, telefone, tipo_perfil, nivel_acesso, status, login, senha_hash, observacoes, criado_em, atualizado_em) VALUES (1, 'Jozivam Silva', 'ALM-001', 'Gestor de Almoxarifado', 'Almoxarifado & Logística', 'jozivam.silva@empresa.com', '(11) 98765-4321', 'SISTEMA', 'ADMIN', 'ATIVO', 'jozivam', '$2b$10$KAQ702zgyZzHPgazLPh72uVn.0/2eZdewinBlqfG93FRpftCWf8Xa', 'Administrador geral do sistema de almoxarifado', '2026-11-15 15:53:25', '2026-11-15 15:53:25');

-- Atualização da sequência de IDs de colaboradores
SELECT setval(pg_get_serial_sequence('colaboradores', 'id'), COALESCE((SELECT MAX(id) FROM colaboradores), 1));

-- Movimentações registradas (0 registros)

-- Atualização da sequência de IDs de movimentações
SELECT setval(pg_get_serial_sequence('movimentacoes', 'id'), COALESCE((SELECT MAX(id) FROM movimentacoes), 1));

COMMIT;

-- 8. HABILITAR ROW LEVEL SECURITY (RLS) COM POLÍTICAS PERMISSIVAS PARA API
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE colaboradores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso completo a produtos" ON produtos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso completo a movimentacoes" ON movimentacoes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso completo a colaboradores" ON colaboradores FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- FIM DO SCRIPT DE MIGRAÇÃO
-- =============================================================================
