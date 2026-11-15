-- =============================================================================
-- JPS ALMOXARIFADO - TABELA DE COLABORADORES E USUÁRIOS DO SISTEMA (SUPABASE)
-- Script 100% idempotente (pode ser executado múltiplas vezes com segurança)
-- =============================================================================

-- 1. Função utilitária para atualização de timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Tabela de Colaboradores e Usuários
CREATE TABLE IF NOT EXISTS colaboradores (
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

-- 3. Trigger idempotente (remove antes se já existir, evitando o erro 42710)
DROP TRIGGER IF EXISTS trigger_update_colaboradores_atualizado_em ON colaboradores;
CREATE TRIGGER trigger_update_colaboradores_atualizado_em
    BEFORE UPDATE ON colaboradores
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4. Índices de busca
CREATE INDEX IF NOT EXISTS idx_colaboradores_nome ON colaboradores(nome);
CREATE INDEX IF NOT EXISTS idx_colaboradores_matricula ON colaboradores(matricula);
CREATE INDEX IF NOT EXISTS idx_colaboradores_tipo_perfil ON colaboradores(tipo_perfil);
CREATE INDEX IF NOT EXISTS idx_colaboradores_nivel_acesso ON colaboradores(nivel_acesso);

-- 5. Segurança: Habilita Row Level Security (RLS) e Política de Acesso para o Sistema
ALTER TABLE colaboradores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso completo a colaboradores" ON colaboradores;
CREATE POLICY "Acesso completo a colaboradores" 
    ON colaboradores 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- 6. Carga inicial de colaboradores (ON CONFLICT evita duplicar dados se já existirem)
INSERT INTO colaboradores (nome, matricula, cargo, departamento, email, telefone, tipo_perfil, nivel_acesso, status, observacoes)
VALUES 
('Jozivam Silva', 'ALM-001', 'Gestor de Almoxarifado', 'Almoxarifado & Logística', 'jozivam.silva@empresa.com', '(11) 98765-4321', 'SISTEMA', 'ADMIN', 'ATIVO', 'Administrador geral do sistema de almoxarifado'),
('Carlos Pereira', 'TEC-101', 'Eletricista de Manutenção', 'Manutenção Elétrica', 'carlos.pereira@empresa.com', '(11) 97654-3210', 'TECNICO', 'SOLICITANTE', 'ATIVO', 'Técnico de campo para requisição de materiais elétricos e ferramentas'),
('Marcos Souza', 'TEC-102', 'Técnico de Redes e TI', 'TI / Telecom', 'marcos.souza@empresa.com', '(11) 96543-2109', 'TECNICO', 'SOLICITANTE', 'ATIVO', 'Técnico responsável por cabeamento e infraestrutura de TI'),
('Lucas Mendes', 'TEC-103', 'Encarregado de Obras', 'Operações e Obras', 'lucas.mendes@empresa.com', '(11) 95432-1098', 'TECNICO', 'SOLICITANTE', 'ATIVO', 'Responsável por solicitações de EPIs e ferramentas pesadas'),
('Ana Paula Ribeiro', 'ALM-002', 'Assistente de Almoxarifado', 'Almoxarifado & Logística', 'ana.ribeiro@empresa.com', '(11) 94321-0987', 'SISTEMA', 'ALMOXARIFE', 'ATIVO', 'Atendente de balcão e conferência de notas fiscais')
ON CONFLICT (matricula) DO NOTHING;
