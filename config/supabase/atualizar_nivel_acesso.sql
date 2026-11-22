-- =============================================================================
-- JPS ALMOXARIFADO - ATUALIZAÇÃO DE NÍVEL DE ACESSO (SUPABASE POSTGRESQL)
-- Adiciona o nível 'OPERADOR_FICHAS' à constraint CHECK da tabela colaboradores.
-- Script 100% idempotente: pode ser executado no SQL Editor do Supabase com segurança.
-- =============================================================================

DO $$
DECLARE
    constraint_rec RECORD;
BEGIN
    FOR constraint_rec IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.colaboradores'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%nivel_acesso%'
    LOOP
        EXECUTE format('ALTER TABLE public.colaboradores DROP CONSTRAINT %I', constraint_rec.conname);
    END LOOP;
END $$;

ALTER TABLE public.colaboradores
    ADD CONSTRAINT colaboradores_nivel_acesso_check
    CHECK (nivel_acesso IN ('SOLICITANTE', 'ADMIN', 'ALMOXARIFE', 'OPERADOR_FICHAS', 'VISUALIZADOR'));
