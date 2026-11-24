/**
 * Client-safe resource registry. Drives both the generic REST endpoints
 * (/api/v1/data/[resource]) and the table/form UI, so every module gets real
 * validation, persistence, permissions and audit logging without duplicated code.
 */
import { z } from "zod";
import type { Permission } from "@/lib/rbac";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "date"
  | "datetime"
  | "boolean"
  | "tags"
  | "email"
  | "url"
  | "user"
  | "client"
  | "campaign"
  | "post"
  | "color";

export type Field = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  help?: string;
  hideInTable?: boolean;
  hideInForm?: boolean;
  width?: string;
  defaultValue?: string | number | boolean;
  allowNull?: boolean;
};

export type ResourceDef = {
  key: string;
  table: string;
  label: string;
  singular: string;
  description: string;
  read: Permission;
  write: Permission;
  fields: Field[];
  searchColumns: string[];
  defaultSort: string;
  order: "ASC" | "DESC";
  softDeleteColumn?: string;
  filters?: { name: string; label: string; column: string; options?: { value: string; label: string }[] }[];
};

const STATUS_OPTIONS = (values: string[], labels: Record<string, string>) =>
  values.map((v) => ({ value: v, label: labels[v] ?? v }));

const CLIENT_STATUS = STATUS_OPTIONS(["active", "paused", "archived"], {
  active: "Active",
  paused: "Paused",
  archived: "Archived",
});

const PRIORITY = STATUS_OPTIONS(["low", "medium", "high", "urgent"], {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
});

