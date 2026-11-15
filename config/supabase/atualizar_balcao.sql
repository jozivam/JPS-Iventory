-- =============================================================================
-- JPS ALMOXARIFADO - ATUALIZAÇÃO PARA O MÓDULO BALCÃO NO SUPABASE
-- Execute este script no SQL Editor do Supabase para atualizar a base existente
-- sem perder nenhum dado já cadastrado.
-- =============================================================================

-- 1. Atualizar restrição de tipos de movimentação permitidos
ALTER TABLE movimentacoes DROP CONSTRAINT IF EXISTS movimentacoes_tipo_check;
ALTER TABLE movimentacoes ADD CONSTRAINT movimentacoes_tipo_check 
    CHECK (tipo IN ('ENTRADA', 'SAIDA', 'EMPRESTIMO', 'DEVOLUCAO', 'TROCA'));

-- 2. Adicionar novas colunas necessárias para o Balcão e Empréstimos
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS colaborador VARCHAR(150);
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS status_emprestimo VARCHAR(50) DEFAULT 'PENDENTE';
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS data_devolucao TIMESTAMPTZ;
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS movimentacao_origem_id BIGINT REFERENCES movimentacoes(id) ON DELETE SET NULL;

-- 3. Criar índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_movimentacoes_status_emprestimo ON movimentacoes(status_emprestimo);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_colaborador ON movimentacoes(colaborador);
