import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env, metaConfigured } from "@/lib/env";

/**
 * Meta Graph API client. Every call goes through `graph()` so error payloads,
 * versioning and logging stay in one place. Nothing here runs unless the
 * workspace holds a live (non-sandbox) access token.
 */
const graphBase = () => `https://graph.facebook.com/${env.meta.graphVersion}`;

export type GraphError = {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

export class MetaApiError extends Error {
  status: number;
  payload: GraphError;
  constructor(status: number, payload: GraphError) {
    super(payload.message);
    this.status = status;
    this.payload = payload;
  }
}

async function graph<T = unknown>(
  path: string,
  init: { method?: string; token?: string; query?: Record<string, string | undefined>; body?: unknown } = {},
): Promise<T> {
  const url = new URL(`${graphBase()}/${path.replace(/^\/+/, "")}`);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }
  if (init.token && (init.method ?? "GET") === "GET") url.searchParams.set("access_token", init.token);

  const headers: Record<string, string> = { accept: "application/json" };
  let body: string | undefined;
  if (init.body !== undefined) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    const params = new URLSearchParams();
    const push = (key: string, value: unknown) => {
      if (value === undefined || value === null) return;
      params.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    };
    for (const [k, v] of Object.entries(init.body as Record<string, unknown>)) push(k, v);
    if (init.token) params.set("access_token", init.token);
    body = params.toString();
  }

  const res = await fetch(url.toString(), { method: init.method ?? "GET", headers, body, cache: "no-store" });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = (json as { error?: GraphError })?.error ?? { message: `Graph API ${res.status}` };
    throw new MetaApiError(res.status, err);
  }
  return json as T;
}

// ── OAuth ───────────────────────────────────────────────────
export const isConfigured = metaConfigured;

export const PERMISSION_SETS = {
  facebook: [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "pages_manage_engagement",
    "read_insights",
    "business_management",
  ],
  instagramViaFacebook: [
    "instagram_basic",
    "instagram_content_publish",
    "instagram_manage_comments",
    "instagram_manage_insights",
    "pages_show_list",
    "pages_read_engagement",
    "business_management",
  ],
  instagramLogin: ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_comments"],
};

