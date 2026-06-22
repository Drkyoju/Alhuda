-- ═══════════════════════════════════════════════════════════════════════════
-- supabase_scores_rpc_only.sql
-- Remove direct client INSERT on scores — only submit_score() RPC may write.
-- Run after supabase_submit_score.sql (user must be authenticated to save).
-- IDEMPOTENT — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

drop policy if exists "Users insert own scores" on public.scores;

commit;
