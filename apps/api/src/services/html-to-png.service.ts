import puppeteer from 'puppeteer';
import { randomUUID } from 'crypto';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

export async function convertHTMLToPNG(html: string): Promise<Buffer> {
  const tmpPath = join(tmpdir(), `creative-${randomUUID()}.html`);

  await writeFile(tmpPath, html, 'utf-8');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
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
