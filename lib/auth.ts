import { cookies } from "next/headers";

export const AUTH_COOKIE = "auth";

// Web-Crypto-based SHA-256 so this module works in both Edge and Node
// runtimes. Edge route handlers (like /api/chat) can't use node:crypto.
export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

// Constant-time string compare. Both sides are hex digests of equal
// length, so a length check first is fine.
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function getCookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  const parts = header.split(";");
  for (let i = 0; i < parts.length; i++) {
    const c = parts[i].trim();
    const eq = c.indexOf("=");
    if (eq < 0) continue;
    if (c.slice(0, eq) === name) {
      try {
        return decodeURIComponent(c.slice(eq + 1));
      } catch {
        return c.slice(eq + 1);
      }
    }
  }
  return null;
}

export async function isAuthed(): Promise<boolean> {
  const password = process.env.APP_PASSWORD;
  if (!password) return true;

  const provided = cookies().get(AUTH_COOKIE)?.value;
  if (!provided) return false;

  const expected = await hashPassword(password);
  return timingSafeEqualStr(provided, expected);
}

// Variant used by Edge route handlers that already have the raw
// Cookie header in hand — avoids the next/headers indirection.
export async function isAuthedFromCookieHeader(
  cookieHeader: string | null
): Promise<boolean> {
  const password = process.env.APP_PASSWORD;
  if (!password) return true;

  const provided = getCookieValue(cookieHeader, AUTH_COOKIE);
  if (!provided) return false;

  const expected = await hashPassword(password);
  return timingSafeEqualStr(provided, expected);
}
