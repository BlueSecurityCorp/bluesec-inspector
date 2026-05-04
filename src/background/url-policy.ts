import type { Settings, UrlPolicyResult } from '../shared/extension-messages';

const blockedKeywords = [
  'bank',
  'card',
  'pay',
  'payment',
  'cert',
  'certificate',
  'auth',
  'login.gov',
  'checkout',
  'account',
  'securities',
  'insurance'
];

export function isAllowedDebugUrl(url: string | undefined, settings: Settings = {}): UrlPolicyResult {
  if (!url) return { allowed: false, reason: 'No active tab URL is available.' };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: 'This tab URL cannot be inspected.' };
  }

  const lowerUrl = url.toLowerCase();
  const blocked = blockedKeywords.find((keyword) => lowerUrl.includes(keyword));
  if (blocked) {
    return { allowed: false, reason: `Attach is blocked because the URL contains "${blocked}".` };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { allowed: false, reason: 'Only http and https pages can be inspected.' };
  }

  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]' || parsed.hostname === '::1') {
    return { allowed: true };
  }

  if (settings.allowedPatterns?.some((pattern) => matchesPattern(url, pattern))) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'This URL is outside the default development allowlist.' };
}

function matchesPattern(url: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(url);
}
