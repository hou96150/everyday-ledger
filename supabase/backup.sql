-- Apply AFTER schema.sql. Additive backup API. Existing deployments must not rerun schema.sql.
-- All writes share submit()'s per-owner transaction lock.
create or replace function ledger_private.export_backup() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null or not exists(select 1 from public.ledger_accounts where user_id=u) then raise exception '帳號尚未取得帳本權限'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select jsonb_build_object('owner',u,'records',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.ledger_records r where owner_id=u),'[]'::jsonb),'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at,h.op_id) from public.ledger_history h where owner_id=u),'[]'::jsonb)) into result;
 if octet_length(result::text)>20971520 then raise exception '帳本超過 20 MB，請由管理者執行資料庫備份'; end if;
 return result;
end $$;
revoke all on function ledger_private.export_backup() from public,anon;
grant execute on function ledger_private.export_backup() to authenticated;
create or replace function public.export_ledger_backup() returns jsonb
language sql security invoker set search_path='' as $$select ledger_private.export_backup()$$;
revoke all on function public.export_ledger_backup() from public,anon;
grant execute on function public.export_ledger_backup() to authenticated;

create or replace function ledger_private.restore_backup(p_snapshot jsonb,p_target_owner uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); source_owner uuid; r jsonb; h jsonb; result jsonb;
begin
 if p_target_owner is distinct from u then raise exception '登入帳號已變更，請重新開啟'; end if;
 if u is null or not exists(select 1 from public.ledger_accounts where user_id=u) then raise exception '帳號尚未取得帳本權限'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if exists(select 1 from public.ledger_records where owner_id=u) or exists(select 1 from public.ledger_history where owner_id=u) then raise exception '目前雲端帳本不是空白，還原已取消'; end if;
 if jsonb_typeof(p_snapshot) is distinct from 'object' or jsonb_typeof(p_snapshot->'records') is distinct from 'array' or jsonb_typeof(p_snapshot->'history') is distinct from 'array' or octet_length(p_snapshot::text)>20971520 then raise exception '備份格式錯誤或超過 20 MB'; end if;
 source_owner:=(p_snapshot->>'owner')::uuid;
 if source_owner is null or jsonb_array_length(p_snapshot->'records')>50000 or jsonb_array_length(p_snapshot->'history')>100000 then raise exception '備份格式或筆數錯誤'; end if;
 for r in select * from jsonb_array_elements(p_snapshot->'records') loop
  if (r->>'owner_id')::uuid is distinct from source_owner or jsonb_typeof(r->'data') is distinct from 'object' or jsonb_typeof(r->'version') is distinct from 'number' or (r->>'version')::numeric<0 or (r->>'version')::numeric<>trunc((r->>'version')::numeric) then raise exception '備份帳號或紀錄格式錯誤'; end if;
  insert into public.ledger_records(id,owner_id,kind,version,data,updated_at) values((r->>'id')::uuid,u,r->>'kind',greatest(1,(r->>'version')::integer),r->'data',(r->>'updated_at')::timestamptz);
 end loop;
 -- Validate the complete restored state using the same server rules as normal edits.
 -- Existing count lines are unchanged, so historical counts are not replayed.
 for r in select * from jsonb_array_elements(p_snapshot->'records') loop
  result:=ledger_private.submit(gen_random_uuid(),(r->>'id')::uuid,r->>'kind',greatest(1,(r->>'version')::integer),r->'data');
  if not coalesce((result->>'ok')::boolean,false) then raise exception '備份紀錄驗證失敗'; end if;
 end loop;
 -- Keep original versions, timestamps and history, not validation-generated edits.
 delete from public.ledger_history where owner_id=u;
 for r in select * from jsonb_array_elements(p_snapshot->'records') loop
  update public.ledger_records set version=greatest(1,(r->>'version')::integer),updated_at=(r->>'updated_at')::timestamptz where id=(r->>'id')::uuid and owner_id=u;
 end loop;
 for h in select * from jsonb_array_elements(p_snapshot->'history') loop
  if (h->>'owner_id')::uuid is distinct from source_owner or jsonb_typeof(h->'request') is distinct from 'object' or h->'request'->>'id' is distinct from h->>'record_id' or jsonb_typeof(h->'request'->'base') is distinct from 'number' or (h->'request'->>'base')::numeric<0 or (h->'request'->>'base')::numeric<>trunc((h->'request'->>'base')::numeric) or jsonb_typeof(h->'after_data') is distinct from 'object' or (h->'before_data'<>'null'::jsonb and jsonb_typeof(h->'before_data') is distinct from 'object') or not exists(select 1 from public.ledger_records where id=(h->>'record_id')::uuid and owner_id=u) then raise exception '備份修改歷史關聯錯誤'; end if;
  insert into public.ledger_history(op_id,owner_id,record_id,request,before_data,after_data,created_at) values((h->>'op_id')::uuid,u,(h->>'record_id')::uuid,h->'request',nullif(h->'before_data','null'::jsonb),h->'after_data',(h->>'created_at')::timestamptz);
 end loop;
 return jsonb_build_object('ok',true,'records',jsonb_array_length(p_snapshot->'records'));
end $$;
revoke all on function ledger_private.restore_backup(jsonb,uuid) from public,anon;
grant execute on function ledger_private.restore_backup(jsonb,uuid) to authenticated;
create or replace function public.restore_ledger_backup(p_snapshot jsonb,p_target_owner uuid) returns jsonb
language sql security invoker set search_path='' as $$select ledger_private.restore_backup(p_snapshot,p_target_owner)$$;
revoke all on function public.restore_ledger_backup(jsonb,uuid) from public,anon;
grant execute on function public.restore_ledger_backup(jsonb,uuid) to authenticated;
