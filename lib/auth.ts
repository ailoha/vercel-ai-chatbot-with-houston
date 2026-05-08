import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "crypto";

export const AUTH_COOKIE = "auth";

export function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export function isAuthed(): boolean {
  const password = process.env.APP_PASSWORD;
  if (!password) return true;

  const provided = cookies().get(AUTH_COOKIE)?.value;
  if (!provided) return false;

  const expected = hashPassword(password);
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
