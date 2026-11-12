import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
const pg = new PGlite();
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const p = "33333333-3333-4333-8333-333333333333";
const data = { name:"QA",category:"QA",unit:"包",price:100,opening:10,sellable:true,active:true };
beforeAll(async()=>{
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    insert into auth.users values('${a}'),('${b}');
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`);
  for(const file of ['schema','setup','backup','permissions']) await pg.exec(readFileSync(`supabase/${file}.sql`,'utf8'));
  await pg.exec(readFileSync('supabase/permissions.sql','utf8')); // repeatable
},30000);
afterAll(()=>pg.close());
it('the read-only deployment gate passes and detects permission drift',async()=>{
  const gate=readFileSync('supabase/verify-permissions.sql','utf8');
  await pg.exec(gate);
  await pg.exec('grant truncate on public.ledger_accounts to authenticated');
  await expect(pg.exec(gate)).rejects.toThrow(/Permission mismatch/);
  await pg.exec('revoke truncate on public.ledger_accounts from authenticated');
  await pg.exec(gate);
});
it('API table permissions match the allowlist, including TRUNCATE and TRIGGER',async()=>{
  for(const role of ['anon','authenticated','service_role']) for(const table of ['ledger_accounts','ledger_records','ledger_history','ledger_setup']) for(const perm of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
    const allowed = role==='authenticated' && table!=='ledger_setup' && perm==='SELECT' || role==='service_role' && (table==='ledger_accounts' && ['SELECT','INSERT'].includes(perm) || table==='ledger_setup' && ['SELECT','UPDATE'].includes(perm));
    const r=await pg.query<{ok:boolean}>(`select has_table_privilege($1,$2,$3) ok`,[role,'public.'+table,perm]);
    expect(r.rows[0].ok,`${role} ${table} ${perm}`).toBe(allowed);
  }
});
it('anonymous and service roles cannot call ledger RPCs; setup remains server-only',async()=>{
  const r=await pg.query<{role:string;name:string;ok:boolean}>(`select r.role,p.proname name,has_function_privilege(r.role,p.oid,'EXECUTE') ok from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join (values('anon'),('authenticated'),('service_role')) r(role) where n.nspname in ('public','ledger_private')`);
  for(const x of r.rows) {
    const setup=['claim_ledger_setup','finish_ledger_setup'].includes(x.name);
    expect(x.ok,`${x.role} ${x.name}`).toBe(setup ? x.role==='service_role' : x.name==='stock' ? false : x.role==='authenticated');
  }
});
it('service setup claim, finish and failure unlock still work',async()=>{
  await pg.exec(`insert into public.ledger_setup(id,token_hash) values(1,'qa');set role service_role;`);
  expect((await pg.query<{ok:boolean}>(`select public.claim_ledger_setup('qa') ok`)).rows[0].ok).toBe(true);
  await pg.exec(`update public.ledger_setup set lock_until=null where id=1 and token_hash='qa';`);
  expect((await pg.query<{ok:boolean}>(`select public.finish_ledger_setup('qa','${a}') ok`)).rows[0].ok).toBe(true);
  await pg.exec(`reset role; insert into public.ledger_accounts values('${b}');`);
});
it('authenticated RPC saves, reads, retries and rejects stale versions',async()=>{
  await pg.exec(`select set_config('request.jwt.claim.sub','${a}',false); set role authenticated;`);
  const op=crypto.randomUUID();
  const submit=()=>pg.query<{r:any}>(`select public.submit_ledger_operation($1,$2,'product',0,$3) r`,[op,p,JSON.stringify(data)]);
  expect((await submit()).rows[0].r.ok).toBe(true);
  expect((await submit()).rows[0].r.ok).toBe(true);
  expect((await pg.query('select * from public.ledger_history')).rows).toHaveLength(1);
  expect((await pg.query('select * from public.ledger_records')).rows).toHaveLength(1);
  const stale=await pg.query<{r:any}>(`select public.submit_ledger_operation($1,$2,'product',0,$3) r`,[crypto.randomUUID(),p,JSON.stringify(data)]);
  expect(stale.rows[0].r.conflict).toBe(true);
  for(const sql of ['truncate public.ledger_accounts cascade','delete from public.ledger_accounts','update public.ledger_records set version=2']) await expect(pg.exec(sql)).rejects.toThrow(/permission denied/);
  await pg.exec('reset role');
});
it('RLS and backup protect other owners; an empty owner can restore',async()=>{
  await pg.exec(`select set_config('request.jwt.claim.sub','${a}',false);set role authenticated;`);
  const snapshot=(await pg.query<{r:any}>('select public.export_ledger_backup() r')).rows[0].r;
  await expect(pg.query('select public.restore_ledger_backup($1,$2)',[JSON.stringify(snapshot),a])).rejects.toThrow(/不是空白/);
  await pg.exec(`reset role;select set_config('request.jwt.claim.sub','${b}',false);set role authenticated;`);
  expect((await pg.query('select * from public.ledger_records')).rows).toHaveLength(0);
  expect((await pg.query('select * from public.ledger_history')).rows).toHaveLength(0);
  snapshot.records[0].id=crypto.randomUUID();snapshot.history=[];
  expect((await pg.query<{r:any}>('select public.restore_ledger_backup($1,$2) r',[JSON.stringify(snapshot),b])).rows[0].r.ok).toBe(true);
  expect((await pg.query<{r:any}>('select public.export_ledger_backup() r')).rows[0].r.records[0].data).toEqual(data);
  await pg.exec('reset role');
});
it('future tables, sequences and functions do not auto-grant API access',async()=>{
  for(const schema of ['public','ledger_private']) {
    await pg.exec(`create table ${schema}.qa_future(id serial);create function ${schema}.qa_future_fn() returns integer language sql as $$select 1$$;`);
    for(const role of ['anon','authenticated','service_role']) {
      const r=await pg.query<{t:boolean;s:boolean;f:boolean}>(`select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') t,has_sequence_privilege($1,$3,'USAGE,SELECT,UPDATE') s,has_function_privilege($1,$4,'EXECUTE') f`,[role,`${schema}.qa_future`,`${schema}.qa_future_id_seq`,`${schema}.qa_future_fn()`]);
      expect(r.rows[0]).toEqual({t:false,s:false,f:false});
    }
  }
});
