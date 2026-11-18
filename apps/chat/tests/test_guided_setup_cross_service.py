"""Real Python HTTP -> Node -> isolated PostgreSQL for guided setup side effects."""
import asyncio, base64, hashlib, hmac, json, os, signal, subprocess, time
from pathlib import Path
from uuid import uuid4
import asyncpg, httpx, pytest
from approval_actions import ApprovalActions

URL=os.getenv('CHAT_MEDIA_TEST_DATABASE_URL')
pytestmark=pytest.mark.skipif(not URL,reason='CHAT_MEDIA_TEST_DATABASE_URL isolado ausente')
ROOT=Path(__file__).resolve().parents[3]; SECRET='cross-service-guided-setup-secret-at-least-32'
def token(t,u):
 def enc(v): return base64.urlsafe_b64encode(json.dumps(v).encode()).rstrip(b'=')
 raw=enc({'alg':'HS256','typ':'JWT'})+b'.'+enc({'tenantId':str(t),'userId':str(u),'email':'x@y.z','role':'admin','actor':'chatbot','iss':'ady-api','aud':['ady-api'],'iat':int(time.time()),'exp':int(time.time())+300})
 return (raw+b'.'+base64.urlsafe_b64encode(hmac.new(SECRET.encode(),raw,hashlib.sha256).digest()).rstrip(b'=')).decode()
def test_logo_attachment_and_context_cross_service():
 async def go():
  db=await asyncpg.connect(URL); schema='chat_media_'+uuid4().hex
  await db.execute(f"""CREATE SCHEMA {schema}; SET search_path TO {schema}; CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE TABLE tenants(id uuid primary key,name text,business_context text); CREATE TABLE users(id uuid primary key,tenant_id uuid); CREATE TABLE brand_kits(id uuid primary key default gen_random_uuid(),tenant_id uuid unique,logo_url text,primary_color text,secondary_color text); CREATE TYPE photo_kind AS ENUM ('empresa','equipe','produto'); CREATE TABLE brand_kit_photos(id uuid primary key default gen_random_uuid(),tenant_id uuid,brand_kit_id uuid,kind photo_kind,url text); CREATE TABLE chat_attachments(id uuid primary key,tenant_id uuid,user_id uuid,conversation_id uuid);""")
  t,u,c,a=uuid4(),uuid4(),uuid4(),uuid4()
  await db.execute('INSERT INTO tenants VALUES($1,$2,$3)',t,'Antes',None)
  await db.execute('INSERT INTO users VALUES($1,$2)',u,t)
  await db.execute('INSERT INTO chat_attachments VALUES($1,$2,$3,$4)',a,t,u,c)
  env={'PATH':os.environ['PATH'],'NODE_ENV':'test','CHAT_MEDIA_TEST_DATABASE_URL':URL,'CHAT_CROSS_SERVICE_SCHEMA':schema,'CHAT_DELEGATION_SECRET':SECRET}
  p=subprocess.Popen([str(ROOT/'node_modules/.bin/tsx'),'apps/api/src/__tests__/guided-setup-cross-service-server.ts'],cwd=ROOT,env=env,stdout=subprocess.PIPE,text=True,start_new_session=True)
  base='http://127.0.0.1:'+str(json.loads(await asyncio.to_thread(p.stdout.readline))['port']); auth='Bearer '+token(t,u)
  try:
   async with httpx.AsyncClient() as h:
    class A(ApprovalActions):
     async def persist(self,*_): pass
    await A(None,h,base,{'tenantId':t,'userId':u}).dispatch({'id':str(uuid4()),'method':'POST','path':'/api/studio/ai/generate-image','body':{'save_as_logo':True}},auth)
    assert await db.fetchrow('SELECT logo_url,primary_color,secondary_color FROM brand_kits WHERE tenant_id=$1',t)==('https://fixture.invalid/generated-logo.png','#D1141D','#123CB5')
    assert (await h.post(f'{base}/api/chat/conversations/{c}/attachments/{a}/promote',headers={'Authorization':auth},json={'target':'library','kind':'empresa'})).status_code==201
    await h.post(base+'/api/auth/me/chat-guided-update',headers={'Authorization':auth},json={'tenantName':'Loja Ana','businessContext':'Produtos ou serviços: Flores'})
    assert await db.fetchrow('SELECT name,business_context FROM tenants WHERE id=$1',t)==('Loja Ana','Produtos ou serviços: Flores')
  finally:
   os.killpg(p.pid,signal.SIGTERM); p.wait(); await db.execute(f'DROP SCHEMA {schema} CASCADE'); await db.close()
 asyncio.run(go())
