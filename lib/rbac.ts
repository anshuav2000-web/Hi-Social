/**
 * Client-safe RBAC model. The database mirrors this via db/seed-rbac.sql;
 * this module is the enforcement source of truth for server routes.
 */
export const PERMISSIONS = [
  "workspace.read",
  "workspace.manage",
  "client.read",
  "client.manage",
  "content.read",
  "content.write",
  "content.approve",
  "content.publish",
  "media.read",
  "media.write",
  "task.read",
  "task.write",
  "inbox.read",
  "inbox.write",
  "analytics.read",
  "report.export",
  "integration.manage",
  "automation.manage",
  "admin.view",
  "admin.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = [
  "super_admin",
  "workspace_admin",
  "social_media_manager",
  "content_writer",
  "graphic_designer",
  "video_editor",
  "approver",
  "analyst",
  "client_viewer",
] as const;

export type RoleKey = (typeof ROLES)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  super_admin: "Super Admin",
  workspace_admin: "Workspace Admin",
  social_media_manager: "Social Media Manager",
  content_writer: "Content Writer",
  graphic_designer: "Graphic Designer",
  video_editor: "Video Editor",
  approver: "Approver",
  analyst: "Analyst",
  client_viewer: "Client Viewer",
};

const ALL: Permission[] = [...PERMISSIONS];

const WRITER: Permission[] = [
  "workspace.read",
  "client.read",
  "content.read",
  "content.write",
  "media.read",
  "media.write",
  "task.read",
  "task.write",
];

export const ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  super_admin: ALL,
  workspace_admin: ALL.filter((p) => p !== "admin.manage" && p !== "admin.view"),
  social_media_manager: [
    "workspace.read",
    "client.read",
    "content.read",
    "content.write",
    "content.publish",
    "media.read",
    "media.write",
    "task.read",
    "task.write",
    "inbox.read",
    "inbox.write",
    "analytics.read",
    "report.export",
    "automation.manage",
  ],
  content_writer: WRITER,
  graphic_designer: WRITER,
  video_editor: WRITER,
  approver: [
    "workspace.read",
    "client.read",
    "content.read",
    "content.approve",
    "content.publish",
    "media.read",
    "task.read",
    "task.write",
    "analytics.read",
  ],
  analyst: [
    "workspace.read",
    "client.read",
    "content.read",
    "media.read",
    "task.read",
    "analytics.read",
    "report.export",
  ],
  client_viewer: ["workspace.read", "content.read", "media.read", "analytics.read", "task.read"],
};

export function can(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  if (role === "super_admin") return true;
  const list = ROLE_PERMISSIONS[role as RoleKey];
  return Boolean(list && list.includes(permission));
}

export function isRole(value: string): value is RoleKey {
  return (ROLES as readonly string[]).includes(value);
}

export const ROLE_RANK: Record<RoleKey, number> = {
  super_admin: 100,
  workspace_admin: 90,
  social_media_manager: 80,
  approver: 75,
  content_writer: 70,
  graphic_designer: 70,
  video_editor: 70,
  analyst: 60,
  client_viewer: 20,
};
