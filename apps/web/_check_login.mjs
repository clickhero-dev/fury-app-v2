import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

// Navigate to login
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });

// Screenshot without dark mode (light)
await page.screenshot({ path: '/tmp/login-light.png', fullPage: true });
console.log('Light screenshot saved');

// Apply dark mode
await page.evaluate(() => document.documentElement.classList.add('dark'));

// Trigger repaint
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/login-dark.png', fullPage: true });
console.log('Dark screenshot saved');

// Inspect computed styles on key elements
const issues = await page.evaluate(() => {
  const results = [];
  const body = document.querySelector('.min-h-screen');
  if (!body) return ['No .min-h-screen found'];
  
  const bg = getComputedStyle(body).backgroundColor;
  results.push(`Body bg: ${bg}`);
  
  const card = body.querySelector('.rounded-2xl');
  if (card) {
    const cardBg = getComputedStyle(card).backgroundColor;
    const cardBorder = getComputedStyle(card).borderColor;
    results.push(`Card bg: ${cardBg}, border: ${cardBorder}`);
  }
  
  const demo = body.querySelector('.rounded-xl.bg-gray-50') || body.querySelector('[class*="rounded-xl"]');
  if (demo) {
    const demoBg = getComputedStyle(demo).backgroundColor;
    results.push(`Demo section bg: ${demoBg}`);
  }
  
  const title = body.querySelector('h1');
  if (title) {
    const titleColor = getComputedStyle(title).color;
    results.push(`Title color: ${titleColor}`);
  }
  
  return results;
});

console.log('\n=== Computed styles (dark mode) ===');
issues.forEach(i => console.log(i));

await browser.close();
