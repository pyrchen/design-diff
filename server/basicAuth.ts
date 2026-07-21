// Optional HTTP Basic Auth gate for non-local deployments. The app itself has
// no account system (see secrets.ts) and lets any caller drive a headless
// browser to arbitrary URLs, so a public deploy needs *some* front door.
// No-op unless both BASIC_AUTH_USER and BASIC_AUTH_PASS are set, so local
// dev (`npm run dev` / `npm start`) stays exactly as before.

import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function basicAuth(req: Request, res: Response, next: NextFunction): void {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) {
    next();
    return;
  }

  const header = req.headers.authorization ?? '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const sepIndex = decoded.indexOf(':');
    if (sepIndex !== -1) {
      const reqUser = decoded.slice(0, sepIndex);
      const reqPass = decoded.slice(sepIndex + 1);
      if (safeEqual(reqUser, user) && safeEqual(reqPass, pass)) {
        next();
        return;
      }
    }
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="design-diff"');
  res.status(401).send('Authentication required');
}
