import { NextRequest } from 'next/server';

/**
 * OpenClaw / external API auth: Bearer token match against OPENCLAW_API_KEY.
 */
export function checkApiKey(req: NextRequest): boolean {
  const expected = process.env.OPENCLAW_API_KEY;
  if (!expected) return false;
  const header = req.headers.get('authorization');
  if (!header) return false;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return false;
  return token === expected;
}

export function checkCronAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return req.headers.get('authorization') === `Bearer ${expected}`;
}
