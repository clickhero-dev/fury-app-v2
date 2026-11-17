/* Fotos para o chat: paginação, filtro e isolamento entre tenants no PostgreSQL. */
import {afterAll,beforeAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import * as schema from '@fury/db';
import {BrandKitPhotoRepository} from '../repository/brand-kit-photo.repository.js';
import {BrandKitPhotoService} from '../services/brand-kit/brand-kit-photo.service.js';
const url=process.env.TEST_CHAT_DATABASE_URL;
describe.skipIf(!url)('biblioteca delegada no PostgreSQL',()=>{
 const client=postgres(url!,{max:3}),db=drizzle(client,{schema}) as any,a=randomUUID(),b=randomUUID();
 const created:string[]=[];
 beforeAll(async()=>{
  for(const tenant of [a,b]) {
   await client`insert into tenants (id,name,slug) values (${tenant},'library',${tenant})`;
   const [kit]=await client`insert into brand_kits (tenant_id) values (${tenant}) returning id`;
   for(let i=0;i<(tenant===a?3:1);i++){const id=randomUUID();if(tenant===a)created.push(id);await client`insert into brand_kit_photos (id,tenant_id,brand_kit_id,kind,url) values (${id},${tenant},${kit.id},${i===2?'equipe':'produto'},${'https://example.invalid/'+id})`;}
  }
 });
 afterAll(async()=>{await client`delete from tenants where id in (${a},${b})`;await client.end();});
 it('limita e filtra sem retornar fotos de outro tenant',async()=>{
  const service=new BrandKitPhotoService((tenant)=>new BrandKitPhotoRepository(tenant,db));
  const first=await service.listChat(a,'produto',1,1);const second=await service.listChat(a,'produto',2,1);
  expect(first).toMatchObject({page:1,hasMore:true,nextPage:2});expect(second).toMatchObject({page:2,hasMore:false,nextPage:null});
  const ids=[...first.items,...second.items].map(item=>item.id);expect(new Set(ids).size).toBe(2);expect(ids.every(id=>created.includes(id))).toBe(true);
  expect((await service.listChat(b,'produto',1,20)).items.every(item=>!created.includes(item.id))).toBe(true);
  expect((await service.listChat(a,'equipe',1,20)).items).toHaveLength(1);
  expect((await service.list(a)).length).toBe(3);
 });
});
