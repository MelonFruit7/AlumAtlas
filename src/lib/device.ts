import { createHash } from "node:crypto";
import { getRuntimeConfig } from "@/lib/env";

export const DEVICE_TOKEN_KEY = "wgeu-device-token";

export function getOrCreateDeviceToken(): string {
  if (typeof window === "undefined") {
    throw new Error("Device token can only be accessed in the browser.");
  }

  const existing = window.localStorage.getItem(DEVICE_TOKEN_KEY);
  if (existing) {
    return existing;
  }

  const token = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_TOKEN_KEY, token);
  return token;
}

export function hashDeviceToken(token: string): string {
  const { deviceSalt } = getRuntimeConfig();
  return createHash("sha256").update(`${deviceSalt}:${token}`).digest("hex");
}
