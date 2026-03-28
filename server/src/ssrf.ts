// SSRF protection for probe targets and admin-submitted URLs.
// Blocks private, link-local, loopback, and metadata service addresses.

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

export function isSafeUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // HTTPS only
  if (parsed.protocol !== "https:") return false;

  const host = parsed.hostname.toLowerCase();

  // Block known dangerous hostnames
  if (BLOCKED_HOSTNAMES.has(host)) return false;
  if (host.endsWith(".local")) return false;
  if (host.endsWith(".internal")) return false;

  // Block IP addresses entirely. Real services have domain names.
  // This prevents 127.0.0.1, 0x7f000001, 0177.0.0.1, [::1], etc.
  if (isIpAddress(host)) return false;

  return true;
}

function isIpAddress(host: string): boolean {
  // IPv6 in brackets
  if (host.startsWith("[")) return true;

  // IPv4: any string that's only digits and dots
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;

  // Hex IPv4 (0x7f.0x0.0x0.0x1)
  if (/^0x[0-9a-f]+/i.test(host)) return true;

  // Octal IPv4 (0177.0.0.1)
  if (/^0\d+\./.test(host)) return true;

  // Decimal integer IP (2130706433 = 127.0.0.1)
  if (/^\d{8,}$/.test(host)) return true;

  return false;
}
