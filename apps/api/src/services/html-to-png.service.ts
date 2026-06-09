import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import fs from 'fs';
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
  '/usr/local/bin/chromium-browser',
];

function findChromiumPath(): string {
  // Env var takes priority
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;

  // Verify file actually exists (not just what which reports)
  for (const candidate of CHROMIUM_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      console.log('=== PUPPETEER found chromium at:', candidate);
      return candidate;
    }
  }

  // Try find as a last resort to discover the real path
  try {
    const found = execSync('find /usr -name "chromium*" -type f 2>/dev/null | head -3', {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    if (found) {
      const firstPath = found.split('\n')[0];
      console.log('=== PUPPETEER found via find:', firstPath);
      return firstPath;
    }
  } catch {}

  console.log('=== PUPPETEER using bundled chromium');
  return '';
}

const chromiumPath = findChromiumPath();

export async function convertHTMLToPNG(html: string): Promise<Buffer> {
  const tmpPath = join(tmpdir(), `creative-${randomUUID()}.html`);
  await writeFile(tmpPath, html, 'utf-8');

  const browser = await puppeteer.launch({
    ...(chromiumPath ? { executablePath: chromiumPath } : {}),
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
    ],
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
