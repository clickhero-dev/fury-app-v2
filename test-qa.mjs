import 'dotenv/config';
import { db, campaigns } from './packages/db/src/index.js';

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0,
        v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function main() {
  try {
    const tenantId = '62de3af5-0b78-402a-a96b-113ccc9dad0c';
    console.log(`✅ Using tenant: ${tenantId}`);

    const testCampaigns = [
      { name: 'Premium Campaign A', score: 95, ctr: 0.045, roas: 4.5, budget: 200, metaId: '123001' },
      { name: 'Good Campaign B', score: 70, ctr: 0.028, roas: 2.8, budget: 150, metaId: '123002' },
      { name: 'Fair Campaign C', score: 50, ctr: 0.015, roas: 1.8, budget: 120, metaId: '123003' },
      { name: 'Poor Campaign D', score: 25, ctr: 0.008, roas: 1.2, budget: 80, metaId: '123004' },
    ];

    for (const camp of testCampaigns) {
      const id = uuidv4();

      await db.insert(campaigns).values({
        id,
        tenantId,
        name: camp.name,
        metaCampaignId: camp.metaId,
        budget: { daily: camp.budget },
        status: 'active',
        metrics: { score: camp.score, ctr: camp.ctr, roas: camp.roas },
      });
    }

    console.log(`✅ Inserted ${testCampaigns.length} test campaigns`);

    const fs = await import('fs');
    fs.writeFileSync('/tmp/qa_tenant_id.txt', tenantId);
    console.log('✅ Ready for QA tests');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
