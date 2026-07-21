import { chromium, type Browser, type Page } from 'playwright';

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

/**
 * Opens a fresh, isolated browser context+page against a URL at the given
 * viewport and waits for the network to settle. Caller must invoke close().
 */
export async function openPage(browser: Browser, url: string, viewport: ViewportSize): Promise<OpenedPage> {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(500);
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

export async function screenshot(page: Page, fullPage: boolean): Promise<Buffer> {
  if (fullPage) {
    await triggerLazyLoad(page);
  }
  return page.screenshot({ fullPage });
}
