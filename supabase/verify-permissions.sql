-- Read-only deployment gate; does not read ledger contents or write data.
do $verify$
declare r text; t text; p text; expected boolean; f record;
begin
 foreach r in array array['anon','authenticated','service_role'] loop
  foreach t in array array['ledger_accounts','ledger_records','ledger_history','ledger_setup'] loop
   foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
    expected := (r='authenticated' and t<>'ledger_setup' and p='SELECT') or (r='service_role' and ((t='ledger_accounts' and p in ('SELECT','INSERT')) or (t='ledger_setup' and p in ('SELECT','UPDATE'))));
    if has_table_privilege(r,'public.'||t,p) is distinct from expected then raise exception 'Permission mismatch: % %.%',r,t,p; end if;
   end loop;
  end loop;
  for f in select n.nspname,p0.oid,p0.proname from pg_proc p0 join pg_namespace n on n.oid=p0.pronamespace where n.nspname='ledger_private' or (n.nspname='public' and p0.proname in ('submit_ledger_operation','export_ledger_backup','restore_ledger_backup','claim_ledger_setup','finish_ledger_setup')) loop
   expected := case when f.proname in ('claim_ledger_setup','finish_ledger_setup') then r='service_role' when f.proname='stock' then false else r='authenticated' end;
   if has_function_privilege(r,f.oid,'EXECUTE') is distinct from expected then raise exception 'Function permission mismatch: % %.%',r,f.nspname,f.proname; end if;
  end loop;
  if has_schema_privilege(r,'ledger_private','USAGE') is distinct from (r='authenticated') or has_schema_privilege(r,'ledger_private','CREATE') then raise exception 'Private schema permission mismatch: %',r; end if;
 end loop;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('ledger_accounts','ledger_records','ledger_history','ledger_setup') and not c.relrowsecurity) then raise exception 'Ledger RLS disabled'; end if;
 if exists(select 1 from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(a.attacl) x where n.nspname='public' and c.relname in ('ledger_accounts','ledger_records','ledger_history','ledger_setup') and x.grantee in (0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole)) then raise exception 'Unexpected column-level grants'; end if;
 if exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) x where d.defaclrole='postgres'::regrole and (d.defaclnamespace in ('public'::regnamespace,'ledger_private'::regnamespace) or d.defaclnamespace=0) and x.grantee in (0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole)) then raise exception 'Unexpected automatic API grants'; end if;
 if not exists(select 1 from pg_default_acl d where d.defaclrole='postgres'::regrole and d.defaclnamespace=0 and d.defaclobjtype='f') then raise exception 'Global function default has not been secured'; end if;
end $verify$;
select 'PASS: ledger permission allowlist, RLS, column grants and application defaults' as verification;
