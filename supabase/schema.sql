-- Run in a NEW dedicated Supabase project. No existing project tables are modified.
create schema if not exists ledger_private;
revoke all on schema ledger_private from public, anon;
grant usage on schema ledger_private to authenticated;
create table if not exists public.ledger_accounts (user_id uuid primary key references auth.users(id));
alter table public.ledger_accounts enable row level security;
create policy account_read on public.ledger_accounts for select to authenticated using (user_id=auth.uid());
grant select on public.ledger_accounts to authenticated;
revoke all on public.ledger_accounts from anon;
create table public.ledger_records (
 id uuid primary key, owner_id uuid not null references public.ledger_accounts(user_id),
 kind text not null check(kind in ('product','entry','settings')), version integer not null check(version>0),
 data jsonb not null, updated_at timestamptz not null default now()
);
create index ledger_owner on public.ledger_records(owner_id,kind);
create unique index one_settings_per_account on public.ledger_records(owner_id) where kind='settings';
create table public.ledger_history (
 op_id uuid primary key, owner_id uuid not null references public.ledger_accounts(user_id), record_id uuid not null,
 request jsonb not null, before_data jsonb, after_data jsonb not null, created_at timestamptz not null default now()
);
create index ledger_history_record on public.ledger_history(owner_id,record_id,created_at);
alter table public.ledger_records enable row level security;
alter table public.ledger_history enable row level security;
create policy record_read on public.ledger_records for select to authenticated using(owner_id=(select auth.uid()));
create policy history_read on public.ledger_history for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.ledger_records,public.ledger_history from anon,authenticated;
grant select on public.ledger_records,public.ledger_history to authenticated;

create function ledger_private.stock(p_owner uuid,p_product uuid,p_exclude uuid default null) returns numeric
language sql stable set search_path='' as $$
 select coalesce((select (data->>'opening')::numeric from public.ledger_records where id=p_product and owner_id=p_owner and kind='product'),0)+
 coalesce((select sum((l->>'quantity')::numeric * case r.data->>'type'
 when 'purchase' then 1 when 'count' then 1 when 'sale' then -1 when 'gift' then -1 when 'use' then -1 when 'waste' then -1
 when 'refund' then case when (l->>'restock')::boolean then 1 else 0 end else 0 end)
 from public.ledger_records r cross join lateral jsonb_array_elements(r.data->'lines') l
 where r.owner_id=p_owner and r.kind='entry' and not (r.data->>'voided')::boolean and (p_exclude is null or r.id<>p_exclude) and l->>'productId'=p_product::text),0)
$$;
revoke all on function ledger_private.stock(uuid,uuid,uuid) from public,anon,authenticated;

create function ledger_private.submit(p_op uuid,p_id uuid,p_kind text,p_base integer,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); old public.ledger_records; result public.ledger_records; prev public.ledger_history;
 req jsonb:=jsonb_build_object('id',p_id,'kind',p_kind,'base',p_base,'data',p_data);
 l jsonb; p jsonb; typ text; n numeric; sale public.ledger_records; refunded numeric; sold numeric;
