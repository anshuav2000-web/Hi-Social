import Link from "next/link";
import { BookOpen, Cable, Database, KeyRound, Rocket, ShieldCheck, Table2, Workflow } from "lucide-react";
import { Badge, Card, PageHeader, SectionHeader, Banner } from "@/components/ui";

const SECTIONS = [
  { id: "start", title: "Getting started", icon: Rocket },
  { id: "workflow", title: "Daily workflow", icon: Workflow },
  { id: "meta", title: "Connecting Meta", icon: Cable },
  { id: "publishing", title: "Publishing engine", icon: ShieldCheck },
  { id: "excel", title: "Excel & CSV", icon: Table2 },
  { id: "data", title: "Data model", icon: Database },
  { id: "env", title: "Environment variables", icon: KeyRound },
  { id: "limits", title: "Known limits", icon: BookOpen },
];

const ENV_VARS = [
  ["APP_ORIGIN", "OAuth callbacks and absolute links", "http://localhost:3000"],
  ["APP_ENCRYPTION_KEY", "AES-256-GCM key for stored OAuth tokens", "generated locally if unset"],
  ["WORKER_SECRET", "Bearer token for /api/v1/scheduler/tick", "unset (session auth only)"],
  ["DATABASE_PATH", "SQLite file location", "./data/socialhub.db"],
  ["STORAGE_DIR", "Uploads directory", "./storage/uploads"],
  ["SEED_DEMO", "Seed the demo workspace on first boot", "true"],
  ["ENABLE_INPROCESS_SCHEDULER", "Run the publishing loop inside the app server", "true"],
  ["SCHEDULER_INTERVAL_SECONDS", "Worker tick interval", "20"],
  ["META_APP_ID / META_APP_SECRET", "Meta developer app credentials", "unset → sandbox mode"],
  ["META_REDIRECT_URI", "Must match the Meta app OAuth redirect", "<origin>/api/v1/integrations/meta/callback"],
  ["META_GRAPH_VERSION", "Graph API version", "v23.0"],
  ["META_WEBHOOK_VERIFY_TOKEN", "Webhook handshake token", "unset"],
  ["OLLAMA_BASE_URL / OLLAMA_MODEL", "Local LLM inference", "unset → template engine"],
  ["OPENAI_COMPATIBLE_*", "Optional external LLM adapter", "unset"],
  ["SMTP_URL / SMTP_FROM", "Email delivery for notifications", "unset → in-app only"],
];

