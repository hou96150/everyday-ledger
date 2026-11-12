-- Apply after schema.sql, setup.sql and backup.sql. Safe to reapply.
-- No ledger rows, RLS policies, authentication roles or managed schemas change.
revoke all on public.ledger_accounts, public.ledger_records, public.ledger_history, public.ledger_setup from public, anon, authenticated, service_role;
grant select on public.ledger_accounts, public.ledger_records, public.ledger_history to authenticated;
grant select, insert on public.ledger_accounts to service_role;
grant select, update on public.ledger_setup to service_role;
revoke all on function public.submit_ledger_operation(uuid,uuid,text,integer,jsonb), public.export_ledger_backup(), public.restore_ledger_backup(jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function public.submit_ledger_operation(uuid,uuid,text,integer,jsonb), public.export_ledger_backup(), public.restore_ledger_backup(jsonb,uuid) to authenticated;
revoke all on function public.claim_ledger_setup(text), public.finish_ledger_setup(text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.claim_ledger_setup(text), public.finish_ledger_setup(text,uuid) to service_role;
revoke all on schema ledger_private from public, anon, authenticated, service_role;
grant usage on schema ledger_private to authenticated;
revoke all on function ledger_private.stock(uuid,uuid,uuid), ledger_private.submit(uuid,uuid,text,integer,jsonb), ledger_private.export_backup(), ledger_private.restore_backup(jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function ledger_private.submit(uuid,uuid,text,integer,jsonb), ledger_private.export_backup(), ledger_private.restore_backup(jsonb,uuid) to authenticated;
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema ledger_private revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema ledger_private revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema ledger_private revoke all on functions from public, anon, authenticated, service_role;
