import type { UrlPolicyResult } from '../shared/extension-messages';

export function isAllowedDebugUrl(url: string | undefined): UrlPolicyResult {
  if (!url) return { allowed: false, reason: 'No active tab URL is available.' };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: 'This tab URL cannot be inspected.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { allowed: false, reason: 'Only http and https pages can be inspected.' };
  }

  return { allowed: true };
}
