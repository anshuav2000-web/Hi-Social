import { z } from "zod";
import { get, nowIso, run, uid } from "@/lib/db";
import { handleApiError, ok, parseJson, requestIp } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { ApiError } from "@/lib/http";
import { logAudit } from "@/lib/audit";

export async function GET(req: Request) {
  try {
    const ctx = await guard("client.read");
    const clientId = new URL(req.url).searchParams.get("clientId");
    if (!clientId) throw new ApiError("clientId is required", 422, "missing_client");
    const profile = get("SELECT * FROM brand_profiles WHERE workspace_id = ? AND client_id = ?", [ctx.workspace.id, clientId]);
    const client = get("SELECT * FROM clients WHERE id = ? AND workspace_id = ?", [clientId, ctx.workspace.id]);
    if (!client) throw new ApiError("Client not found", 404, "not_found");
    return ok({ client, profile });
  } catch (err) {
    return handleApiError(err);
  }
}

const schema = z.object({
  clientId: z.string().min(3),
  brand_name: z.string().min(1).max(120),
  personality: z.string().max(2000).optional(),
  tone: z.string().max(2000).optional(),
  audience: z.string().max(2000).optional(),
  industry: z.string().max(200).optional(),
  languages: z.string().max(200).optional(),
  writing_style: z.string().max(2000).optional(),
  words_to_avoid: z.string().max(1000).optional(),
  content_rules: z.string().max(4000).optional(),
  competitor_refs: z.string().max(1000).optional(),
  guidelines_url: z.string().max(500).optional(),
});

export async function PUT(req: Request) {
  try {
    const ctx = await guard("client.manage");
    const body = await parseJson(req, schema);
    const client = get<{ id: string }>("SELECT id FROM clients WHERE id = ? AND workspace_id = ?", [body.clientId, ctx.workspace.id]);
    if (!client) throw new ApiError("Client not found", 404, "not_found");
    const existing = get<{ id: string }>("SELECT id FROM brand_profiles WHERE workspace_id = ? AND client_id = ?", [ctx.workspace.id, body.clientId]);
    const values = {
      brand_name: body.brand_name,
      personality: body.personality ?? null,
      tone: body.tone ?? null,
      audience: body.audience ?? null,
      industry: body.industry ?? null,
      languages: body.languages ?? null,
      writing_style: body.writing_style ?? null,
      words_to_avoid: body.words_to_avoid ?? null,
      content_rules: body.content_rules ?? null,
      competitor_refs: body.competitor_refs ?? null,
      guidelines_url: body.guidelines_url ?? null,
    };
    if (existing) {
      const keys = Object.keys(values);
      run(`UPDATE brand_profiles SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`, [
        ...Object.values(values),
        nowIso(),
        existing.id,
      ]);
    } else {
      run(
        `INSERT INTO brand_profiles (id, workspace_id, client_id, brand_name, personality, tone, audience, industry, languages,
          writing_style, words_to_avoid, content_rules, competitor_refs, guidelines_url, updated_at, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          uid(),
          ctx.workspace.id,
          body.clientId,
          values.brand_name,
          values.personality,
          values.tone,
          values.audience,
          values.industry,
          values.languages,
          values.writing_style,
          values.words_to_avoid,
          values.content_rules,
          values.competitor_refs,
          values.guidelines_url,
          nowIso(),
          nowIso(),
        ],
      );
    }
    logAudit(ctx, "brand_profile.updated", "client", body.clientId, {}, requestIp(req));
    return ok(get("SELECT * FROM brand_profiles WHERE workspace_id = ? AND client_id = ?", [ctx.workspace.id, body.clientId]));
  } catch (err) {
    return handleApiError(err);
  }
}
