import Hashids from "hashids";

import { env } from "../config/env.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let cachedHashids: Hashids | null = null;

function getHashids(): Hashids {
  if (cachedHashids) return cachedHashids;
  const salt = env.HASHIDS_SALT ?? env.JWT_SECRET;
  cachedHashids = new Hashids(salt, 10);
  return cachedHashids;
}

/**
 * Try multiple decode strategies and return a canonical string id.
 *
 * Resolution order:
 *   1. Already a UUID -> return as-is.
 *   2. base64url -> a UUID -> return decoded UUID.
 *   3. Hashids -> a single positive integer -> return its string form.
 *   4. Numeric string -> return as-is.
 *
 * Always falls back to the input string so callers can rely on a string
 * being returned regardless of encoding. The backend uses UUIDs natively, so
 * Hashids/base64url are convenience layers for callers that prefer opaque
 * non-UUID-shaped tokens in URLs.
 */
export function decodeId(value: string | undefined | null): string {
  if (typeof value !== "string" || value.length === 0) return "";
  const trimmed = value.trim();
  if (UUID_REGEX.test(trimmed)) return trimmed.toLowerCase();

  // base64url -> UUID
  if (/^[A-Za-z0-9_-]+$/.test(trimmed) && trimmed.length >= 22) {
    try {
      const padded = trimmed.replace(/-/g, "+").replace(/_/g, "/");
      const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
      const decoded = Buffer.from(padded + padding, "base64").toString("utf8");
      if (UUID_REGEX.test(decoded)) return decoded.toLowerCase();
    } catch {
      /* fall through */
    }
  }

  // Hashids -> [number]
  try {
    const ids = getHashids().decode(trimmed);
    if (ids.length === 1 && typeof ids[0] === "number" && Number.isFinite(ids[0]) && ids[0] >= 0) {
      return String(ids[0]);
    }
  } catch {
    /* fall through */
  }

  // Numeric fallback
  if (/^\d+$/.test(trimmed)) return trimmed;

  return trimmed;
}

/**
 * Encode a UUID/numeric id for URL exposure. UUIDs are already opaque so they
 * are returned unchanged. For pure-numeric ids we apply Hashids. Falls back to
 * the raw value on unrecognized inputs.
 */
export function encodeId(value: string | number): string {
  if (typeof value === "number") {
    return getHashids().encode(value);
  }
  if (UUID_REGEX.test(value)) return value;
  if (/^\d+$/.test(value)) return getHashids().encode(Number(value));
  return value;
}

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}
