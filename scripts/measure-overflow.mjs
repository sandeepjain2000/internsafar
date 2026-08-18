import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'tmp-screenshots');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto('https://internship-portal-sigma-mauve.vercel.app/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const body = await page.locator('body').innerText();
const m = body.match(/(\d+)\s*\+\s*(\d+)/);
await page.fill('#email', 'candidate@internship.local');
await page.fill('#password', 'Admin@123');
await page.fill('#login-captcha', String(Number(m[1]) + Number(m[2])));
await page.getByRole('button', { name: /^login$/i }).click();
await page.waitForURL(/\/candidate/);
await page.waitForTimeout(2000);

const sizes = [
  [1366, 768],
  [1100, 700],
  [1024, 640],
  [900, 700],
  [768, 900],
  [390, 844],
];
const rows = [];
for (const [w, h] of sizes) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(400);
  const mtr = await page.evaluate(() => {
    const de = document.documentElement;
    const bodyEl = document.body;
    const main = document.querySelector('main');
    const scrollW = Math.max(de.scrollWidth, bodyEl.scrollWidth);
    return {
      clientW: de.clientWidth,
      scrollW,
      overflowX: scrollW - de.clientWidth,
      mainScrollW: main ? main.scrollWidth : null,
      mainClientW: main ? main.clientWidth : null,
    };
  });
  const file = `overflow-${w}x${h}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: false });
  rows.push({ w, h, ...mtr, file });
}
console.log(JSON.stringify(rows, null, 2));
await browser.close();
