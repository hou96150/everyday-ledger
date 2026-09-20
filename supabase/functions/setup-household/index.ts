import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,apikey,authorization,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return respond({error:'Method not allowed'},405);
 let admin:ReturnType<typeof createClient>|undefined,createdId:string|undefined,hash:string|undefined,claimed=false;
 try{
  const raw=await req.text();if(raw.length>4096)return respond({error:'輸入資料過長'},400);
  const {token,username,password}=JSON.parse(raw);
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||typeof username!=='string'||!/^[a-zA-Z0-9_]{3,32}$/.test(username)||typeof password!=='string'||password.length<12||password.length>128)return respond({error:'請填寫有效設定碼、3–32 位英文數字帳號與至少 12 位密碼'},400);
  hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const keys=Deno.env.get('SUPABASE_SECRET_KEYS');
  const key=(keys?JSON.parse(keys).default:undefined)||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!key)throw Error('Missing server credentials');
  admin=createClient(Deno.env.get('SUPABASE_URL')!,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const claim=await admin.rpc('claim_ledger_setup',{p_hash:hash});
  if(claim.error)throw claim.error;
  if(!claim.data)return respond({error:'設定碼無效、正在處理，或帳號已設定完成。已完成請直接登入。'},409);
  claimed=true;
  const result=await admin.auth.admin.createUser({email:username.toLowerCase()+'@household-ledger.invalid',password,email_confirm:true});
  if(result.error)throw result.error;
  createdId=result.data.user.id;
  const finish=await admin.rpc('finish_ledger_setup',{p_hash:hash,p_user:createdId});
  if(finish.error)throw finish.error;
  return respond({ok:true});
 }catch{
  if(admin&&claimed){if(createdId)await admin.auth.admin.deleteUser(createdId);await admin.from('ledger_setup').update({lock_until:null}).eq('id',1).eq('token_hash',hash!);}
  return respond({error:'設定未完成，請稍後再試；若帳號已建立，請直接登入。'},400);
 }
});
