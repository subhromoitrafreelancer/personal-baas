import { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function reject(res: Response): void {
  res.status(403).json({ statusCode: 403, message: 'Cross-site request rejected' });
}

// Defense-in-depth CSRF control for the cookie-authenticated /admin/* surface. main.ts
// deliberately configures no CORS for /admin (it's only ever called same-origin from the
// server-rendered admin console), and sameSite:'strict' on the session cookie already blocks
// most cross-site sends — but neither is an application-level CSRF control on its own, so
// unsafe methods additionally require an explicit same-origin signal from the browser.
// Sec-Fetch-Site is set by the browser itself and can't be forged by page JS, so it's checked
// first; Origin is the fallback for the rare browser that doesn't send Fetch Metadata. A
// request with neither header is rejected rather than assumed same-origin.
export function sameOriginGuard(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const secFetchSite = req.headers['sec-fetch-site'];
  if (typeof secFetchSite === 'string') {
    if (secFetchSite === 'same-origin') {
      next();
      return;
    }
    reject(res);
    return;
  }

  const origin = req.headers.origin;
  if (typeof origin === 'string') {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      reject(res);
      return;
    }
    const requestHost = req.headers['x-forwarded-host'] ?? req.headers.host;
    if (originHost === requestHost) {
      next();
      return;
    }
    reject(res);
    return;
  }

  reject(res);
}
