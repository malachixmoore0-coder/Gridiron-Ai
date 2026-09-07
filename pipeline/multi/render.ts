/**
 * Pages that only exist once JavaScript has run.
 *
 * Half the college athletics sites — and every official league site — send an
 * empty shell and fetch the roster from their own API afterwards. A plain
 * request sees the navigation and nothing else, which is exactly what the first
 * pass found: Auburn answered 200 with two links on it.
 *
 * So those pages get opened in a real browser instead. It is slower and heavier
 * than a fetch, which is why it is a fallback rather than the default: try the
 * cheap way, and only reach for this when the cheap way comes back empty.
 *
 * The browser is started once and shared. Where Chromium is not installed the
 * whole thing degrades to "no pages rendered" rather than failing the build —
 * the pipeline still runs locally, it just sees less.
 */
import type { Browser } from 'playwright';

let browser: Browser | null = null;
let tried = false;

async function open(): Promise<Browser | null> {
  if (browser || tried) return browser;
  tried = true;
  try {
    // Required rather than imported: where Chromium or the package is missing
    // this has to degrade to "no pages rendered", not take the build down.
    const { chromium } = require('playwright') as typeof import('playwright');
    browser = await chromium.launch({
      // CHROMIUM_PATH lets a machine that already has a browser use it rather
      // than download a second copy of the same thing.
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  } catch (e) {
    console.warn(`  (render) no browser available: ${e instanceof Error ? e.message : String(e)}`);
    browser = null;
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) { await browser.close().catch(() => {}); browser = null; }
}

export interface RenderOpts {
  /** Keep loading until this many nodes match, or the timeout runs out. */
  settle?: { selector: string; count: number };
  timeoutMs?: number;
  concurrency?: number;
}

/**
 * Open each URL and return the HTML the browser ended up with.
 *
 * A page is considered done when the thing we came for is on it — ten player
 * links, say — rather than when the network goes quiet, because these sites
 * poll and the network never does.
 */
export async function renderPages(urls: string[], opts: RenderOpts = {}): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!urls.length) return out;
  const b = await open();
  if (!b) return out;

  const timeout = opts.timeoutMs ?? 20_000;
  const concurrency = opts.concurrency ?? 3;
  const ctx = await b.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 2400 },
  });
  // Pictures are the point, but their bytes are not: the URL is in the markup
  // either way, and a roster page of forty photographs is megabytes we would
  // download only to throw away.
  await ctx.route('**/*', (route) => {
    const t = route.request().resourceType();
    return t === 'image' || t === 'media' || t === 'font' ? route.abort() : route.continue();
  });

  const one = async (url: string) => {
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      if (opts.settle) {
        const { selector, count } = opts.settle;
        // Written as source rather than a closure: this file is compiled
        // without the DOM's types, because everything else in it runs in node.
        await page.waitForFunction(
          `document.querySelectorAll(${JSON.stringify(selector)}).length >= ${count}`,
          undefined,
          { timeout: Math.min(timeout, 12_000) },
        ).catch(() => {});
      }
      // Lazy lists render on scroll; one sweep to the bottom is enough.
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)').catch(() => {});
      await page.waitForTimeout(900);
      out.set(url, await page.content());
    } catch { /* a page that will not open is a page with no roster on it */ }
    finally { await page.close().catch(() => {}); }
  };

  for (let i = 0; i < urls.length; i += concurrency) {
    await Promise.all(urls.slice(i, i + concurrency).map(one));
  }
  await ctx.close().catch(() => {});
  return out;
}

export interface ImageCandidate {
  src: string;
  alt: string;
  /** The nearest enclosing text, which on a squad card is the player's name. */
  text: string;
  /** The link the picture sits in, whose slug is often the name too. */
  href: string;
}

/**
 * Every picture on a page, with whatever the page says it is.
 *
 * Done inside the browser rather than over the markup, because walking up to
 * the nearest labelled ancestor is a DOM question and a regular expression is a
 * bad way to ask it. The caller decides which of these are people it wanted.
 */
export async function extractImages(urls: string[], opts: RenderOpts = {}): Promise<Map<string, ImageCandidate[]>> {
  const out = new Map<string, ImageCandidate[]>();
  const script = `Array.prototype.slice.call(document.querySelectorAll('img')).map(function (img) {
    var src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
    if (!src) { var ss = img.getAttribute('srcset') || img.getAttribute('data-srcset') || ''; src = ss.split(',')[0].trim().split(' ')[0] || ''; }
    if (!src) { var pic = img.closest('picture'); var s = pic && pic.querySelector('source'); if (s) { src = (s.getAttribute('srcset') || '').split(',')[0].trim().split(' ')[0] || ''; } }
    var text = '';
    var el = img.parentElement;
    for (var i = 0; i < 6 && el; i++) {
      var t = (el.innerText || '').replace(/\\s+/g, ' ').trim();
      if (t.length > 2 && t.length < 140) { text = t; break; }
      el = el.parentElement;
    }
    var a = img.closest('a');
    return { src: src, alt: img.getAttribute('alt') || '', title: img.getAttribute('title') || '', href: a ? (a.getAttribute('href') || '') : '', text: text };
  }).filter(function (c) { return c.src; })`;

  await runOnPages(urls, opts, script, out);
  return out;
}

/** Open each URL and run one script against the live page, into the sink. */
async function runOnPages(
  urls: string[],
  opts: RenderOpts,
  script: string,
  sink: Map<string, ImageCandidate[]>,
): Promise<void> {
  if (!urls.length) return;
  const b = await open();
  if (!b) return;
  const ctx = await b.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 2400 },
  });
  await ctx.route('**/*', (route) => {
    const t = route.request().resourceType();
    return t === 'image' || t === 'media' || t === 'font' ? route.abort() : route.continue();
  });
  const timeout = opts.timeoutMs ?? 20_000;
  const concurrency = opts.concurrency ?? 3;

  const one = async (url: string) => {
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      if (opts.settle) {
        await page.waitForFunction(
          `document.querySelectorAll(${JSON.stringify(opts.settle.selector)}).length >= ${opts.settle.count}`,
          undefined,
          { timeout: Math.min(timeout, 12_000) },
        ).catch(() => {});
      }
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)').catch(() => {});
      await page.waitForTimeout(1200);
      sink.set(url, (await page.evaluate(script)) as ImageCandidate[]);
    } catch { /* a page that will not open has no squad on it */ }
    finally { await page.close().catch(() => {}); }
  };

  for (let i = 0; i < urls.length; i += concurrency) {
    await Promise.all(urls.slice(i, i + concurrency).map(one));
  }
  await ctx.close().catch(() => {});
}
