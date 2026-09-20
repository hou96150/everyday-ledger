-- One-time household setup. Only the server-side Edge Function can access these.
create table public.ledger_setup (
 id integer primary key check(id=1), token_hash text, lock_until timestamptz,
 completed_at timestamptz
);
alter table public.ledger_setup enable row level security;
revoke all on public.ledger_setup from anon,authenticated;
grant all on public.ledger_setup to service_role;
grant select,insert on public.ledger_accounts to service_role;
create function public.claim_ledger_setup(p_hash text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update public.ledger_setup set lock_until=now()+interval '2 minutes'
 where id=1 and token_hash=p_hash and completed_at is null and (lock_until is null or lock_until<now());
 return found;
end $$;
create function public.finish_ledger_setup(p_hash text,p_user uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.ledger_setup where id=1 and token_hash=p_hash and completed_at is null for update;
 if not found then raise exception 'Setup no longer available'; end if;
 insert into public.ledger_accounts(user_id) values(p_user);
 update public.ledger_setup set token_hash=null,completed_at=now(),lock_until=null where id=1;
 return true;
end $$;
revoke all on function public.claim_ledger_setup(text),public.finish_ledger_setup(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_ledger_setup(text),public.finish_ledger_setup(text,uuid) to service_role;
