import { z } from "zod";
import { all, get } from "@/lib/db";
import { handleApiError, ok, parseJson } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { aiStatus, generate } from "@/lib/ai";
import { buildInsights } from "@/lib/insights";
import { accountKpis, accountPerformance, parseRange, topPosts } from "@/lib/analytics";

export async function GET() {
  try {
    await guard("content.read");
    return ok({ providers: await aiStatus() });
  } catch (err) {
    return handleApiError(err);
  }
}

const schema = z.object({
  mode: z.enum([
    "caption",
    "captions",
    "hashtags",
    "idea",
    "hook",
    "cta",
    "rewrite",
    "tone",
    "repurpose",
    "reel_script",
    "carousel_outline",
    "weekly_plan",
    "monthly_calendar",
    "campaign_ideas",
    "brief",
    "creative_direction",
    "gap_analysis",
    "performance_advice",
  ]),
  topic: z.string().min(2).max(4000),
  platform: z.string().max(30).optional(),
  contentType: z.string().max(30).optional(),
  tone: z.string().max(80).optional(),
  audience: z.string().max(200).optional(),
  extra: z.string().max(2000).optional(),
  clientId: z.string().optional(),
  postId: z.string().optional(),
  useRealMetrics: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const ctx = await guard("content.read");
    const body = await parseJson(req, schema);

    const brandVoice = body.clientId
      ? get<Record<string, string | null>>("SELECT * FROM brand_profiles WHERE workspace_id = ? AND client_id = ?", [
          ctx.workspace.id,
          body.clientId,
        ])
      : null;

    // Verified metrics only — pulled from the database, never invented.
    let metrics: Record<string, unknown> | null = null;
    if (body.useRealMetrics || ["gap_analysis", "performance_advice"].includes(body.mode)) {
      const range = parseRange(new URLSearchParams());
      const kpis = accountKpis(ctx.workspace.id, range);
      metrics = {
        period: `${range.from} → ${range.to}`,
        reach: kpis.reach,
        impressions: kpis.impressions,
        engagement: kpis.engagement,
        engagementRate: kpis.engagementRate,
        followers: kpis.followers,
        followerGrowth: kpis.followerGrowth,
        publishedPosts: kpis.publishedPosts,
        dataSource: kpis.sources.join(",") || "none",
        accounts: accountPerformance(ctx.workspace.id, range).slice(0, 5).map((a) => ({
          name: a.name,
          platform: a.platform,
          reach: a.reach,
          engagementRate: a.engagement_rate,
          followers: a.followers,
        })),
        topPosts: topPosts(ctx.workspace.id, range, 3).map((p) => ({ title: p.title, engagement: p.engagement, rate: p.engagement_rate })),
        overdue: get<{ n: number }>(
          "SELECT COUNT(*) AS n FROM tasks WHERE workspace_id = ? AND status != 'done' AND due_date < ?",
          [ctx.workspace.id, new Date().toISOString()],
        )?.n,
      };
    }

    const result = await generate({
      mode: body.mode,
      topic: body.topic,
      platform: body.platform,
      contentType: body.contentType,
      tone: body.tone,
      audience: body.audience,
      extra: body.extra,
      brandVoice: brandVoice as never,
      metrics,
    });

    const insights = metrics ? buildInsights(ctx.workspace.id) : undefined;
    return ok({ ...result, metricsUsed: metrics, insights: insights?.slice(0, 4) });
  } catch (err) {
    return handleApiError(err);
  }
}
