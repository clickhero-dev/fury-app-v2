import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
vi.mock('@fury/db',() => ({db:{}}));
import {ChatTurnRecoveryRepository} from '../repository/chat-turn-recovery.repository.js';

const url = process.env.CHAT_MEDIA_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('turn recovery PostgreSQL restart reconciliation',() => {
  const schema = `turn_${randomUUID().replaceAll('-','')}`;
  let pg: ReturnType<typeof postgres>,repo: ChatTurnRecoveryRepository;
  const tenant=randomUUID(),user=randomUUID(),conversation=randomUUID();
  async function turn(status='running',expired=true) {
    const mid=randomUUID(),run=randomUUID();
    await pg`INSERT INTO chat_turn_recovery(user_message_id,conversation_id,tenant_id,user_id) VALUES(${mid},${conversation},${tenant},${user})`;
    await pg`INSERT INTO chat_response_runs(id,conversation_id,user_message_id,status,lease_until) VALUES(${run},${conversation},${mid},${status},${new Date(Date.now()+(expired ? -1000 : 45000)).toISOString()}::timestamptz)`;
    return {mid,run};
  }
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname!=='127.0.0.1' || !parsed.pathname.endsWith('_isolated')) throw Error('isolated DB required');
    pg=postgres(url!,{connection:{search_path:schema},onnotice:()=>{}});
    await pg.unsafe(`CREATE SCHEMA ${schema};
      CREATE TABLE chat_conversations(id uuid PRIMARY KEY,tenant_id uuid,user_id uuid);
      CREATE TABLE chat_response_runs(id uuid PRIMARY KEY,conversation_id uuid,user_message_id uuid,status text,lease_until timestamptz,created_at timestamptz DEFAULT clock_timestamp());`);
    await pg.unsafe(await readFile(new URL('../../../../packages/db/migrations/0081_chat_turn_recovery.sql',import.meta.url),'utf8'));
    await pg`INSERT INTO chat_conversations VALUES(${conversation},${tenant},${user})`;
    repo=new ChatTurnRecoveryRepository(drizzle(pg) as never);
  });
  afterAll(async () => {if(pg){await pg.unsafe(`DROP SCHEMA ${schema} CASCADE`);await pg.end();}});
  it('finds lease lost during restart without an enqueue and only returns stable IDs',async () => {
    const {mid,run}=await turn();
    const rows=await repo.list();
    expect(rows.find(r=>r.userMessageId===mid)).toEqual({tenantId:tenant,userId:user,conversationId:conversation,runId:run,userMessageId:mid});
    const restarted=new ChatTurnRecoveryRepository(drizzle(pg) as never);
    expect((await restarted.list()).some(r=>r.userMessageId===mid)).toBe(true);
    const live=await turn('running',false);
    expect((await repo.list()).some(r=>r.userMessageId===live.mid)).toBe(false);
  });
  it('reconciles completion gap, deadline, max attempts, cancellation and revoked access',async () => {
    const completed=await turn('completed');
    const stoppedComplete=await turn('completed'),exhaustedComplete=await turn('completed');
    await pg`UPDATE chat_turn_recovery SET status='stopped' WHERE user_message_id=${stoppedComplete.mid}`;
    await pg`UPDATE chat_turn_recovery SET status='exhausted' WHERE user_message_id=${exhaustedComplete.mid}`;
    const deadline=await turn(),limit=await turn(),cancelled=await turn();
    await pg`UPDATE chat_turn_recovery SET deadline_at=clock_timestamp()-interval '1 second' WHERE user_message_id=${deadline.mid}`;
    await pg`UPDATE chat_turn_recovery SET attempts=max_attempts WHERE user_message_id=${limit.mid}`;
    await pg`UPDATE chat_turn_recovery SET status='cancelled' WHERE user_message_id=${cancelled.mid}`;
    await repo.list();
    const rows=await pg`SELECT user_message_id,status FROM chat_turn_recovery`;
    const status=(mid:string)=>rows.find(r=>r.user_message_id===mid)?.status;
    expect(status(completed.mid)).toBe('completed');
    expect(status(stoppedComplete.mid)).toBe('completed');
    expect(status(exhaustedComplete.mid)).toBe('completed');
    expect(status(deadline.mid)).toBe('exhausted');
    expect(status(limit.mid)).toBe('exhausted');
    expect(status(cancelled.mid)).toBe('cancelled');
    const revoked=await turn();
    const item=(await repo.list()).find(r=>r.userMessageId===revoked.mid)!;
    await repo.stop(item);
    expect((await repo.list()).some(r=>r.userMessageId===revoked.mid)).toBe(false);
  });
  it('cannot resurrect a direction stopped while its stale reconciliation statement waits on PostgreSQL',async () => {
    const old=await turn();
    let reconciling: Promise<unknown> | undefined;
    try { await pg.begin(async tx => {
      const owner=await tx`SELECT pg_backend_pid() AS pid`;
      // Same serialization point and write order as a new human message.
      await tx`SELECT id FROM chat_conversations WHERE id=${conversation} FOR UPDATE`;
      await tx`UPDATE chat_turn_recovery SET status='stopped' WHERE user_message_id=${old.mid}`;
      await tx`INSERT INTO chat_response_runs(id,conversation_id,user_message_id,status,lease_until)
        VALUES(${randomUUID()},${conversation},${randomUUID()},'running',clock_timestamp()+interval '45 seconds')`;
      // The other connection sees the pre-transaction running/expired version,
      // then blocks trying to update the row we changed to stopped.
      reconciling=repo.list();
      await vi.waitFor(async () => {
        const blocked=await pg`SELECT count(*)::integer AS count FROM pg_stat_activity
          WHERE pid<>pg_backend_pid() AND wait_event_type='Lock'
            AND cardinality(pg_blocking_pids(pid))>0
            AND ${owner[0].pid}=ANY(pg_blocking_pids(pid))
            AND query LIKE '%WITH candidates AS%'`;
        expect(blocked[0].count).toBeGreaterThan(0);
      },{timeout:2000,interval:10});
    }); } finally { await reconciling; }
    const rows=await pg`SELECT status FROM chat_turn_recovery WHERE user_message_id=${old.mid}`;
    expect(rows[0].status).toBe('stopped');
    expect((await repo.list()).some(r=>r.userMessageId===old.mid)).toBe(false);
  });
});
