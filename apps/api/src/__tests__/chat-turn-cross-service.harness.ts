/** Invoked only by test_turn_cross_service.py. No JWT/prompt/error diagnostics on stdout. */
import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import {ChatTurnRecoveryRepository} from '../repository/chat-turn-recovery.repository.js';
import {ChatPlanRepository} from '../repository/chat-plan.repository.js';
import {ChatPlanAccess} from '../services/chat/chat-plan-runtime.js';
import {ChatTurnRecoveryRuntime} from '../services/chat/chat-turn-recovery-runtime.js';
import {isolatedCrossServiceConfig} from './chat-turn-cross-service.contract.js';

async function main() {
  const config=isolatedCrossServiceConfig(process.env);
  const pg=postgres(config.databaseUrl,{max:4,connection:{search_path:config.schema},onnotice:()=>{}});
  try {
    const database=drizzle(pg) as never;
    const store=new ChatTurnRecoveryRepository(database);
    // Identity and tenant ownership use real SQL. RBAC is the sole authorization
    // test port; synthetic admin skips subscriptions, tested independently.
    const access=new ChatPlanAccess((t,u)=>new ChatPlanRepository(t,u,database),{
      checkServices:async ()=>'allowed',getPlatformRole:async ()=>'admin',
    });
    const candidates=(await store.list()).length;
    let authorized=0;
    const runtime=new ChatTurnRecoveryRuntime(store,{authorize:async item=>{
      const user=await access.authorizeRecovery(item);
      authorized++;
      return user;
    }},{baseUrl:config.baseUrl,secret:config.secret});
    await runtime.tick(); // Real fetch -> real HTTP listener -> FastAPI -> same PG schema.
    const rows=await pg`SELECT count(*)::integer AS completed,
      COALESCE(sum(attempts),0)::integer AS attempts FROM chat_turn_recovery WHERE status='completed'`;
    const messages=await pg`SELECT count(*)::integer AS responses FROM chat_messages WHERE role='assistant'`;
    process.stdout.write(JSON.stringify({candidates,authorized,completed:rows[0].completed,
      attempts:rows[0].attempts,responses:messages[0].responses})+'\n');
  } finally {await pg.end();}
}
main().catch(()=>{
  // Fail without serializing connection URLs, identities, delegations or prompts.
  process.stdout.write('{"error":"cross_service_fixture_failed"}\n');
  process.exitCode=1;
});
