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
    nivel_acesso VARCHAR(50) NOT NULL DEFAULT 'SOLICITANTE' CHECK (nivel_acesso IN ('SOLICITANTE', 'ADMIN', 'ALMOXARIFE', 'OPERADOR_FICHAS', 'VISUALIZADOR')),
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

-- 6. Carga inicial de colaboradores (Apenas Administrador Geral Jozivam Silva)
INSERT INTO colaboradores (nome, matricula, cargo, departamento, email, telefone, tipo_perfil, nivel_acesso, status, observacoes)
VALUES 
('Jozivam Silva', 'ALM-001', 'Gestor de Almoxarifado', 'Almoxarifado & Logística', 'jozivam.silva@empresa.com', '(11) 98765-4321', 'SISTEMA', 'ADMIN', 'ATIVO', 'Administrador geral do sistema de almoxarifado')
ON CONFLICT (matricula) DO NOTHING;
