-- =============================================================================
-- JPS ALMOXARIFADO - UNIFICAÇÃO DA CATEGORIA EPI / SEGURANÇA (SUPABASE)
-- Padroniza registros antigos gravados como 'EPI/Segurança' para 'EPI / Segurança'.
-- Script 100% idempotente: pode ser executado com segurança no SQL Editor.
-- =============================================================================

UPDATE public.produtos
SET categoria = 'EPI / Segurança'
WHERE REPLACE(LOWER(TRIM(categoria)), ' ', '') IN ('epi/segurança', 'epi/seguranca')
  AND categoria <> 'EPI / Segurança';
