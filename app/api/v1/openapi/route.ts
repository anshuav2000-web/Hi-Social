import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/rbac";
import { RESOURCES } from "@/lib/modules";

export const dynamic = "force-dynamic";

const jsonResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: { type: "object" } } },
});

const operation = (summary: string, permission?: string, extra: Record<string, unknown> = {}) => ({
  summary,
  ...(permission ? { description: `Requires permission: ${permission}` } : {}),
  responses: {
    200: jsonResponse("Success envelope `{ data }`"),
    401: jsonResponse("Missing or expired session"),
    403: jsonResponse("Permission denied"),
    422: jsonResponse("Validation failure with `details`"),
  },
  ...extra,
});

/**
 * Machine-readable API description. Regenerated from the same registries the
 * application uses, so it cannot drift for the generic resource endpoints.
 */
export async function GET() {
  const paths: Record<string, unknown> = {
    "/api/v1/health": {
      get: {
        summary: "Liveness and database probe",
        security: [],
        responses: { 200: jsonResponse("Healthy"), 503: jsonResponse("Unhealthy") },
      },
    },
    "/api/v1/auth/login": {
      post: {
        summary: "Create a session",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: { email: { type: "string", format: "email" }, password: { type: "string" } },
              },
            },
          },
        },
        responses: { 200: jsonResponse("Session cookie set"), 401: jsonResponse("Invalid credentials") },
      },
    },
    "/api/v1/auth/logout": { post: operation("Destroy the current session", "workspace.read") },
    "/api/v1/auth/me": { get: operation("Current user, workspace, role and permissions") },
    "/api/v1/posts": {
      get: operation("List posts with filters and pagination", "content.read"),
      post: operation("Create a post (draft)", "content.write"),
    },
    "/api/v1/posts/{id}": {
      get: operation("Post detail", "content.read"),
      patch: operation("Update a post", "content.write"),
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    },
    "/api/v1/posts/{id}/actions": {
      post: operation("Lifecycle action: submit, approve, request_changes, schedule, unschedule, publish_now, duplicate, archive", "content.write"),
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    },
    "/api/v1/queue": {
      get: operation("Publishing jobs, attempts and queue state", "content.publish"),
      post: operation("retry | cancel | pause | resume | run_now", "content.publish"),
    },
    "/api/v1/scheduler/tick": {
      post: {
        ...operation("Execute due publishing jobs"),
        description: "Session auth or `Authorization: Bearer $WORKER_SECRET`.",
      },
    },
    "/api/v1/integrations/meta": {
      get: operation("Meta configuration, accounts and sync history", "integration.manage"),
      post: operation("Disconnect an account", "integration.manage"),
    },
    "/api/v1/integrations/meta/start": { post: operation("Begin Meta OAuth", "integration.manage") },
    "/api/v1/integrations/meta/callback": { get: { summary: "OAuth callback", security: [], responses: { 302: { description: "Redirect to integrations" } } } },
    "/api/v1/integrations/meta/sync": { post: operation("Import history, insights or comments", "integration.manage") },
    "/api/v1/webhooks/meta": {
      get: { summary: "Webhook verification handshake", security: [], responses: { 200: { description: "challenge" } } },
      post: { summary: "Signed webhook delivery (HMAC verified)", security: [], responses: { 200: jsonResponse("Accepted or duplicate") } },
    },
    "/api/v1/analytics": { get: operation("KPIs, trend, platform split and provenance", "analytics.read") },
    "/api/v1/insights": { get: operation("Evidence-based recommendations", "analytics.read") },
    "/api/v1/reports": {
      get: operation("List reports", "analytics.read"),
      post: operation("Generate a report snapshot", "report.export"),
    },
    "/api/v1/reports/{id}/export": {
      get: operation("Export xlsx | csv | html", "report.export"),
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
        { name: "format", in: "query", schema: { type: "string", enum: ["xlsx", "csv", "html"] } },
      ],
    },
    "/api/v1/excel": {
      get: operation("Template or data export (xlsx/csv)", "content.read"),
      post: operation("Validated import (multipart, dryRun supported)", "content.write"),
    },
    "/api/v1/media": {
      get: operation("List media assets", "media.read"),
      post: operation("Upload media (multipart)", "media.write"),
    },
    "/api/v1/inbox": {
      get: operation("Conversation list", "inbox.read"),
      post: operation("Reply, assign, change status", "inbox.write"),
    },
    "/api/v1/tasks": {
      get: operation("Task board data", "task.read"),
      post: operation("Create a task", "task.write"),
    },
    "/api/v1/notifications": {
      get: operation("Notifications for the caller"),
      post: operation("read_all | prefs"),
    },
    "/api/v1/workspace": {
      get: operation("Workspace settings", "workspace.read"),
      patch: operation("Update workspace settings", "workspace.manage"),
    },
    "/api/v1/ai": { post: operation("Generate copy, plans or analysis", "content.read") },
    "/api/v1/automations": {
      get: operation("Rules and recent runs", "automation.manage"),
      post: operation("Run or toggle a rule", "automation.manage"),
    },
  };

  for (const resource of RESOURCES) {
    paths[`/api/v1/data/${resource.key}`] = {
      get: operation(`List ${resource.label}`, resource.read, {
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", maximum: 100 } },
          { name: "q", in: "query", schema: { type: "string" } },
        ],
      }),
      post: operation(`Create ${resource.singular}`, resource.write),
    };
    paths[`/api/v1/data/${resource.key}/{id}`] = {
      get: operation(`Read ${resource.singular}`, resource.read),
      patch: operation(`Update ${resource.singular}`, resource.write),
      delete: operation(`Delete ${resource.singular}`, resource.write),
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    };
  }

  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "SocialHub Pro API",
      version: "1.0.0",
      description:
        "Session-authenticated REST API. Every mutation is validated with Zod, permission-checked server-side and audited. " +
        "Errors use `{ error, code, details }`.",
    },
    servers: [{ url: "/api/v1" }],
    components: {
      securitySchemes: { sessionCookie: { type: "apiKey", in: "cookie", name: "shp_session" } },
      schemas: { Permission: { type: "string", enum: [...PERMISSIONS] } },
    },
    security: [{ sessionCookie: [] }],
    paths,
  });
}
