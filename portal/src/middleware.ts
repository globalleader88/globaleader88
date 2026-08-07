import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge middleware: attaches a per-request Content-Security-Policy with a nonce
 * and a request id. Static security headers are set in next.config.mjs; the CSP
 * lives here because it needs a fresh nonce each request. `unsafe-inline` is not
 * granted to scripts — Next injects the nonce into its own inline bootstrap.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const requestId = crypto.randomUUID();

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  // Skip static assets and image optimizer.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
