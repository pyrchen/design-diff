import { chromium, type Browser, type Page } from 'playwright';
import type { CaptureOptions, WaitUntilOption } from './types.js';

export interface ViewportSize {
  width: number;
  height: number;
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
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
 * Opens a fresh, isolated browser context+page against a URL at the given
 * viewport, applies the Job-1 per-side robustness options (auth, wait
 * controls, animation freezing, dismiss/hide selectors), and waits for the
 * page to settle. Caller must invoke close().
 *
 * `options` is scoped to THIS side only (reference or target) — auth
 * (cookies/headers/httpCredentials) is applied exclusively to this
 * browser context and never leaks to the other side's context.
 */
export async function openPage(
  browser: Browser,
  url: string,
  viewport: ViewportSize,
  options: CaptureOptions = {},
): Promise<OpenedPage> {
  const { hideSelectors, dismissSelectors, waitUntil, waitMs, waitForSelector, freezeAnimations = true, auth } = options;

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

  return {
    page,
    close: () => context.close(),
  };
}

/** Scrolls to the bottom in steps (to trigger lazy-loaded content), then back to top. */
async function triggerLazyLoad(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let total = 0;
      const step = 600;
      const timer = window.setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, step);
        total += step;
        if (total >= scrollHeight + step) {
          window.clearInterval(timer);
          resolve();
        }
      }, 120);
    });
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}

export async function screenshot(page: Page, fullPage: boolean, clipSelector?: string): Promise<Buffer> {
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
  if (fullPage) {
    await triggerLazyLoad(page);
  }
  return page.screenshot({ fullPage });
}
