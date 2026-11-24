import { handleApiError, ok, requestIp } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { RESOURCE_MAP, buildSchema } from "@/lib/modules";
import { deleteResource, getResourceRow, updateResource } from "@/lib/repo";
import { ApiError } from "@/lib/http";

type Params = { params: Promise<{ resource: string; id: string }> };

function resolve(key: string) {
  const resource = RESOURCE_MAP[key];
  if (!resource) throw new ApiError(`Unknown resource “${key}”`, 404, "unknown_resource");
  return resource;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const { resource: key, id } = await params;
    const resource = resolve(key);
    const ctx = await guard(resource.read);
    return ok(getResourceRow(ctx, resource, id));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { resource: key, id } = await params;
    const resource = resolve(key);
    const ctx = await guard(resource.write);
    const schema = buildSchema(resource, true);
    const raw = await req.json().catch(() => null);
    if (raw === null) throw new ApiError("Request body must be valid JSON", 400, "invalid_json");
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new ApiError("Validation failed", 422, "validation_failed", parsed.error.issues);
    const row = updateResource(ctx, resource, id, parsed.data as Record<string, unknown>, requestIp(req));
    return ok(row);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { resource: key, id } = await params;
    const resource = resolve(key);
    const ctx = await guard(resource.write);
    return ok(deleteResource(ctx, resource, id, requestIp(req)));
  } catch (err) {
    return handleApiError(err);
  }
}
