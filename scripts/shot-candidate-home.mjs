import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.IP_BASE || 'https://internship-portal-sigma-mauve.vercel.app';
const OUT = path.join(__dirname, '..', 'tmp-screenshots');
fs.mkdirSync(OUT, { recursive: true });

async function solveCaptcha(page) {
  const bodyText = await page.locator('body').innerText();
  const m = String(bodyText || '').match(/(\d+)\s*\+\s*(\d+)/);
  if (m) return String(Number(m[1]) + Number(m[2]));
  throw new Error('Could not parse captcha from page text');
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.setDefaultTimeout(45000);

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

await page.locator('input[type="email"]').first().fill('candidate@internship.local');
await page.locator('input[type="password"]').first().fill('Admin@123');

const answer = await solveCaptcha(page);
await page.getByPlaceholder(/answer/i).fill(answer);

await page.getByRole('button', { name: /^login$/i }).click();
await page.waitForURL(/\/candidate/, { timeout: 45000 });
await page.waitForTimeout(2500);

const url = page.url();
const shot1 = path.join(OUT, 'candidate-home-1366x768.png');
await page.screenshot({ path: shot1, fullPage: true });

await page.setViewportSize({ width: 1100, height: 700 });
await page.waitForTimeout(600);
const shot2 = path.join(OUT, 'candidate-home-1100x700.png');
await page.screenshot({ path: shot2, fullPage: true });

await page.setViewportSize({ width: 820, height: 900 });
await page.waitForTimeout(600);
const shot3 = path.join(OUT, 'candidate-home-820x900-ipad-air.png');
await page.screenshot({ path: shot3, fullPage: true });

console.log(JSON.stringify({ url, shots: [shot1, shot2, shot3] }, null, 2));
await browser.close();
