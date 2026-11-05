#!/usr/bin/env tsx
/**
 * validate-swagger.ts
 * Verifica se o swagger.json está atualizado em relação ao routes-metadata.ts.
 * Usado pelo pre-push git hook para bloquear push se a doc estiver desatualizada.
 *
 * Estratégia: gera swagger.json em /tmp e compara com o versionado.
 * Se houver diff, bloqueia e mostra instruções.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

// ── Helpers ─────────────────────────────────────────────────────────
function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string) { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s: string) { return `\x1b[33m${s}\x1b[0m`; }
function bold(s: string) { return `\x1b[1m${s}\x1b[0m`; }

// ── Resolve paths ────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
const API_DIR = resolve(__dirname, '..');

// ── Main ────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs({
    args: process.argv.slice(2),
    options: {
      fix: { type: 'boolean', short: 'f', default: false },
    },
  });

  const isFix = args.values.fix;

  if (!existsSync(join(API_DIR, 'scripts', 'routes-metadata.ts'))) {
    console.log(yellow('⚠️  routes-metadata.ts not found — skipping swagger validation'));
    process.exit(0);
  }

  const versioned = join(API_DIR, 'swagger.json');
  if (!existsSync(versioned)) {
    console.log(yellow('⚠️  swagger.json not found — generating initial version...'));
    runGenerate();
    console.log(green('✅ swagger.json created'));
    process.exit(0);
  }

  // Generate to temp
  const tmpDir = '/tmp/fury-swagger-validate';
  mkdirSync(tmpDir, { recursive: true });

  // Copy metadata to temp so generator doesn't need to resolve relative paths
  const tmpMeta = join(tmpDir, 'routes-metadata.ts');
  const srcMeta = join(API_DIR, 'scripts', 'routes-metadata.ts');
  writeFileSync(tmpMeta, readFileSync(srcMeta));

  // Run generator in temp context
  console.log('🔍 Generating swagger to compare...');
  const genScript = join(API_DIR, 'scripts', 'generate-swagger.ts');
  const tmpOut = join(tmpDir, 'swagger.json');

  try {
    execSync(`npx tsx ${genScript}`, {
      cwd: tmpDir,
      stdio: 'pipe',
      env: { ...process.env, SWAGGER_OUT: tmpOut },
      timeout: 30_000,
    });
  } catch {
    // Generator may output to wrong dir; try to find it
  }

  // Also check if generator wrote to API_DIR
  const generatedPath = join(API_DIR, 'swagger.json');
  const generated = existsSync(tmpOut) ? tmpOut : existsSync(generatedPath) ? generatedPath : null;

  if (!generated || !existsSync(generated)) {
    console.log(red('❌ Generator failed to produce swagger.json'));
    console.log('   Run:  npm run swagger:generate');
    process.exit(1);
  }

  // Compare
  try {
    execSync(`diff -u ${versioned} ${generated}`, { stdio: 'pipe' });
    console.log(green(`✅ swagger.json is up-to-date (${Object.keys(JSON.parse(readFileSync(versioned, 'utf-8')).paths).length} paths)`));
    process.exit(0);
  } catch (diffError: any) {
    const diff = diffError.stdout?.toString() || diffError.message;

    if (isFix) {
      // Auto-fix: copy generated over versioned
      writeFileSync(versioned, readFileSync(generated));
      console.log(green('✅ swagger.json auto-updated'));
      process.exit(0);
    }

    console.log(red('\n❌ swagger.json is OUT OF DATE!\n'));
    console.log(bold('   The API routes changed but swagger.json was not regenerated.\n'));
    console.log('   Changes detected:');
    console.log('   ' + diff?.split('\n').slice(0, 40).join('\n   '));
    console.log('');
    console.log(bold('   To fix:'));
    console.log('     npm run swagger:generate');
    console.log('     git add apps/api/swagger.json');
    console.log('');
    console.log('   Or run with --fix:');
    console.log('     npx tsx apps/api/scripts/validate-swagger.ts --fix');
    console.log('');
    process.exit(1);
  }
}

function runGenerate(): void {
  const genScript = join(API_DIR, 'scripts', 'generate-swagger.ts');
  execSync(`npx tsx ${genScript}`, {
    cwd: API_DIR,
    stdio: 'inherit',
    timeout: 30_000,
  });
}

main().catch((err) => {
  console.error(red('❌ Validation failed:'), err);
  process.exit(1);
});
