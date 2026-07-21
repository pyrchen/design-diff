// Job 1: shared shape + helpers for the per-side "Захват и авторизация"
// form. Each source panel (Reference-when-URL, Target-always) owns one
// CaptureFormState; CompareForm.vue converts each to a CaptureOptions
// payload at submit time via buildCaptureOptions().
import type { CaptureAuth, CaptureOptions, WaitUntilOption } from '../types';

export type AuthMethod = 'none' | 'cookie' | 'bearer' | 'basic';

export interface CookieRow {
  name: string;
  value: string;
  domain: string;
  path: string;
}

export interface HeaderRow {
  name: string;
  value: string;
}

export interface CaptureFormState {
  open: boolean;
  hideSelectors: string;
  dismissSelectors: string;
  waitUntil: WaitUntilOption;
  waitMs: number;
  waitForSelector: string;
  freezeAnimations: boolean;
  clipSelector: string;
  authMethod: AuthMethod;
  cookies: CookieRow[];
  bearerToken: string;
  bearerHeaders: HeaderRow[];
  basicUsername: string;
  basicPassword: string;
}

export function createCaptureFormState(): CaptureFormState {
  return {
    open: false,
    hideSelectors: '',
    dismissSelectors: '',
    waitUntil: 'networkidle',
    waitMs: 500,
    waitForSelector: '',
    freezeAnimations: true,
    clipSelector: '',
    authMethod: 'none',
    cookies: [],
    bearerToken: '',
    bearerHeaders: [],
    basicUsername: '',
    basicPassword: '',
  };
}

function parseSelectorList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Whether this side actually has usable auth configured — drives the lock indicator. */
export function hasAuthConfigured(state: CaptureFormState): boolean {
  if (state.authMethod === 'cookie') return state.cookies.some((c) => c.name.trim() && c.value.trim());
  if (state.authMethod === 'bearer') return state.bearerToken.trim().length > 0;
  if (state.authMethod === 'basic') return state.basicUsername.trim().length > 0 && state.basicPassword.trim().length > 0;
  return false;
}

/** Converts the UI form state into the wire CaptureOptions shape for this side. */
export function buildCaptureOptions(state: CaptureFormState): CaptureOptions {
  const out: CaptureOptions = {
    waitUntil: state.waitUntil,
    waitMs: state.waitMs,
    freezeAnimations: state.freezeAnimations,
  };

  const hide = parseSelectorList(state.hideSelectors);
  if (hide.length > 0) out.hideSelectors = hide;

  const dismiss = parseSelectorList(state.dismissSelectors);
  if (dismiss.length > 0) out.dismissSelectors = dismiss;

  if (state.waitForSelector.trim()) out.waitForSelector = state.waitForSelector.trim();
  if (state.clipSelector.trim()) out.clipSelector = state.clipSelector.trim();

  if (hasAuthConfigured(state)) {
    const auth: CaptureAuth = {};
    if (state.authMethod === 'cookie') {
      auth.cookies = state.cookies
        .filter((c) => c.name.trim() && c.value.trim())
        .map((c) => ({
          name: c.name.trim(),
          value: c.value.trim(),
          domain: c.domain.trim() || undefined,
          path: c.path.trim() || undefined,
        }));
    } else if (state.authMethod === 'bearer') {
      const headers: Record<string, string> = { Authorization: `Bearer ${state.bearerToken.trim()}` };
      for (const h of state.bearerHeaders) {
        if (h.name.trim()) headers[h.name.trim()] = h.value;
      }
      auth.headers = headers;
    } else if (state.authMethod === 'basic') {
      auth.httpCredentials = { username: state.basicUsername.trim(), password: state.basicPassword };
    }
    out.auth = auth;
  }

  return out;
}

/** Deep clone for the "copy settings to the other side" action (plain data, no functions/refs). */
export function cloneCaptureFormState(state: CaptureFormState): CaptureFormState {
  return JSON.parse(JSON.stringify(state)) as CaptureFormState;
}
