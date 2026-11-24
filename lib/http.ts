import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(message: string, status = 400, code = "bad_request", details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function created(data: unknown) {
  return NextResponse.json({ data }, { status: 201 });
}

export function fail(message: string, status = 400, code = "bad_request", details?: unknown) {
  return NextResponse.json({ error: { message, code, details } }, { status });
}

export function handleApiError(err: unknown) {
  if (err instanceof ApiError) {
    return fail(err.message, err.status, err.code, err.details);
  }
  if (err instanceof ZodError) {
    return fail("Validation failed", 422, "validation_failed", err.issues);
  }
  const message = err instanceof Error ? err.message : "Unexpected server error";
  // Never leak stack traces or secrets to clients.
  const safe = /UNIQUE constraint failed/i.test(message)
    ? "That record already exists."
    : /FOREIGN KEY constraint failed/i.test(message)
      ? "Related record not found or still in use."
      : message;
  console.error("[api]", err);
  return fail(safe, 500, "internal_error");
}

export async function parseJson<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError("Request body must be valid JSON", 400, "invalid_json");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("Validation failed", 422, "validation_failed", parsed.error.issues);
  }
  return parsed.data;
}

export type Page = { page: number; pageSize: number; offset: number };

export function parsePage(url: URL, defaultSize = 25, maxSize = 200): Page {
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const rawSize = Number(url.searchParams.get("pageSize") || defaultSize) || defaultSize;
  const pageSize = Math.min(maxSize, Math.max(1, rawSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function sortedUrl(url: URL, allowed: string[], fallback: string) {
  const sort = url.searchParams.get("sort") || "";
  const dir = (url.searchParams.get("dir") || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const column = allowed.includes(sort) ? sort : fallback;
  return { column, dir };
}

export function requestIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "127.0.0.1";
}

/** Simple fixed-window rate limiter (per process) for auth + sensitive routes. */
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}
