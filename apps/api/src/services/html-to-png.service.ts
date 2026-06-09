import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const CHROMIUM_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/snap/bin/chromium',
  '/usr/local/bin/chromium',
];

function findChromiumPath(): string {
  // Env var takes priority
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;

  // Try which
  try {
    const found = execSync('which chromium || which chromium-browser || which google-chrome', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .split('\n')[0];
    if (found) return found;
  } catch {}

  // Try known paths
  for (const candidate of CHROMIUM_CANDIDATES) {
    try {
      execSync(`test -f ${candidate}`, { stdio: 'ignore' });
      return candidate;
    } catch {}
  }

  // Let Puppeteer use its bundled browser
  return '';
}

const chromiumPath = findChromiumPath();

export async function convertHTMLToPNG(html: string): Promise<Buffer> {
  console.log('=== PUPPETEER chromium path:', chromiumPath || 'using bundled');

  const tmpPath = join(tmpdir(), `creative-${randomUUID()}.html`);
  await writeFile(tmpPath, html, 'utf-8');

  const browser = await puppeteer.launch({
    ...(chromiumPath ? { executablePath: chromiumPath } : {}),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
    await page.goto(`file://${tmpPath}`, { waitUntil: 'networkidle0', timeout: 30000 });

    const screenshot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1080 } });
    return Buffer.from(screenshot);
  } finally {
    await browser.close();
    await unlink(tmpPath).catch(() => {});
  }
}