begin
 if u is null or not exists(select 1 from public.ledger_accounts where user_id=u) then raise exception '帳號尚未取得帳本權限'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into prev from public.ledger_history where op_id=p_op;
 if found then
   if prev.owner_id<>u or prev.request<>req then raise exception '操作識別碼重複且內容不同'; end if;
   return jsonb_build_object('ok',true,'duplicate',true);
 end if;
 select * into old from public.ledger_records where id=p_id;
 if found and old.owner_id<>u then raise exception '無權限修改此紀錄'; end if;
 if coalesce(old.version,0)<>p_base then return jsonb_build_object('conflict',true,'current',to_jsonb(old),'reason','這筆資料已在其他裝置更新'); end if;
 if old.id is not null and old.kind<>p_kind then raise exception '不可更換紀錄種類'; end if;
 if p_kind not in ('product','entry','settings') or jsonb_typeof(p_data)<>'object' then raise exception '資料格式錯誤'; end if;
 if p_kind='settings' then
   if length(trim(coalesce(p_data->>'coffee','')))=0 or length(trim(coalesce(p_data->>'print','')))=0 or jsonb_typeof(p_data->'categories')<>'array' then raise exception '請填寫店名與分類'; end if;
   if exists(select 1 from public.ledger_records where owner_id=u and kind='settings' and id<>p_id) then raise exception '設定已存在，請同步後重新修改'; end if;
 elsif p_kind='product' then
   if length(trim(coalesce(p_data->>'name','')))=0 or length(trim(coalesce(p_data->>'unit','')))=0 then raise exception '請填寫品項名稱與單位'; end if;
   if jsonb_typeof(p_data->'price') is distinct from 'number' or jsonb_typeof(p_data->'opening') is distinct from 'number' or jsonb_typeof(p_data->'sellable') is distinct from 'boolean' or jsonb_typeof(p_data->'active') is distinct from 'boolean' then raise exception '品項欄位格式錯誤'; end if;
   if (p_data->>'price')::numeric<0 or (p_data->>'price')::numeric<>trunc((p_data->>'price')::numeric) or (p_data->>'price')::numeric>1000000000000 then raise exception '售價須為有效整數'; end if;
   n:=(p_data->>'opening')::numeric;
   if n<0 or n>1000000000 or n<>round(n,3) or ((p_data->>'sellable')::boolean and n<>trunc(n)) then raise exception '期初庫存格式錯誤'; end if;
   if old.id is not null and exists(select 1 from public.ledger_records r cross join lateral jsonb_array_elements(r.data->'lines') x where r.owner_id=u and r.kind='entry' and x->>'productId'=p_id::text) then
     if p_data->'opening'<>old.data->'opening' or p_data->'unit'<>old.data->'unit' or p_data->'sellable'<>old.data->'sellable' or coalesce((p_data->>'deleted')::boolean,false) then raise exception '已有紀錄，請以盤點或停用處理'; end if;
   end if;
 else
   typ:=p_data->>'type';
   if typ is null or typ not in ('sale','income','expense','purchase','gift','use','waste','count','refund') or coalesce(p_data->>'store','') not in ('coffee','print') then raise exception '帳目種類錯誤'; end if;
   if p_data->>'store'='print' and typ not in ('income','expense') then raise exception '影印店僅接受收入支出'; end if;
   if old.id is not null and (old.data->'store'<>p_data->'store' or old.data->'type'<>p_data->'type') then raise exception '請作廢後重登，不可直接更換店面或類型'; end if;
   if jsonb_typeof(p_data->'amount') is distinct from 'number' or jsonb_typeof(p_data->'voided') is distinct from 'boolean' or jsonb_typeof(p_data->'lines') is distinct from 'array' then raise exception '帳目欄位格式錯誤'; end if;
   if coalesce(p_data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '日期格式錯誤'; end if;
   perform (p_data->>'date')::date;
   n:=(p_data->>'amount')::numeric;
   if n<0 or n<>trunc(n) or n>1000000000000 then raise exception '金額須為非負整數'; end if;
   if typ not in ('sale','income','expense','refund') and n<>0 then raise exception '庫存異動不產生收支金額'; end if;
   if typ in ('income','expense') and jsonb_array_length(p_data->'lines')<>0 then raise exception '一般收支不可改動庫存'; end if;
   if typ not in ('income','expense') and jsonb_array_length(p_data->'lines')=0 then raise exception '請選擇品項'; end if;
   if (select count(*)<>count(distinct x->>'productId') from jsonb_array_elements(p_data->'lines') x) then raise exception '品項不可重複'; end if;
   if typ in ('gift','use','waste','count') and length(trim(coalesce(p_data->>'note','')))=0 then raise exception '請填寫庫存異動原因'; end if;
   for l in select * from jsonb_array_elements(p_data->'lines') loop
     select data into p from public.ledger_records where id=(l->>'productId')::uuid and owner_id=u and kind='product';
     if p is null or coalesce((p->>'deleted')::boolean,false) then raise exception '品項不存在'; end if;
     if jsonb_typeof(l->'quantity') is distinct from 'number' or jsonb_typeof(l->'price') is distinct from 'number' then raise exception '數量或單價格式錯誤'; end if;
     n:=(l->>'quantity')::numeric;
     if abs(n)>1000000000 or n<>round(n,3) or (typ<>'count' and n<=0) or ((p->>'sellable')::boolean and n<>trunc(n)) then raise exception '品項數量錯誤'; end if;
     if (l->>'price')::numeric<0 or (l->>'price')::numeric<>trunc((l->>'price')::numeric) then raise exception '原單價錯誤'; end if;
     if typ='sale' and not (p->>'sellable')::boolean then raise exception '原料耗材不能販售'; end if;
     if typ='refund' and jsonb_typeof(l->'restock') is distinct from 'boolean' then raise exception '請指定是否回補庫存'; end if;
   end loop;
   if typ='count' then
     if jsonb_array_length(p_data->'lines')<>1 or jsonb_typeof(p_data->'countActual') is distinct from 'number' or jsonb_typeof(p_data->'countExpected') is distinct from 'number' then raise exception '盤點欄位錯誤'; end if;
     l:=p_data->'lines'->0;
     if (p_data->>'countActual')::numeric<0 or (l->>'quantity')::numeric<>(p_data->>'countActual')::numeric-(p_data->>'countExpected')::numeric then raise exception '盤點差額不符'; end if;
     if not (p_data->>'voided')::boolean and (old.id is null or old.data->'lines'<>p_data->'lines') and ledger_private.stock(u,(l->>'productId')::uuid,p_id)<>(p_data->>'countExpected')::numeric then
       return jsonb_build_object('conflict',true,'current',to_jsonb(old),'reason','庫存已變動，請撤回本機盤點後重新盤點');
     end if;
   end if;
 end if;
 insert into public.ledger_records(id,owner_id,kind,version,data,updated_at) values(p_id,u,p_kind,p_base+1,p_data,clock_timestamp())
 on conflict(id) do update set data=excluded.data,version=excluded.version,updated_at=excluded.updated_at returning * into result;
 -- Validate the resulting ledger, including edits to sales already partially returned.
 if p_kind='entry' then
   if exists(select 1 from public.ledger_records r left join public.ledger_records s on s.id=(r.data->>'originalId')::uuid and s.owner_id=u and s.kind='entry'
    where r.owner_id=u and r.kind='entry' and r.data->>'type'='refund' and not (r.data->>'voided')::boolean
    and (s.id is null or s.data->>'type'<>'sale' or (s.data->>'voided')::boolean or r.data->>'date'<s.data->>'date')) then raise exception '退款需對應有效的原銷售，日期不可早於原銷售'; end if;
   for sale in select * from public.ledger_records where owner_id=u and kind='entry' and data->>'type'='sale' loop
     select coalesce(sum((r.data->>'amount')::numeric),0) into refunded from public.ledger_records r where r.owner_id=u and r.kind='entry' and r.data->>'type'='refund' and not (r.data->>'voided')::boolean and r.data->>'originalId'=sale.id::text;
     if refunded>(sale.data->>'amount')::numeric then raise exception '累計退款不可超過原實收金額'; end if;
     for l in select x from public.ledger_records r cross join lateral jsonb_array_elements(r.data->'lines') x where r.owner_id=u and r.kind='entry' and r.data->>'type'='refund' and not (r.data->>'voided')::boolean and r.data->>'originalId'=sale.id::text loop
       select coalesce(sum((x->>'quantity')::numeric),0) into sold from jsonb_array_elements(sale.data->'lines') x where x->>'productId'=l->>'productId';
       select coalesce(sum((x->>'quantity')::numeric),0) into refunded from public.ledger_records r cross join lateral jsonb_array_elements(r.data->'lines') x where r.owner_id=u and r.kind='entry' and r.data->>'type'='refund' and not (r.data->>'voided')::boolean and r.data->>'originalId'=sale.id::text and x->>'productId'=l->>'productId';
       if refunded>sold then raise exception '累計退貨數量不可超過原銷售數量'; end if;
     end loop;
   end loop;
 end if;
 insert into public.ledger_history(op_id,owner_id,record_id,request,before_data,after_data) values(p_op,u,p_id,req,old.data,result.data);
 return jsonb_build_object('ok',true,'record',to_jsonb(result));
end $$;
revoke all on function ledger_private.submit(uuid,uuid,text,integer,jsonb) from public,anon;
grant execute on function ledger_private.submit(uuid,uuid,text,integer,jsonb) to authenticated;
create function public.submit_ledger_operation(p_op uuid,p_id uuid,p_kind text,p_base integer,p_data jsonb) returns jsonb
language sql security invoker set search_path='' as $$select ledger_private.submit(p_op,p_id,p_kind,p_base,p_data)$$;
revoke all on function public.submit_ledger_operation(uuid,uuid,text,integer,jsonb) from public,anon;
grant execute on function public.submit_ledger_operation(uuid,uuid,text,integer,jsonb) to authenticated;
-- Provision one email/password user using Supabase Auth, disable public signups,
-- then explicitly authorize its UUID in ledger_accounts. Never store passwords here.
