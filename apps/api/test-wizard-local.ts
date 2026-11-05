/**
 * Script standalone para testar createCampaignFromWizard localmente
 * contra o banco Neon de produção.
 * 
 * Uso: npx tsx test-wizard-local.ts
 */
import 'dotenv/config';
import { createCampaignFromWizard } from './src/services/campaigns/campaigns.service.js';

// DEBUG: check env
console.log("DEBUG DATABASE_URL length:", process.env.DATABASE_URL?.length);
// Print character by character to detect hidden chars
const url = process.env.DATABASE_URL || '';
for (let i = 0; i < Math.min(url.length, 80); i++) {
  process.stdout.write(url.charCodeAt(i).toString(16) + ' ');
}
console.log("");
console.log("DEBUG TOKEN_ENCRYPTION_KEY exists:", !!process.env.TOKEN_ENCRYPTION_KEY);
console.log("");

const args = {
  tenantId: "93c8e8e9-7c8d-4e17-a5be-ee48b916bb41",
  objective: "visits" as const,
  creativeUploadUrl: "https://placehold.co/600x600?text=Test",
  headline: "Teste Local",
  primaryText: "Testando wizard localmente",
  destinationUrl: "https://example.com",
  locationCity: "Sao Paulo",
  locationRadiusKm: 10,
  ageMin: 18,
  ageMax: 65,
  gender: "all" as const,
  dailyBudgetBrl: 10,
  durationDays: 1,
};

async function main() {
  console.log("=== INICIANDO TESTE DO WIZARD ===");
  console.log("Tenant:", args.tenantId);
  console.log("Objetivo:", args.objective);
  console.log("Cidade:", args.locationCity);
  console.log("");

  try {
    const result = await createCampaignFromWizard(args);
    console.log("✅ SUCESSO!");
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error("❌ ERRO CAPTURADO:");
    console.error("  name:", err.name);
    console.error("  message:", err.message);
    console.error("  code:", err.code);
    console.error("  statusCode:", err.statusCode);
    console.error("  metaCode:", err.metaCode);
    console.error("  metaSubcode:", err.metaSubcode);
    console.error("  metaType:", err.metaType);
    console.error("  httpStatus:", err.httpStatus);
    console.error("  metaUserMsg:", err.metaUserMsg);
    console.error("  metaUserTitle:", err.metaUserTitle);
    console.error("  metaBlameField:", err.metaBlameField);
    console.error("  details:", JSON.stringify(err.details));
    
    if (err.stack) {
      const lines = err.stack.split('\n');
      console.error("\n  STACK (primeiras 15 linhas):");
      lines.slice(0, 15).forEach((l: string, i: number) => console.error(`    ${i + 1}: ${l.trim()}`));
    }
    
    // Tentar extrair mais info
    console.error("\n  TODAS AS PROPS:");
    Object.keys(err).forEach(k => {
      try {
        console.error(`    ${k}: ${JSON.stringify(err[k])}`.substring(0, 200));
      } catch { console.error(`    ${k}: [unserializable]`); }
    });
  }
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