export function oauthDialogUrl(flow: "facebook" | "instagram", state: string): string {
  const version = env.meta.graphVersion;
  if (flow === "instagram") {
    const url = new URL(`https://www.instagram.com/oauth/authorize`);
    url.searchParams.set("client_id", env.meta.appId);
    url.searchParams.set("redirect_uri", env.meta.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", PERMISSION_SETS.instagramLogin.join(","));
    url.searchParams.set("state", state);
    return url.toString();
  }
  const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
  url.searchParams.set("client_id", env.meta.appId);
  url.searchParams.set("redirect_uri", env.meta.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", [...PERMISSION_SETS.facebook, ...PERMISSION_SETS.instagramViaFacebook].join(","));
  return url.toString();
}

export async function exchangeCode(code: string) {
  return graph<{ access_token: string; token_type: string; expires_in?: number }>("oauth/access_token", {
    query: {
      client_id: env.meta.appId,
      client_secret: env.meta.appSecret,
      redirect_uri: env.meta.redirectUri,
      code,
    },
  });
}

export async function exchangeForLongLivedToken(shortLived: string) {
  return graph<{ access_token: string; expires_in?: number; token_type: string }>("oauth/access_token", {
    query: {
      grant_type: "fb_exchange_token",
      client_id: env.meta.appId,
      client_secret: env.meta.appSecret,
      fb_exchange_token: shortLived,
    },
  });
}

export async function debugToken(token: string) {
  return graph<{ data: { is_valid: boolean; scopes: string[]; expires_at?: number; user_id?: string; app_id?: string } }>(
    "debug_token",
    { query: { input_token: token, access_token: `${env.meta.appId}|${env.meta.appSecret}` } },
  );
}

// ── Discovery ───────────────────────────────────────────────
export type FacebookPage = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: {
    id: string;
    username?: string;
    name?: string;
    profile_picture_url?: string;
    followers_count?: number;
  };
  followers_count?: number;
  fan_count?: number;
  category?: string;
  picture?: { data?: { url?: string } };
};

export async function listPages(userToken: string) {
  return graph<{ data: FacebookPage[] }>("me/accounts", {
    token: userToken,
    query: {
      fields:
        "id,name,access_token,category,followers_count,fan_count,picture{url},instagram_business_account{id,username,name,profile_picture_url,followers_count}",
      limit: "100",
    },
  });
}

export async function getPage(pageId: string, token: string) {
  return graph<FacebookPage>(pageId, {
    token,
    query: { fields: "id,name,category,followers_count,fan_count,picture{url},instagram_business_account{id,username,name}" },
  });
}

// ── Publishing: Facebook Page ───────────────────────────────
export async function publishFacebookPagePost(
  pageId: string,
  pageToken: string,
  input: { message: string; link?: string | null },
) {
  return graph<{ id: string }>(`${pageId}/feed`, {
    method: "POST",
    token: pageToken,
    body: { message: input.message, link: input.link || undefined },
  });
}

export async function publishFacebookPhoto(
  pageId: string,
  pageToken: string,
  input: { url: string; caption: string },
) {
  return graph<{ id: string; post_id?: string }>(`${pageId}/photos`, {
    method: "POST",
    token: pageToken,
    body: { url: input.url, caption: input.caption },
  });
}

// ── Publishing: Instagram ───────────────────────────────────
/** Creates a media container. Returns the creation_id used by publishContainer. */
export async function createInstagramContainer(
  igUserId: string,
  token: string,
  input: {
    mediaType: "IMAGE" | "REELS" | "STORIES" | "CAROUSEL" | "VIDEO";
    imageUrl?: string;
    videoUrl?: string;
    caption?: string;
    isCarouselItem?: boolean;
    children?: string[];
  },
) {
  const body: Record<string, unknown> = { caption: input.caption };
  if (input.mediaType === "REELS") {
    body.media_type = "REELS";
    body.video_url = input.videoUrl;
    body.share_to_feed = "true";
  } else if (input.mediaType === "STORIES") {
    body.media_type = "STORIES";
    if (input.videoUrl) body.video_url = input.videoUrl;
    else body.image_url = input.imageUrl;
  } else if (input.mediaType === "CAROUSEL") {
    body.media_type = "CAROUSEL";
    body.children = input.children?.join(",");
  } else if (input.mediaType === "VIDEO") {
    body.media_type = "VIDEO";
    body.video_url = input.videoUrl;
  } else {
    body.image_url = input.imageUrl;
    if (input.isCarouselItem) body.is_carousel_item = "true";
  }
  return graph<{ id: string }>(`${igUserId}/media`, { method: "POST", token, body });
}

export async function publishInstagramContainer(igUserId: string, token: string, creationId: string) {
  return graph<{ id: string }>(`${igUserId}/media_publish`, {
    method: "POST",
    token,
    body: { creation_id: creationId },
  });
}

export async function getInstagramContainerStatus(token: string, creationId: string) {
  return graph<{ id: string; status_code?: string; status?: string }>(creationId, {
    token,
    query: { fields: "status_code,status" },
  });
}

export async function getInstagramPermalink(token: string, mediaId: string) {
  return graph<{ permalink?: string }>(mediaId, { token, query: { fields: "permalink" } });
}

// ── Insights ───────────────────────────────────────────────
export async function fetchInstagramAccountInsights(
  igUserId: string,
  token: string,
  since: number,
  until: number,
  metrics = "reach",
) {
  return graph<{ data: { name: string; period: string; values: { value: number; end_time?: string }[] }[] }>(
    `${igUserId}/insights`,
    {
      token,
      query: {
        metric: metrics,
        period: "day",
        since: String(since),
        until: String(until),
      },
    },
  );
}

export async function fetchInstagramMedia(igUserId: string, token: string, limit = 50) {
  return graph<{
    data: {
      id: string;
      caption?: string;
      media_type: string;
      permalink?: string;
      timestamp: string;
      like_count?: number;
      comments_count?: number;
    }[];
  }>(`${igUserId}/media`, {
    token,
    query: { fields: "id,caption,media_type,permalink,timestamp,like_count,comments_count", limit: String(limit) },
  });
}

export async function fetchInstagramMediaInsights(mediaId: string, token: string) {
  // `impressions` was withdrawn for Instagram media in Graph v22+, and
  // `engagement` is not a Graph metric — `total_interactions` is the equivalent.
  return graph<{ data: { name: string; values: { value: number }[] }[] }>(`${mediaId}/insights`, {
    token,
    query: { metric: "reach,saved,likes,comments,shares,total_interactions" },
  });
}

export async function fetchInstagramAccountDetails(igUserId: string, token: string) {
  return graph<{ id: string; username?: string; followers_count?: number; follows_count?: number; media_count?: number }>(
    igUserId,
    { token, query: { fields: "id,username,followers_count,follows_count,media_count" } },
  );
}

/**
 * Total-value account metrics. Graph requires `metric_type=total_value` for
 * metrics such as profile_views, and rejects them on the time-series call.
 */
export async function fetchInstagramAccountTotals(igUserId: string, token: string, since: number, until: number) {
  return graph<{ data: { name: string; total_value?: { value: number } }[] }>(`${igUserId}/insights`, {
    token,
    query: {
      metric: "profile_views",
      period: "day",
      metric_type: "total_value",
      since: String(since),
      until: String(until),
    },
  });
}

export async function fetchPageDetails(pageId: string, token: string) {
  return graph<{ id: string; name?: string; fan_count?: number; followers_count?: number }>(
    pageId,
    { token, query: { fields: "id,name,fan_count,followers_count" } },
  );
}

export async function fetchPageInsights(pageId: string, token: string, since: number, until: number) {
  return graph<{ data: { name: string; period: string; values: { value: number; end_time?: string }[] }[] }>(
    `${pageId}/insights`,
    {
      token,
      query: {
        metric: "page_views_total,page_post_engagements",
        period: "day",
        since: String(since),
        until: String(until),
      },
    },
  );
}

// ── Comments / moderation ──────────────────────────────────
export async function listComments(objectId: string, token: string, limit = 25) {
  return graph<{
    data: { id: string; message?: string; text?: string; username?: string; from?: { name?: string; id?: string }; created_time?: string; like_count?: number }[];
  }>(`${objectId}/comments`, {
    token,
    query: { fields: "id,message,text,from,created_time,like_count,username", limit: String(limit) },
  });
}

export async function replyToComment(commentId: string, token: string, message: string) {
  return graph<{ id: string }>(`${commentId}/replies`, { method: "POST", token, body: { message } });
}

export async function setCommentHidden(commentId: string, token: string, hide: boolean) {
  return graph<{ success?: boolean }>(commentId, { method: "POST", token, body: { hide: hide ? "true" : "false" } });
}

// ── Webhooks ───────────────────────────────────────────────
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader || !env.meta.appSecret) return false;
  const expected = "sha256=" + createHmac("sha256", env.meta.appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function describeMetaConfig() {
  return {
    configured: isConfigured(),
    graphVersion: env.meta.graphVersion,
    redirectUri: env.meta.redirectUri,
    webhookVerifyTokenSet: Boolean(env.meta.webhookVerifyToken),
    appSecretSet: Boolean(env.meta.appSecret),
    facebookLoginEnabled: env.meta.facebookLogin,
    instagramLoginEnabled: env.meta.instagramLogin,
  };
}
