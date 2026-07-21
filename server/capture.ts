import { chromium, type Browser, type Page } from 'playwright';
import type { CaptureOptions, WaitUntilOption } from './types.js';

export interface ViewportSize {
  width: number;
  height: number;
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    // /dev/shm is capped (often 64MB) in Docker containers by default, which
    // makes Chromium crash or stall on startup under memory pressure — hits
    // hardest on resource-constrained hosts (e.g. Railway's free plan).
    // --no-sandbox is required because container runtimes on most PaaS hosts
    // don't grant the namespace permissions Chromium's sandbox needs.
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox'],
  });
}

export interface OpenedPage {
  page: Page;
  close: () => Promise<void>;
}

const FREEZE_ANIMATIONS_CSS = `
*, *::before, *::after {
  animation: none !important;
  transition: none !important;
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}
`;

const DEFAULT_WAIT_UNTIL: WaitUntilOption = 'networkidle';
const DEFAULT_WAIT_MS = 500;

/** Best-effort hostname extraction for deriving a cookie's domain from the side's own URL. */
function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/**
 * Opens a fresh, isolated browser context+page and navigates to `url`
 * (Engine Phase-1 `navigate` phase). Applies auth (cookies/headers/http
 * credentials) scoped to THIS side's context only — never leaks to the
 * other side's context. Caller must invoke close() eventually and should
 * follow up with settlePage() before capturing (see openPage() below for
 * the combined convenience call).
 */
export async function openPageNavigate(
  browser: Browser,
  url: string,
  viewport: ViewportSize,
  options: CaptureOptions = {},
): Promise<OpenedPage> {
  const { waitUntil, freezeAnimations = true, auth } = options;

  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    httpCredentials: auth?.httpCredentials,
  });

  if (auth?.cookies && auth.cookies.length > 0) {
    await context.addCookies(
      auth.cookies.map((c) => ({
        name: c.name,
        value: c.value,
        // domain omitted by the user -> derive it from this side's own URL
        // (never from the other side's URL, so per-side auth stays isolated).
        domain: c.domain && c.domain.trim() ? c.domain : hostnameOf(url),
        path: c.path ?? '/',
      })),
    );
  }
  if (auth?.headers && Object.keys(auth.headers).length > 0) {
    await context.setExtraHTTPHeaders(auth.headers);
  }

  const page = await context.newPage();

  if (freezeAnimations) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  }

  await page.goto(url, { waitUntil: waitUntil ?? DEFAULT_WAIT_UNTIL, timeout: 30000 });

  return {
    page,
    close: () => context.close(),
  };
}

/**
 * Post-navigation settle (Engine Phase-1 `settle` phase): animation
 * freezing, waiting for a required selector, dismissing overlays, hiding
 * noisy selectors, and a final fixed wait. Split out of openPage() so the
 * job pipeline can emit separate `navigate`/`settle` telemetry steps.
 */
export async function settlePage(page: Page, options: CaptureOptions = {}): Promise<void> {
  const { hideSelectors, dismissSelectors, waitMs, waitForSelector, freezeAnimations = true } = options;

  if (freezeAnimations) {
    await page.addStyleTag({ content: FREEZE_ANIMATIONS_CSS });
  }

  if (waitForSelector) {
    await page.waitForSelector(waitForSelector, { timeout: 10000 });
  }

  if (dismissSelectors && dismissSelectors.length > 0) {
    for (const selector of dismissSelectors) {
      try {
        const locator = page.locator(selector).first();
        if (await locator.isVisible({ timeout: 1000 })) {
          await locator.click({ timeout: 2000 });
        }
      } catch {
        // shortcut: a missing/unclickable dismiss selector is ignored — best-effort only
      }
    }
  }

  if (hideSelectors && hideSelectors.length > 0) {
    const css = `${hideSelectors.join(', ')} { display: none !important; }`;
    await page.addStyleTag({ content: css });
  }

  await page.waitForTimeout(waitMs ?? DEFAULT_WAIT_MS);
}

/**
 * Convenience wrapper: navigate + settle in one call, preserving the
 * pre-Phase-1 openPage() behavior/signature exactly (byte-for-byte) for any
 * caller that doesn't need per-phase telemetry granularity.
 */
export async function openPage(
  browser: Browser,
  url: string,
  viewport: ViewportSize,
  options: CaptureOptions = {},
): Promise<OpenedPage> {
  const opened = await openPageNavigate(browser, url, viewport, options);
  await settlePage(opened.page, options);
  return opened;
}

// --- Engine Phase-1: full-scroll settle sequence -----------------------
//
// shortcut: per the tsx/esbuild `keepNames` constraint (see styles.ts), every
// page.evaluate() closure below is FLAT — no named inner function/const-arrow,
// only value bindings, for/while loops, if/else and INLINE anonymous
// callbacks (esbuild never `__name`-wraps those). The surrounding Node
// functions (settleLazyLoad, settleFontsAndImages, neutralizeStickyAndFixed)
// are normal module code and are unaffected.

