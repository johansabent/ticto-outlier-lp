// Quick visual audit: screenshot the live prod page at 3 widths + dump
// computed styles on the <main> element to diagnose layout issues.
// Uses Playwright's bundled Chromium (no channel binary needed).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const URL = process.env.AUDIT_URL ?? 'https://ticto-outlier-lp.vercel.app/';
const OUT = resolve('visual-audit-out');
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-375', width: 375, height: 812 },
];

const browser = await chromium.launch({ headless: true });
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${OUT}/${vp.name}.png`, fullPage: true });

    const report = await page.evaluate(() => {
      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return { selector: sel, exists: false };
        const cs = getComputedStyle(el);
        return {
          selector: sel,
          exists: true,
          tag: el.tagName,
          className: el.className,
          width: el.getBoundingClientRect().width,
          maxWidth: cs.maxWidth,
          display: cs.display,
          flexDirection: cs.flexDirection,
          gridTemplateColumns: cs.gridTemplateColumns,
        };
      };
      return {
        htmlWidth: document.documentElement.getBoundingClientRect().width,
        bodyWidth: document.body.getBoundingClientRect().width,
        viewportWidth: window.innerWidth,
        elements: [
          pick('main'),
          pick('main > section:nth-of-type(1)'),
          pick('main > section:nth-of-type(2)'),
          pick('#cadastro'),
          pick('#cadastro > div'),
          pick('footer'),
        ],
      };
    });
    console.log(`\n=== ${vp.name} (${vp.width}×${vp.height}) ===`);
    console.log(JSON.stringify(report, null, 2));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`\nScreenshots saved to ${OUT}/`);
