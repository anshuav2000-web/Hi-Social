/** Browser fetch helper with consistent error extraction. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; details?: unknown };

export async function api<T = unknown>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<ApiResult<T>> {
  const { json, ...rest } = init;
  try {
    const res = await fetch(path, {
      ...rest,
      headers: {
        ...(json !== undefined ? { "content-type": "application/json" } : {}),
        ...(rest.headers ?? {}),
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      cache: "no-store",
    });
    const text = await res.text();
    const parsed = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const message =
        parsed?.error?.message ||
        (res.status === 401 ? "Your session expired — sign in again." : res.status === 403 ? "You do not have permission for this action." : `Request failed (${res.status})`);
      return { ok: false, error: message, details: parsed?.error?.details };
    }
    return { ok: true, data: (parsed?.data ?? parsed) as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export function errorList(details: unknown): string[] {
  if (Array.isArray(details)) {
    return details
      .map((d) => {
        if (typeof d === "string") return d;
        if (d && typeof d === "object") {
          const item = d as { path?: (string | number)[]; message?: string };
          return `${item.path?.join(".") ?? "field"}: ${item.message ?? "invalid"}`;
        }
        return "";
      })
      .filter(Boolean)
      .slice(0, 6);
  }
  return [];
}