export default function DocsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Help"
        title="Documentation & Help"
        description="How SocialHub Pro behaves, what it can and cannot do, and exactly which credentials unlock the real integrations."
        meta={<Badge status="approved">docs version 1.0</Badge>}
      />

      <nav className="flex flex-wrap gap-1.5">
        {SECTIONS.map((section) => (
          <a key={section.id} href={`#${section.id}`} className="chip">
            <section.icon size={11} /> {section.title}
          </a>
        ))}
      </nav>

      <Card id="start">
        <SectionHeader title="Getting started" description="Four steps from zero to a working calendar." />
        <ol className="mt-3 space-y-2 text-[12.5px] leading-relaxed">
          <li><span className="font-semibold">1. Sign in.</span> Demo build ships with seeded users. The admin account is <span className="font-mono">admin@socialhubpro.app</span> / <span className="font-mono">SocialHub!2026</span>. Change or create real accounts via <Link className="text-[var(--accent)]" href="/register">registration</Link>.</li>
          <li><span className="font-semibold">2. Create brands.</span> Brands carry approval rules, brand voice and connected accounts. Everything else hangs off a brand.</li>
          <li><span className="font-semibold">3. Plan content.</span> Use the calendar (click any date) or Content Studio. A plan needs only a title and a date — captions and creative can arrive later.</li>
          <li><span className="font-semibold">4. Connect Meta when ready.</span> Until then everything runs in sandbox: posts, jobs and metrics are recorded but nothing is sent to the platform.</li>
        </ol>
      </Card>

      <Card id="workflow">
        <SectionHeader title="Daily workflow" description="How the modules fit together." />
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {[
            ["Plan", "Calendar / Post Planner / Content Studio — status moves Idea → Planned → Draft → In creation."],
            ["Brief & assign", "Brief tab stores the objective, creative requirements and the writer / designer / reviewer."],
            ["Produce", "Tasks board tracks writing, design and video work with dependencies, checklists and comments."],
            ["Approve", "Approvals Center runs every stage configured on the client. All stages must pass."],
            ["Schedule", "Scheduler validates the post, then persists a publishing job with an idempotency key."],
            ["Publish", "The worker delivers live via Graph API or records a sandbox delivery, then stores platform ids."],
            ["Measure", "Analytics reads account_metrics and post_metrics; reports snapshot the aggregates."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5">
              <p className="text-[12px] font-medium">{title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--muted)]">{body}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card id="meta">
        <SectionHeader title="Connecting Meta" description="The full path, including what you must do in the Meta dashboard." />
        <ol className="mt-3 list-inside list-decimal space-y-1.5 text-[12.5px] leading-relaxed">
          <li>Create a Business app at developers.facebook.com and add Facebook Login for Business plus the Instagram product.</li>
          <li>Add the exact redirect URI shown in Integrations to Valid OAuth Redirect URIs.</li>
          <li>Set META_APP_ID, META_APP_SECRET, META_REDIRECT_URI, META_GRAPH_VERSION and META_WEBHOOK_VERIFY_TOKEN, then restart.</li>
          <li>Add the webhook callback /api/v1/webhooks/meta and subscribe to comments (messages require extra permissions).</li>
          <li>Click “Connect with Facebook”. The callback exchanges the code, stores encrypted tokens and imports Pages plus linked Instagram professional accounts.</li>
          <li>Request App Review for instagram_content_publish, instagram_manage_comments and pages_manage_posts. Until it is granted, only app admins/testers can publish.</li>
          <li>Run a history sync per account to import up to 90 days of insights.</li>
        </ol>
        <Banner tone="warning" title="App Review is external">
          SocialHub Pro cannot complete Meta App Review for you. Nothing in this app claims a pending review is complete; a post is
          only marked live when the Graph API returns an external post id.
        </Banner>
      </Card>

      <Card id="publishing">
        <SectionHeader title="Publishing engine" description="Durability, retries and idempotency." />
        <ul className="mt-3 space-y-1.5 text-[12.5px] leading-relaxed">
          <li>• Jobs live in <span className="font-mono">publishing_jobs</span>. The unique idempotency key is post + account + run time, so rescheduling the same slot cannot double-publish.</li>
          <li>• Rescheduling cancels any earlier queued job for that post before inserting the new one.</li>
          <li>• Failures back off 1 → 5 → 15 → 60 → 240 minutes, then move to dead letter. Meta rate-limit codes requeue without consuming attempts.</li>
          <li>• Pre-flight validation blocks empty captions, over-limit captions, unapproved posts, carousels with fewer than two assets and unsupported platforms.</li>
          <li>• The scheduler runs in-process every 20s by default and can also be driven by <span className="font-mono">node scripts/worker.mjs</span> in Docker.</li>
          <li>• Sandbox delivery sets <span className="font-mono">published_posts.channel = sandbox</span> with no external id. It is never presented as a live Meta post.</li>
        </ul>
      </Card>

      <Card id="excel">
        <SectionHeader title="Excel & CSV" description="Template columns and import behaviour." />
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted)]">
          Download the template from Reports & Exports. Headers: Post Title, Client, Campaign, Platform, Content Type, Content Pillar,
          Content Brief, Caption, Hashtags, Creative Link, Assigned Writer, Assigned Designer, Reviewer, Priority, Deadline, Publish
          Date, Publish Time, Timezone, Approval Status, Publishing Status, Post ID.
        </p>
        <ul className="mt-2 space-y-1 text-[12px] leading-relaxed">
          <li>• Only Post Title and Platform are required. Unknown clients/campaigns/assignees produce warnings, not silent data loss.</li>
          <li>• Validation rejects unsupported platforms, bad date/time formats, duplicates inside the file and duplicates already in the workspace.</li>
          <li>• Validate first (dry run), then commit. Imports always create drafts and never publish.</li>
          <li>• Optional scheduling on import is skipped when the client requires approval; the row still imports as a draft.</li>
        </ul>
      </Card>

      <Card id="data">
        <SectionHeader title="Data model" description="Normalized tables, UUID keys, workspace ownership." />
        <p className="mt-2 text-[12.5px] leading-relaxed">
          Every tenant-owned row carries <span className="font-mono">workspace_id</span>; queries are scoped server-side and client
          viewers are additionally filtered by <span className="font-mono">client_scope</span>. Metrics live in{" "}
          <span className="font-mono">account_metrics</span> and <span className="font-mono">post_metrics</span> with a{" "}
          <span className="font-mono">source</span> column (<span className="font-mono">meta | demo | manual</span>) so provenance is
          always visible. Unavailable metrics are NULL, never 0.
        </p>
        <p className="mt-2 text-[12px] text-[var(--muted)]">
          Full table list and relationships: <span className="font-mono">docs/DATABASE.md</span>. Schema source of truth:{" "}
          <span className="font-mono">db/schema.sql</span>.
        </p>
      </Card>

      <Card id="env">
        <SectionHeader title="Environment variables" description="Everything this deployment reads." />
        <div className="table-wrap mt-3">
          <table className="grid">
            <thead><tr><th>Variable</th><th>Purpose</th><th>Default</th></tr></thead>
            <tbody>
              {ENV_VARS.map(([name, purpose, fallback]) => (
                <tr key={name}>
                  <td className="font-mono text-[10.5px]">{name}</td>
                  <td className="text-[11.5px] text-[var(--muted)]">{purpose}</td>
                  <td className="font-mono text-[10px] text-[var(--muted)]">{fallback}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card id="limits">
        <SectionHeader title="Known limits" description="Stated plainly rather than hidden behind a spinner." />
        <ul className="mt-3 space-y-1.5 text-[12.5px] leading-relaxed">
          <li>• SocialHub Pro currently publishes live for <strong>Instagram</strong> and <strong>Facebook Pages</strong> only. LinkedIn, YouTube, TikTok, X, Pinterest and Threads are modelled in the schema and UI but have no live publisher.</li>
          <li>• Direct messages require additional Meta permissions; only comment threads are answered through the API.</li>
          <li>• PDF export is a print-optimised HTML view (browser → Save as PDF); no PDF binary is generated server-side.</li>
          <li>• Email and browser push are off unless SMTP is configured; in-app notifications always work.</li>
          <li>• The local database is SQLite. A Postgres/Supabase deployment path is documented but the bundled runtime ships SQLite for zero-dependency local use.</li>
          <li>• Historical metrics depend on platform retention; Meta may refuse windows longer than 90 days for some metrics.</li>
        </ul>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          ["README.md", "Install, run, first login"],
          ["ARCHITECTURE.md", "Modules, data flow, decisions"],
          ["DEPLOYMENT.md", "Docker, Coolify, backups"],
          ["META_SETUP.md", "App Review and permissions"],
          ["SECURITY.md", "Tenancy, tokens, RLS intent"],
          ["API.md", "REST surface and errors"],
        ].map(([file, description]) => (
          <div key={file} className="panel p-3">
            <p className="font-mono text-[11.5px]">{file}</p>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">{description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
