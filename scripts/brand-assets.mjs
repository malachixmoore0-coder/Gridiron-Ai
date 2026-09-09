/**
 * Every brand asset, from one definition of the mark.
 *
 *   node scripts/brand-assets.mjs
 *
 * The icon, the favicon, the Android adaptive foreground, the splash and the
 * Open Graph card are all the same geometry rendered at the size each one
 * needs, so they cannot drift apart the way a folder of hand-exported PNGs
 * does. Change the path data here and re-run; nothing else has to be touched.
 *
 * Rendered with the Chromium that ships in this container rather than a raster
 * pipeline, because the mark is vector and the whole point is that it stays
 * crisp at sixteen pixels.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GREEN = '#12D992';
const BG = '#05080C';
const INK = '#EEF4F8';

/**
 * The toad, reduced to what survives being small: eyes on top of the head
 * rather than in it, and a wide level mouth. The mouth is deliberately almost
 * straight — curving it turns the whole thing into a cartoon frog, which is the
 * wrong promise for a product that sells error bars.
 */
const HEAD = `
  <defs><clipPath id="c">
    <circle cx="30" cy="41" r="19"/><circle cx="70" cy="41" r="19"/><ellipse cx="50" cy="60" rx="41" ry="27"/>
  </clipPath></defs>
  <g fill="${GREEN}"><circle cx="30" cy="41" r="19"/><circle cx="70" cy="41" r="19"/><ellipse cx="50" cy="60" rx="41" ry="27"/></g>
  <g fill="${BG}"><circle cx="30" cy="39" r="7.5"/><circle cx="70" cy="39" r="7.5"/></g>
  <path d="M15 67 Q50 71.5 85 67" fill="none" stroke="${BG}" stroke-width="5.5" stroke-linecap="round" clip-path="url(#c)"/>`;

const svg = (scale, ground, rx) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
     ${ground ? `<rect width="100" height="100" rx="${rx}" fill="${ground}"/>` : ''}
     <g transform="translate(50 52) scale(${scale}) translate(-50 -50)">${HEAD}</g>
   </svg>`;

const JOBS = [
  { out: 'assets/icon.png',            size: 1024, svg: svg(0.80, BG, 22) },
  // Android masks the foreground to a circle with a 66% safe zone, so the mark
  // shrinks and the ground runs edge to edge with no radius of its own.
  { out: 'assets/adaptive-icon.png',   size: 1024, svg: svg(0.56, BG, 0) },
  { out: 'assets/logo-mark.png',       size: 512,  svg: svg(0.92, null, 0) },
  { out: 'public/favicon.png',         size: 64,   svg: svg(0.86, BG, 14) },
  { out: 'public/icon-192.png',        size: 192,  svg: svg(0.80, BG, 22) },
  { out: 'public/icon-512.png',        size: 512,  svg: svg(0.80, BG, 22) },
  { out: 'public/apple-touch-icon.png', size: 180, svg: svg(0.80, BG, 0) },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });

for (const j of JOBS) {
  const page = await browser.newPage({ viewport: { width: j.size, height: j.size } });
  await page.setContent(`<body style="margin:0;background:transparent"><div style="width:${j.size}px;height:${j.size}px">${j.svg}</div></body>`);
  await page.screenshot({ path: path.join(ROOT, j.out), omitBackground: true });
  await page.close();
  console.log('  ', j.out, `${j.size}px`);
}

const FONT = 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
const wordmark = (px) => `<div style="font-size:${px}px;font-weight:900;letter-spacing:${px * 0.06}px;color:${INK};line-height:1">SIM<span style="color:${GREEN}">TOAD</span></div>`;

{
  const page = await browser.newPage({ viewport: { width: 1284, height: 2778 } });
  await page.setContent(`<body style="margin:0;background:${BG};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:70px;font-family:${FONT}">
    <div style="width:420px;height:420px">${svg(0.92, null, 0)}</div>${wordmark(96)}</body>`);
  await page.screenshot({ path: path.join(ROOT, 'assets/splash.png') });
  await page.close();
  console.log('   assets/splash.png');
}

{
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(`<body style="margin:0;background:${BG};display:flex;align-items:center;gap:64px;padding:0 88px;height:630px;box-sizing:border-box;font-family:${FONT}">
    <div style="width:300px;height:300px;flex:none">${svg(0.92, null, 0)}</div>
    <div>${wordmark(88)}
      <div style="margin-top:26px;font-size:34px;color:#8FA3B4;line-height:1.35;max-width:620px">Eighteen leagues, one model.<br/>Ten thousand runs a game — locked before it starts, graded in the open.</div>
    </div></body>`);
  await page.screenshot({ path: path.join(ROOT, 'public/og.png') });
  await page.close();
  console.log('   public/og.png');
}

await browser.close();
console.log(`\n${JOBS.length + 2} assets written.`);
