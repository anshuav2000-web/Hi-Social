import { NextResponse } from "next/server";
import { ensureBootstrapped, get } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Liveness + database probe used by Docker/Coolify health checks.
 * Deliberately unauthenticated and free of tenant data.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await ensureBootstrapped();
    const row = get<{ ok: number }>("SELECT 1 AS ok");
    return NextResponse.json({
      status: "ok",
      database: row?.ok === 1 ? "ready" : "unknown",
      scheduler: process.env.ENABLE_INPROCESS_SCHEDULER === "false" ? "external-worker" : "in-process",
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        error: err instanceof Error ? err.message : "unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
