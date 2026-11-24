import { created, handleApiError, ok } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { RESOURCE_MAP, buildSchema } from "@/lib/modules";
import { createResource, listResource } from "@/lib/repo";
import { requestIp } from "@/lib/http";
import { ApiError } from "@/lib/http";

type Params = { params: Promise<{ resource: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const { resource: key } = await params;
    const resource = RESOURCE_MAP[key];
    if (!resource) throw new ApiError(`Unknown resource “${key}”`, 404, "unknown_resource");
    const ctx = await guard(resource.read);
    const result = listResource(ctx, resource, new URL(req.url));
    return ok({ ...result, resource: key });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { resource: key } = await params;
    const resource = RESOURCE_MAP[key];
    if (!resource) throw new ApiError(`Unknown resource “${key}”`, 404, "unknown_resource");
    const ctx = await guard(resource.write);
    const schema = buildSchema(resource);
    const raw = await req.json().catch(() => null);
    if (raw === null) throw new ApiError("Request body must be valid JSON", 400, "invalid_json");
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError("Validation failed", 422, "validation_failed", parsed.error.issues);
    }
    const row = createResource(ctx, resource, parsed.data as Record<string, unknown>, requestIp(req));
    return created(row);
  } catch (err) {
    return handleApiError(err);
  }
}
