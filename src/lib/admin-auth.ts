import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { NextResponse } from "next/server";
import { cookies } from "next/headers";

const HASH_PREFIX = "scrypt";
const PASSWORD_HASH_BYTES = 64;
const SESSION_TTL_SECONDS = 60 * 60 * 24;
const COOKIE_PREFIX = "wgeu_admin_";

type SessionPayload = {
  slug: string;
  exp: number;
};

function encodeBase64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function decodeBase64Url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashAdminPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, PASSWORD_HASH_BYTES).toString("hex");
  return `${HASH_PREFIX}:${salt}:${derived}`;
}

export function verifyAdminPassword(password: string, storedHash: string): boolean {
  const [prefix, salt, hash] = storedHash.split(":");
  if (!prefix || !salt || !hash || prefix !== HASH_PREFIX) {
    return false;
  }

  const derived = scryptSync(password, salt, PASSWORD_HASH_BYTES).toString("hex");
  return safeEqual(derived, hash);
}

export function getAdminCookieName(slug: string): string {
  const safeSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  return `${COOKIE_PREFIX}${safeSlug || "group"}`;
}

export function createAdminSessionToken(
  slug: string,
  secret: string,
  ttlSeconds = SESSION_TTL_SECONDS,
): string {
  const payload: SessionPayload = {
    slug,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyAdminSessionToken(
  token: string,
  slug: string,
  secret: string,
): boolean {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return false;
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    return payload.slug === slug && payload.exp > now;
  } catch {
    return false;
  }
}

export function setAdminSessionCookie(
  response: NextResponse,
  slug: string,
  token: string,
) {
  response.cookies.set(getAdminCookieName(slug), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
}

export function clearAdminSessionCookie(response: NextResponse, slug: string) {
  response.cookies.set(getAdminCookieName(slug), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
}

export async function isAdminSessionValid(
  slug: string,
  secret: string,
): Promise<boolean> {
  const store = await cookies();
  const token = store.get(getAdminCookieName(slug))?.value;
  if (!token) {
    return false;
  }
  return verifyAdminSessionToken(token, slug, secret);
}