export interface FullPageSettleOptions {
  /** Pin position:fixed|sticky elements to `absolute` at their current document offset before the fullPage capture, so a bar renders once instead of repeating in the stitched screenshot. Default true. */
  neutralizeSticky?: boolean;
  /** When neutralizing, leave the FIRST position:fixed element alone (e.g. to keep a single top bar exactly as rendered). Default false. */
  keepFirstFixedBar?: boolean;
  /** Bounded lazy-load scroll pass cap — defeats infinite-scroll pages that would otherwise never "reach the bottom". Default 8. */
  maxLazyLoadPasses?: number;
  /** Skip the settle sequence entirely (caller already ran settleForFullPageCapture() as its own telemetry phase). Default false. */
  skipSettle?: boolean;
}

const DEFAULT_MAX_LAZY_LOAD_PASSES = 8;

/**
 * Scrolls down in viewport-height steps (bounded by maxPasses, so an
 * infinite-scroll page can't loop forever) to trigger lazy-loaded content,
 * then returns to the top.
 */
async function settleLazyLoad(page: Page, maxPasses: number): Promise<void> {
  await page.evaluate(
    async ({ maxPasses }) => {
      let pass = 0;
      let lastHeight = 0;
      while (pass < maxPasses) {
        window.scrollBy(0, window.innerHeight);
        await new Promise((resolve) => window.setTimeout(resolve, 150));
        const currentHeight = document.body.scrollHeight;
        const atBottom = window.scrollY + window.innerHeight >= currentHeight - 2;
        if (atBottom && currentHeight === lastHeight) break;
        lastHeight = currentHeight;
        pass++;
      }
      window.scrollTo(0, 0);
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    },
    { maxPasses },
  );
}

/** Waits for web fonts + forces lazy `<img>`s to eager-load and decode, so the capture doesn't race unloaded assets. */
async function settleFontsAndImages(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll('img'));
    for (const img of imgs) {
      if (img.loading === 'lazy') img.loading = 'eager';
      if (img.dataset && img.dataset.src && !img.src) img.src = img.dataset.src;
    }
    const decodePromises: Promise<void>[] = [];
    for (const img of imgs) {
      if (typeof img.decode === 'function') {
        decodePromises.push(img.decode().catch(() => undefined));
      }
    }
    await Promise.all(decodePromises);
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  });
}

/**
 * Pins every `position:fixed|sticky` element to `absolute` at its current
 * document offset, so a sticky header / fixed cookie bar renders exactly
 * once in a fullPage screenshot instead of being repainted at every tile
 * boundary Chromium's full-page capture can produce on tall documents.
 */
async function neutralizeStickyAndFixed(page: Page, keepFirstFixedBar: boolean): Promise<void> {
  await page.evaluate(
    ({ keepFirstFixedBar }) => {
      const all = Array.from(document.querySelectorAll('body *'));
      let firstFixedHandled = false;
      for (const raw of all) {
        const el = raw as HTMLElement;
        const cs = window.getComputedStyle(el);
        if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;

        if (keepFirstFixedBar && cs.position === 'fixed' && !firstFixedHandled) {
          firstFixedHandled = true;
          continue;
        }

        const rect = el.getBoundingClientRect();
        const docTop = rect.top + window.scrollY;
        const docLeft = rect.left + window.scrollX;
        el.style.setProperty('position', 'absolute', 'important');
        el.style.setProperty('top', `${docTop}px`, 'important');
        el.style.setProperty('left', `${docLeft}px`, 'important');
      }
    },
    { keepFirstFixedBar },
  );
}

/**
 * The full-page settle sequence (Engine Phase-1 `scroll` phase): bounded
 * lazy-load scroll → font+image settle → sticky/fixed neutralization.
 * Exported separately so the job pipeline can run it as its own telemetry
 * phase, distinct from the pixel capture itself.
 */
export async function settleForFullPageCapture(page: Page, settleOptions: FullPageSettleOptions = {}): Promise<void> {
  const { neutralizeSticky = true, keepFirstFixedBar = false, maxLazyLoadPasses = DEFAULT_MAX_LAZY_LOAD_PASSES } = settleOptions;
  await settleLazyLoad(page, maxLazyLoadPasses);
  await settleFontsAndImages(page);
  if (neutralizeSticky) {
    await neutralizeStickyAndFixed(page, keepFirstFixedBar);
  }
}

export async function screenshot(
  page: Page,
  fullPage: boolean,
  clipSelector?: string,
  settleOptions: FullPageSettleOptions = {},
): Promise<Buffer> {
  if (clipSelector) {
    const handle = await page.$(clipSelector);
    if (!handle) {
      throw new Error(`clipSelector "${clipSelector}" not found on page`);
    }
    const box = await handle.boundingBox();
    if (!box) {
      throw new Error(`clipSelector "${clipSelector}" matched an element with no visible bounding box`);
    }
    return handle.screenshot();
  }
  if (fullPage && !settleOptions.skipSettle) {
    await settleForFullPageCapture(page, settleOptions);
  }
  return page.screenshot({ fullPage });
}