export const RESOURCES: ResourceDef[] = [
  {
    key: "clients",
    table: "clients",
    label: "Brands",
    singular: "Brand",
    description: "Brands with guidelines, approval rules and connected accounts.",
    read: "client.read",
    write: "client.manage",
    searchColumns: ["name", "industry", "contact_name", "contact_email"],
    defaultSort: "created_at",
    order: "DESC",
    fields: [
      { name: "name", label: "Brand name", type: "text", required: true },
      { name: "industry", label: "Industry", type: "text" },
      { name: "website", label: "Website", type: "url" },
      { name: "contact_name", label: "Contact name", type: "text", hideInTable: true },
      { name: "contact_email", label: "Contact email", type: "email", hideInTable: true },
      { name: "status", label: "Status", type: "select", options: CLIENT_STATUS, defaultValue: "active" },
      { name: "approval_required", label: "Requires approval", type: "boolean", defaultValue: true, hideInTable: true },
      { name: "approval_stages", label: "Approval stages", type: "text", defaultValue: "internal_review,client_approval", hideInTable: true, help: "Comma-separated stage keys." },
      { name: "color", label: "Accent", type: "color", defaultValue: "#1677FF", hideInTable: true },
      { name: "notes", label: "Notes", type: "textarea", hideInTable: true },
    ],
    filters: [{ name: "status", label: "Status", column: "status", options: CLIENT_STATUS }],
  },
  {
    key: "campaigns",
    table: "campaigns",
    label: "Campaigns",
    singular: "Campaign",
    description: "Campaign objectives, deliverables and flight dates.",
    read: "content.read",
    write: "content.write",
    searchColumns: ["name", "objective", "audience"],
    defaultSort: "created_at",
    order: "DESC",
    fields: [
      { name: "name", label: "Campaign", type: "text", required: true },
      { name: "client_id", label: "Brand", type: "client", required: true },
      { name: "objective", label: "Objective", type: "select", options: STATUS_OPTIONS(["awareness", "engagement", "conversion", "retention"], { awareness: "Awareness", engagement: "Engagement", conversion: "Conversion", retention: "Retention" }) },
      { name: "status", label: "Status", type: "select", options: STATUS_OPTIONS(["draft", "planned", "active", "completed", "paused"], { draft: "Draft", planned: "Planned", active: "Active", completed: "Completed", paused: "Paused" }), defaultValue: "draft" },
      { name: "start_date", label: "Start", type: "date" },
      { name: "end_date", label: "End", type: "date" },
      { name: "budget_cents", label: "Budget (cents)", type: "number", hideInTable: true },
      { name: "currency", label: "Currency", type: "text", defaultValue: "USD", hideInTable: true },
      { name: "platforms", label: "Platforms", type: "tags", hideInTable: true, help: "Comma-separated, e.g. instagram,facebook" },
      { name: "audience", label: "Audience", type: "textarea", hideInTable: true },
      { name: "deliverables", label: "Deliverables", type: "textarea", hideInTable: true },
      { name: "notes", label: "Notes", type: "textarea", hideInTable: true },
    ],
    filters: [{ name: "status", label: "Status", column: "status" }],
  },
  {
    key: "content-ideas",
    table: "content_ideas",
    label: "Content ideas",
    singular: "Idea",
    description: "The unscheduled backlog feeding the calendar.",
    read: "content.read",
    write: "content.write",
    searchColumns: ["title", "idea", "pillar"],
    defaultSort: "created_at",
    order: "DESC",
    fields: [
      { name: "title", label: "Idea", type: "text", required: true },
      { name: "client_id", label: "Brand", type: "client" },
      { name: "platform", label: "Platform", type: "select", options: STATUS_OPTIONS(["instagram", "facebook", "linkedin", "youtube", "tiktok", "x", "pinterest", "threads"], { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", youtube: "YouTube", tiktok: "TikTok", x: "X", pinterest: "Pinterest", threads: "Threads" }) },
      { name: "pillar", label: "Pillar", type: "text" },
      { name: "status", label: "Status", type: "select", options: STATUS_OPTIONS(["open", "planned", "used", "dropped"], { open: "Open", planned: "Planned", used: "Used", dropped: "Dropped" }), defaultValue: "open" },
      { name: "idea", label: "Concept", type: "textarea" },
      { name: "audience", label: "Audience", type: "text", hideInTable: true },
    ],
    filters: [{ name: "status", label: "Status", column: "status" }],
  },
  {
    key: "tasks",
    table: "tasks",
    label: "Tasks",
    singular: "Task",
    description: "Production tasks with owners, dependencies and deadlines.",
    read: "task.read",
    write: "task.write",
    searchColumns: ["title", "description"],
    defaultSort: "due_date",
    order: "ASC",
    fields: [
      { name: "title", label: "Task", type: "text", required: true },
      { name: "kind", label: "Type", type: "select", options: STATUS_OPTIONS(["writing", "design", "video", "review", "other"], { writing: "Writing", design: "Design", video: "Video", review: "Review", other: "Other" }), defaultValue: "other" },
      { name: "status", label: "Status", type: "select", options: STATUS_OPTIONS(["todo", "in_progress", "review", "done"], { todo: "To do", in_progress: "In progress", review: "Review", done: "Done" }), defaultValue: "todo" },
      { name: "priority", label: "Priority", type: "select", options: PRIORITY, defaultValue: "medium" },
      { name: "assignee_id", label: "Assignee", type: "user" },
      { name: "client_id", label: "Brand", type: "client", hideInTable: true },
      { name: "post_id", label: "Linked post", type: "post", hideInTable: true },
      { name: "due_date", label: "Due", type: "datetime" },
      { name: "description", label: "Description", type: "textarea", hideInTable: true },
    ],
    filters: [
      { name: "status", label: "Status", column: "status" },
      { name: "priority", label: "Priority", column: "priority", options: PRIORITY },
    ],
  },
  {
    key: "hashtags",
    table: "hashtag_collections",
    label: "Hashtag collections",
    singular: "Collection",
    description: "Reusable hashtag sets per brand and platform.",
    read: "content.read",
    write: "content.write",
    searchColumns: ["name", "tags"],
    defaultSort: "created_at",
    order: "DESC",
    fields: [
      { name: "name", label: "Collection", type: "text", required: true },
      { name: "client_id", label: "Brand", type: "client" },
      { name: "platform", label: "Platform", type: "select", options: STATUS_OPTIONS(["instagram", "facebook", "linkedin", "tiktok", "threads", "x"], { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok", threads: "Threads", x: "X" }) },
      { name: "tags", label: "Hashtags", type: "textarea", required: true },
      { name: "notes", label: "Notes", type: "textarea", hideInTable: true },
    ],
  },
  {
    key: "competitors",
    table: "competitor_profiles",
    label: "Competitors",
    singular: "Competitor",
    description: "Public competitor profiles used for manual benchmarking.",
    read: "analytics.read",
    write: "content.write",
    searchColumns: ["name", "handle", "notes"],
    defaultSort: "created_at",
    order: "DESC",
    fields: [
      { name: "name", label: "Competitor", type: "text", required: true },
      { name: "client_id", label: "Brand", type: "client" },
      { name: "platform", label: "Platform", type: "select", options: STATUS_OPTIONS(["instagram", "facebook", "linkedin", "youtube", "tiktok", "x", "pinterest", "threads"], { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", youtube: "YouTube", tiktok: "TikTok", x: "X", pinterest: "Pinterest", threads: "Threads" }) },
      { name: "handle", label: "Handle", type: "text" },
      { name: "url", label: "Profile URL", type: "url", hideInTable: true },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "references",
    table: "competitor_references",
    label: "Inspiration library",
    singular: "Reference",
    description: "Saved public posts and creative references.",
    read: "analytics.read",
    write: "content.write",
    searchColumns: ["title", "notes", "tags"],
    defaultSort: "saved_at",
    order: "DESC",
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "competitor_id", label: "Competitor", type: "text", hideInTable: true, help: "Competitor ID from the competitors list." },
      { name: "platform", label: "Platform", type: "text" },
      { name: "url", label: "Public URL", type: "url" },
      { name: "tags", label: "Tags", type: "tags" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "media-folders",
    table: "media_folders",
    label: "Media folders",
    singular: "Folder",
    description: "Organise the media library by brand and campaign.",
    read: "media.read",
    write: "media.write",
    searchColumns: ["name"],
    defaultSort: "created_at",
    order: "ASC",
    fields: [
      { name: "name", label: "Folder", type: "text", required: true },
      { name: "client_id", label: "Brand", type: "client" },
    ],
  },
];

export const RESOURCE_MAP = Object.fromEntries(RESOURCES.map((r) => [r.key, r])) as Record<string, ResourceDef>;

export function zodForField(field: Field): z.ZodTypeAny {
  let schema: z.ZodTypeAny;
  switch (field.type) {
    case "number":
      schema = z.coerce.number().int().min(-2_000_000_000).max(2_000_000_000);
      break;
    case "boolean":
      schema = z.coerce.boolean();
      break;
    case "email":
      schema = z.string().email().max(200);
      break;
    case "url":
      schema = z.string().url().max(500);
      break;
    case "date":
      schema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
      break;
    case "datetime":
      schema = z.string().min(4).max(40);
      break;
    case "select":
      schema = field.options?.length
        ? z.enum(field.options.map((o) => o.value) as [string, ...string[]])
        : z.string().max(60);
      break;
    case "textarea":
      schema = z.string().max(20_000);
      break;
    default:
      schema = z.string().max(500);
  }
  if (!field.required) schema = schema.nullish();
  if (field.allowNull) schema = schema.nullish();
  return schema;
}

export function buildSchema(resource: ResourceDef, partial = false) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of resource.fields) {
    const base = zodForField(field);
    shape[field.name] = partial ? base.optional() : field.required ? base : base.optional();
  }
  return z.object(shape).strict();
}

export const NAV_GROUPS: { label: string; items: { href: string; label: string; icon: string; permission?: Permission }[] }[] = [
  {
    label: "Operate",
    items: [
      { href: "/dashboard", label: "Overview", icon: "LayoutDashboard" },
      { href: "/analytics", label: "Analytics Center", icon: "BarChart3", permission: "analytics.read" },
      { href: "/content-studio", label: "Content Studio", icon: "PenSquare", permission: "content.read" },
      { href: "/ai-assistant", label: "AI Assistant", icon: "Sparkles" },
      { href: "/calendar", label: "Calendar", icon: "CalendarDays", permission: "content.read" },
      { href: "/post-planner", label: "Post Planner", icon: "KanbanSquare", permission: "content.read" },
    ],
  },
  {
    label: "Publish",
    items: [
      { href: "/scheduler", label: "Scheduler", icon: "Clock", permission: "content.publish" },
      { href: "/publishing-queue", label: "Publishing Queue", icon: "ListChecks", permission: "content.publish" },
      { href: "/media-library", label: "Media Library", icon: "Images", permission: "media.read" },
      { href: "/inbox", label: "Unified Inbox", icon: "Inbox", permission: "inbox.read" },
      { href: "/comments", label: "Comments", icon: "MessageSquare", permission: "inbox.read" },
      { href: "/hashtag-manager", label: "Hashtag Manager", icon: "Hash", permission: "content.read" },
    ],
  },
  {
    label: "Brands & team",
    items: [
      { href: "/campaigns", label: "Campaigns", icon: "Megaphone", permission: "content.read" },
      { href: "/clients", label: "Brands", icon: "Building2", permission: "client.read" },
      { href: "/team", label: "Team", icon: "Users", permission: "workspace.read" },
      { href: "/tasks", label: "Tasks", icon: "CheckSquare", permission: "task.read" },
      { href: "/approvals", label: "Approvals", icon: "ShieldCheck", permission: "content.read" },
      { href: "/automations", label: "Automations", icon: "Workflow", permission: "automation.manage" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/competitor-research", label: "Competitor Research", icon: "Telescope", permission: "analytics.read" },
      { href: "/reports", label: "Reports & Exports", icon: "FileSpreadsheet", permission: "analytics.read" },
      { href: "/integrations", label: "Integrations", icon: "Plug", permission: "integration.manage" },
      { href: "/notifications", label: "Notifications", icon: "Bell" },
      { href: "/admin", label: "Admin Control", icon: "ShieldAlert", permission: "admin.view" },
      { href: "/settings", label: "Settings", icon: "Settings", permission: "workspace.read" },
      { href: "/docs", label: "Docs & Help", icon: "BookOpen" },
    ],
  },
];
