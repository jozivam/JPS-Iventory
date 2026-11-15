-- =============================================================================
-- JPS ALMOXARIFADO - RECRIAÇÃO LIMPA DO BANCO DE DADOS NO SUPABASE
-- Versão: MVP Enxuto (Inventário + Movimentações)
-- Data de Geração: 14/11/2026, 20:52:03
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
    criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trigger_update_produtos_atualizado_em
    BEFORE UPDATE ON produtos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4. TABELA: MOVIMENTACOES (HISTÓRICO, BALCÃO E AUDITORIA)
CREATE TABLE movimentacoes (
    id BIGSERIAL PRIMARY KEY,
    produto_id BIGINT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
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

-- 5. TABELA: COLABORADORES E USUÁRIOS DO SISTEMA
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
    observacoes TEXT,
    criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trigger_update_colaboradores_atualizado_em
    BEFORE UPDATE ON colaboradores
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 6. ÍNDICES DE PERFORMANCE
CREATE INDEX idx_produtos_sku ON produtos(UPPER(sku));
CREATE INDEX idx_produtos_categoria ON produtos(categoria);
CREATE INDEX idx_produtos_nome ON produtos(nome);
CREATE INDEX idx_movimentacoes_produto_id ON movimentacoes(produto_id);
CREATE INDEX idx_movimentacoes_tipo ON movimentacoes(tipo);
CREATE INDEX idx_movimentacoes_status_emprestimo ON movimentacoes(status_emprestimo);
CREATE INDEX idx_movimentacoes_colaborador ON movimentacoes(colaborador);
CREATE INDEX idx_movimentacoes_criado_em ON movimentacoes(criado_em);
CREATE INDEX idx_colaboradores_nome ON colaboradores(nome);
CREATE INDEX idx_colaboradores_matricula ON colaboradores(matricula);
CREATE INDEX idx_colaboradores_tipo_perfil ON colaboradores(tipo_perfil);

-- 7. CARGA INICIAL DE DADOS (SINCRONIZAÇÃO DO BANCO LOCAL)
BEGIN;

-- Produtos cadastrados (9 itens)
INSERT INTO produtos (id, sku, nome, categoria, marca, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, tamanho, cor, peso, numero_serie, ca, patrimonio, tag, criado_em, atualizado_em) VALUES (1, 'FER-ALC-001', 'Alicate Universal 8 Polegadas Isolado 1000V', 'Ferramentas', 'Tramontina Pro', 'UN', 12, 5, 45.2, 'Bancada B-05', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-11-14 19:04:19', '2026-11-14 20:42:28');
INSERT INTO produtos (id, sku, nome, categoria, marca, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, tamanho, cor, peso, numero_serie, ca, patrimonio, tag, criado_em, atualizado_em) VALUES (2, 'ELE-CAB-030', 'Cabo de Rede UTP Cat6 100% Cobre (Bobina 305m)', 'Elétrica e TI', 'Furukawa', 'CX', 2, 4, 490, 'Depósito D-02', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-11-14 19:04:19', '2026-11-14 20:42:28');
INSERT INTO produtos (id, sku, nome, categoria, marca, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, tamanho, cor, peso, numero_serie, ca, patrimonio, tag, criado_em, atualizado_em) VALUES (3, 'EPI-CAP-001', 'Capacete de Segurança com Jugular Azul', 'EPI / Segurança', 'MSA', 'UN', 18, 10, 32.5, 'Prateleira A-01', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-11-14 19:04:19', '2026-11-14 20:42:28');
INSERT INTO produtos (id, sku, nome, categoria, marca, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, tamanho, cor, peso, numero_serie, ca, patrimonio, tag, criado_em, atualizado_em) VALUES (4, 'ELE-DIS-031', 'Disjuntor Bipolar Din 32A Curva C', 'Elétrica e TI', 'Schneider Electric', 'UN', 30, 10, 28.75, 'Gaveteiro E-08', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-11-14 19:04:19', '2026-11-14 20:42:28');
INSERT INTO produtos (id, sku, nome, categoria, marca, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, tamanho, cor, peso, numero_serie, ca, patrimonio, tag, criado_em, atualizado_em) VALUES (5, 'FER-CHV-010', 'Jogo de Chaves de Fenda e Phillips 6 Peças', 'Ferramentas', 'Gedore', 'JG', 8, 3, 68, 'Bancada B-04', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-11-14 19:04:19', '2026-11-14 20:42:28');
INSERT INTO produtos (id, sku, nome, categoria, marca, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, tamanho, cor, peso, numero_serie, ca, patrimonio, tag, criado_em, atualizado_em) VALUES (6, 'EPI-LUV-002', 'Luva de Vaqueta Mista Tamanho G', 'EPI / Segurança', 'Danny', 'PAR', 4, 15, 18.9, 'Prateleira A-03', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-11-14 19:04:19', '2026-11-14 20:42:28');
INSERT INTO produtos (id, sku, nome, categoria, marca, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, tamanho, cor, peso, numero_serie, ca, patrimonio, tag, criado_em, atualizado_em) VALUES (7, 'SUP-FIT-005', 'Fita Isolante 3M Imperial 19mm x 20m', 'Elétrica e TI', '3M', 'UN', 45, 10, 9.8, 'Gaveteiro E-01', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-11-14 19:04:19', '2026-11-14 20:42:28');
INSERT INTO produtos (id, sku, nome, categoria, marca, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, tamanho, cor, peso, numero_serie, ca, patrimonio, tag, criado_em, atualizado_em) VALUES (8, 'FER-TRN-003', 'Trena Métrica Profissional 8 Metros Emborrachada', 'Ferramentas', 'Lufkin', 'UN', 0, 5, 35, 'Bancada B-01', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-11-14 19:04:19', '2026-11-14 20:42:28');
INSERT INTO produtos (id, sku, nome, categoria, marca, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, tamanho, cor, peso, numero_serie, ca, patrimonio, tag, criado_em, atualizado_em) VALUES (12, 'FER-6795', 'Testes', 'Ferramentas', 'Testes', 'UN', 25, 2, 0, NULL, '55', 'Laranja', '5', '123456', '64236', '888888', '555555', '2026-11-14 20:42:28', '2026-11-14 20:42:28');

-- Atualização da sequência de IDs de produtos
SELECT setval(pg_get_serial_sequence('produtos', 'id'), COALESCE((SELECT MAX(id) FROM produtos), 1));

-- Movimentações registradas (8 registros)
INSERT INTO movimentacoes (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, criado_em) VALUES (1, 1, 'ENTRADA', 12, 'Carga inicial do inventario', 'Jozivam Silva', 'IMPLANTACAO-01', '2026-11-14 19:04:19');
INSERT INTO movimentacoes (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, criado_em) VALUES (2, 2, 'ENTRADA', 2, 'Estoque inicial / Carga do almoxarifado', 'Jozivam Silva', 'IMPLANTACAO-01', '2026-11-14 19:04:19');
INSERT INTO movimentacoes (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, criado_em) VALUES (3, 3, 'ENTRADA', 18, 'Estoque inicial / Carga do almoxarifado', 'Jozivam Silva', 'IMPLANTACAO-01', '2026-11-14 19:04:19');
INSERT INTO movimentacoes (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, criado_em) VALUES (4, 4, 'ENTRADA', 30, 'Estoque inicial / Carga do almoxarifado', 'Jozivam Silva', 'IMPLANTACAO-01', '2026-11-14 19:04:19');
INSERT INTO movimentacoes (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, criado_em) VALUES (5, 5, 'ENTRADA', 8, 'Estoque inicial / Carga do almoxarifado', 'Jozivam Silva', 'IMPLANTACAO-01', '2026-11-14 19:04:19');
INSERT INTO movimentacoes (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, criado_em) VALUES (6, 6, 'ENTRADA', 4, 'Estoque inicial / Carga do almoxarifado', 'Jozivam Silva', 'IMPLANTACAO-01', '2026-11-14 19:04:19');
INSERT INTO movimentacoes (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, criado_em) VALUES (7, 7, 'ENTRADA', 45, 'Estoque inicial / Carga do almoxarifado', 'Jozivam Silva', 'IMPLANTACAO-01', '2026-11-14 19:04:19');
INSERT INTO movimentacoes (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, criado_em) VALUES (11, 12, 'ENTRADA', 25, 'Carga inicial via importação Excel', 'Importação em Lote', 'PLANILHA-IMPORT', '2026-11-14 20:42:28');

-- Atualização da sequência de IDs de movimentações
SELECT setval(pg_get_serial_sequence('movimentacoes', 'id'), COALESCE((SELECT MAX(id) FROM movimentacoes), 1));

-- Colaboradores cadastrados
INSERT INTO colaboradores (id, nome, matricula, cargo, departamento, email, telefone, tipo_perfil, nivel_acesso, status, observacoes) VALUES
(1, 'Jozivam Silva', 'ALM-001', 'Gestor de Almoxarifado', 'Almoxarifado & Logística', 'jozivam.silva@empresa.com', '(11) 98765-4321', 'SISTEMA', 'ADMIN', 'ATIVO', 'Administrador geral do sistema de almoxarifado'),
(2, 'Carlos Pereira', 'TEC-101', 'Eletricista de Manutenção', 'Manutenção Elétrica', 'carlos.pereira@empresa.com', '(11) 97654-3210', 'TECNICO', 'SOLICITANTE', 'ATIVO', 'Técnico de campo para requisição de materiais elétricos e ferramentas'),
(3, 'Marcos Souza', 'TEC-102', 'Técnico de Redes e TI', 'TI / Telecom', 'marcos.souza@empresa.com', '(11) 96543-2109', 'TECNICO', 'SOLICITANTE', 'ATIVO', 'Técnico responsável por cabeamento e infraestrutura de TI'),
(4, 'Lucas Mendes', 'TEC-103', 'Encarregado de Obras', 'Operações e Obras', 'lucas.mendes@empresa.com', '(11) 95432-1098', 'TECNICO', 'SOLICITANTE', 'ATIVO', 'Responsável por solicitações de EPIs e ferramentas pesadas'),
(5, 'Ana Paula Ribeiro', 'ALM-002', 'Assistente de Almoxarifado', 'Almoxarifado & Logística', 'ana.ribeiro@empresa.com', '(11) 94321-0987', 'SISTEMA', 'ALMOXARIFE', 'ATIVO', 'Atendente de balcão e conferência de notas fiscais');

SELECT setval(pg_get_serial_sequence('colaboradores', 'id'), COALESCE((SELECT MAX(id) FROM colaboradores), 1));

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
