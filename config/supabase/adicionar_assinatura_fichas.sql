-- =============================================================================
-- JPS ALMOXARIFADO - ASSINATURA DIGITAL NA FICHA DO COLABORADOR (SUPABASE)
-- Adiciona colunas para armazenar CPF/RG e assinaturas digitais da Ficha.
-- Script 100% idempotente: pode ser executado com segurança no SQL Editor.
-- =============================================================================

ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS cpf_rg TEXT,
  ADD COLUMN IF NOT EXISTS assinatura_colaborador TEXT,
  ADD COLUMN IF NOT EXISTS assinatura_colaborador_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assinatura_responsavel TEXT,
  ADD COLUMN IF NOT EXISTS assinatura_responsavel_nome TEXT,
  ADD COLUMN IF NOT EXISTS assinatura_responsavel_em TIMESTAMPTZ;
