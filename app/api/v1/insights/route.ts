import { handleApiError, ok } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { buildInsights, teamWorkload } from "@/lib/insights";

export async function GET(req: Request) {
  try {
    const ctx = await guard("analytics.read");
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const range = from && to ? { from, to } : undefined;
    return ok({ insights: buildInsights(ctx.workspace.id, range), workload: teamWorkload(ctx.workspace.id) });
  } catch (err) {
    return handleApiError(err);
  }
}
