"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Facebook,
  Instagram,
  Link2,
  Loader2,
  Plug,
  RefreshCw,
  ShieldCheck,
  Unplug,
  KeyRound,
} from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Banner, Card, EmptyState, PlatformDot, SectionHeader } from "@/components/ui";
import { useToast } from "@/components/toast";
import { formatDateTime, label, timeAgo } from "@/lib/utils";

type Account = {
  id: string;
  name: string;
  platform: string;
  account_type: string;
  external_id: string;
  status: string;
  client_id: string | null;
  scopes: string | null;
  token_expires_at: string | null;
  token_count: number;
  followers_count: number | null;
  last_synced_at: string | null;
  connected_at: string;
};

type Config = {
  configured: boolean;
  graphVersion: string;
  redirectUri: string;
  webhookVerifyTokenSet: boolean;
  appSecretSet: boolean;
  facebookLoginEnabled: boolean;
  instagramLoginEnabled: boolean;
};

type SyncJob = {
  id: string;
  account_name: string | null;
  kind: string;
  status: string;
  progress: number;
  records: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

type Webhook = { id: string; event: string; status: string; signature_valid: number; created_at: string; error: string | null };

const WIZARD = [
  {
    title: "1 · Create a Meta developer app",
    body: "developers.facebook.com → My Apps → Create App. Choose “Business” as the use case. Record the App ID and App Secret.",
  },
  {
    title: "2 · Add the required products",
    body: "Add “Facebook Login for Business” and (optionally) “Instagram” with the Instagram API setup. These expose the OAuth dialogs used here.",
  },
  {
    title: "3 · Configure OAuth redirect URIs",
    body: "Facebook Login → Settings → Valid OAuth Redirect URIs. Add exactly the callback URL shown above. It must match META_REDIRECT_URI.",
  },
  {
    title: "4 · Set environment variables",
    body: "Set META_APP_ID, META_APP_SECRET, META_REDIRECT_URI, META_GRAPH_VERSION and META_WEBHOOK_VERIFY_TOKEN, then restart the app.",
  },
  {
    title: "5 · Configure the webhook",
    body: "Webhooks → Page/Instagram → Callback URL https://<origin>/api/v1/webhooks/meta, verify token as configured. Subscribe to comments and messages fields.",
  },
  {
    title: "6 · Request permissions",
    body: "pages_show_list, pages_read_engagement, pages_manage_posts, pages_manage_engagement, read_insights, instagram_basic, instagram_content_publish, instagram_manage_comments, instagram_manage_insights, business_management.",
  },
  {
    title: "7 · Connect a Facebook Page",
    body: "Use “Connect with Facebook”. The callback discovers pages, stores an encrypted page token and links the Page's Instagram professional account automatically.",
  },
  {
    title: "8 · Link the Instagram professional account",
    body: "Instagram accounts must be Business or Creator and linked to the Page. Unlinked accounts are ignored — they cannot be published to.",
  },
  {
    title: "9 · Complete App Review",
    body: "Instagram content publishing and comment management require App Review with a screencast. Until approved, only admins/testers can authorise publishing.",
  },
  {
    title: "10 · Switch to live",
    body: "After review, move the app to Live mode. Sandbox accounts here become live after reauthorisation; scheduled jobs pick the live channel automatically.",
  },
];

export function IntegrationsClient({
  config,
  accounts: initialAccounts,
  syncs: initialSyncs,
  webhooks,
  permissionSets,
  canManage,
}: {
  config: Config;
  accounts: Account[];
  syncs: SyncJob[];
  webhooks: Webhook[];
  permissionSets: { facebook: string[]; instagramViaFacebook: string[]; instagramLogin: string[] };
  canManage: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [syncs, setSyncs] = useState(initialSyncs);
  const [busy, setBusy] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [syncNotes, setSyncNotes] = useState<string[]>([]);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [tokenValue, setTokenValue] = useState("");
  const [tokenBusy, setTokenBusy] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenResult, setTokenResult] = useState<{ imported: number; accounts: { platform: string; name: string }[] } | null>(null);

  const importToken = async () => {
    setTokenBusy(true);
    setTokenError(null);
    setTokenResult(null);
    const res = await api<{ imported: number; accounts: { platform: string; name: string }[] }>(
      "/api/v1/integrations/meta/token",
      { method: "POST", json: { token: tokenValue.trim() } },
    );
    setTokenBusy(false);
    if (!res.ok) {
      setTokenError(res.error);
      return;
    }
    setTokenResult(res.data);
    toast.success(`Connected ${res.data.imported} account(s)`);
    setTokenValue("");
    router.refresh();
  };

  const startOauth = async (flow: "facebook" | "instagram") => {
    setBusy(flow);
    const res = await api<{ url: string }>("/api/v1/integrations/meta/start", { method: "POST", json: { flow } });
    setBusy(null);
    if (!res.ok) {
      toast.error("Cannot start OAuth", res.error);
      return;
    }
    window.location.href = res.data.url;
  };

  const sync = async (account: Account, kind: "history" | "insights" | "comments") => {
    setBusy(`${account.id}:${kind}`);
    setSyncNotes([]);
    const res = await api<{ records: number; notes: string[] }>("/api/v1/integrations/meta/sync", {
      method: "POST",
      json: { accountId: account.id, kind },
    });
    setBusy(null);
    if (!res.ok) {
      toast.error("Sync failed", res.error);
      return;
    }
    setSyncNotes(res.data.notes);
    toast.success(`Imported ${res.data.records} record(s)`);
    setSyncs((prev) => [
      {
        id: `local-${Date.now()}`,
        account_name: account.name,
        kind,
        status: "succeeded",
        progress: 100,
        records: res.data.records,
        error: null,
        created_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      },
      ...prev,
    ]);
  };

  const disconnect = async (account: Account) => {
    if (!window.confirm(`Disconnect ${account.name}? Stored tokens are deleted and publishing falls back to sandbox.`)) return;
    setBusy(account.id);
    const res = await api("/api/v1/integrations/meta", { method: "POST", json: { accountId: account.id, action: "disconnect" } });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, status: "disconnected", token_count: 0 } : a)));
    toast.success("Account disconnected");
  };

  return (
    <div className="space-y-4">
      {!config.configured && (
        <Banner tone="warning" title="Meta is not configured on this deployment">
          Set <span className="font-mono">META_APP_ID</span> and <span className="font-mono">META_APP_SECRET</span>, then restart.
          Until then every account stays in sandbox mode: posts are recorded but never delivered to Meta. Follow the setup wizard
          below — nothing here pretends App Review is complete.
        </Banner>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <SectionHeader
            title="Meta configuration"
            description="Read from the server environment. Secrets are never sent to the browser."
            actions={<Badge status={config.configured ? "published" : "failed"}>{config.configured ? "Configured" : "Not configured"}</Badge>}
          />
          <dl className="mt-3 space-y-1.5 text-[11.5px]">
            {[
              ["Graph API version", config.graphVersion],
              ["Redirect URI", config.redirectUri],
              ["App secret", config.appSecretSet ? "set" : "missing"],
              ["Webhook verify token", config.webhookVerifyTokenSet ? "set" : "missing"],
              ["Facebook Login flow", config.facebookLoginEnabled ? "enabled" : "disabled"],
              ["Instagram Login flow", config.instagramLoginEnabled ? "enabled" : "disabled"],
              ["Webhook endpoint", "/api/v1/webhooks/meta"],
            ].map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-1.5 last:border-0">
                <dt className="text-[var(--muted)]">{key}</dt>
                <dd className="truncate font-mono text-[10.5px]">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button className="btn btn-primary btn-sm" onClick={() => startOauth("facebook")} disabled={!canManage || busy !== null}>
              {busy === "facebook" ? <Loader2 size={12} className="animate-spin" /> : <Facebook size={12} />} Connect with Facebook
            </button>
            <button className="btn btn-sm" onClick={() => startOauth("instagram")} disabled={!canManage || busy !== null || !config.instagramLoginEnabled}>
              {busy === "instagram" ? <Loader2 size={12} className="animate-spin" /> : <Instagram size={12} />} Instagram Login
            </button>
            <button className="btn btn-sm" onClick={() => setWizardOpen((v) => !v)}>
              <ShieldCheck size={12} /> Setup wizard
            </button>
            <button className="btn btn-sm" onClick={() => { setTokenValue(""); setTokenError(null); setTokenResult(null); setTokenOpen(true); }}>
              <KeyRound size={12} /> Use a system-user token
            </button>
            <a className="btn btn-sm" href="https://developers.facebook.com/docs/" target="_blank" rel="noreferrer">
              <ExternalLink size={12} /> Meta docs
            </a>
          </div>
          <div className="mt-2 rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5 text-[10.5px] leading-relaxed text-[var(--muted)]">
            Permissions requested by the Facebook flow: {permissionSets.instagramViaFacebook.join(", ")}. Instagram Login scope:
            {" "}{permissionSets.instagramLogin.join(", ")}. Permission models are never mixed: each flow keeps its own scopes.
          </div>
        </Card>

        <Card>
          <SectionHeader title="Connected accounts" description="Tokens are encrypted with AES-256-GCM before storage." />
          {accounts.length === 0 ? (
            <EmptyState title="No social accounts" description="Connect Facebook to discover Pages and linked Instagram professional accounts." icon={<Plug size={18} />} />
          ) : (
            <div className="mt-3 space-y-2">
              {accounts.map((account) => {
                const tokenExpired = account.token_expires_at ? new Date(account.token_expires_at) < new Date() : false;
                return (
                  <div key={account.id} className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-[12.5px] font-medium">{account.name}</p>
                          <PlatformDot platform={account.platform} />
                        </div>
                        <p className="text-[10.5px] text-[var(--muted)]">
                          {account.account_type} · id {account.external_id} · {account.followers_count ? `${account.followers_count} followers` : "followers unknown"}
                        </p>
                        <p className="text-[10px] text-[var(--muted)]">
                          tokens stored: {account.token_count} · expires {account.token_expires_at ? formatDateTime(account.token_expires_at) : "no expiry"} ·{" "}
                          synced {account.last_synced_at ? timeAgo(account.last_synced_at) : "never"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge status={account.status === "connected" ? "published" : tokenExpired ? "failed" : "draft"}>
                          {account.status === "connected" ? "Live" : label(account.status)}
                        </Badge>
                        {tokenExpired && <span className="text-[9.5px] text-rose-300">token expired</span>}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(["history", "insights", "comments"] as const).map((kind) => (
                        <button
                          key={kind}
                          className="btn btn-sm"
                          onClick={() => sync(account, kind)}
                          disabled={!canManage || busy !== null}
                        >
                          {busy === `${account.id}:${kind}` ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} {kind}
                        </button>
                      ))}
                      <button className="btn btn-sm" onClick={() => startOauth(account.platform === "instagram" ? "instagram" : "facebook")} disabled={!canManage}>
                        <Link2 size={10} /> Reauthorize
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => disconnect(account)} disabled={!canManage || busy !== null}>
                        <Unplug size={10} /> Disconnect
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {syncNotes.length > 0 && (
            <div className="mt-2 space-y-1 rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2 text-[10.5px] text-[var(--muted)]">
              {syncNotes.map((note, index) => <p key={index}>• {note}</p>)}
            </div>
          )}
        </Card>
      </div>

      {wizardOpen && (
        <Card>
          <SectionHeader
            title="Meta Integration Setup Wizard"
            description="Ten steps from an empty developer account to live publishing. Each step names the exact dashboard location."
            actions={
              <button className="btn btn-sm" onClick={() => setWizardOpen(false)}>Hide</button>
            }
          />
          <ol className="mt-3 grid gap-2 md:grid-cols-2">
            {WIZARD.map((step) => (
              <li key={step.title} className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5">
                <p className="text-[12px] font-medium">{step.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--muted)]">{step.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
            App Review is a manual Meta process. SocialHub Pro cannot complete it for you and never claims it is done. Publishing
            stays in sandbox until a live token exists on a connected account.
          </div>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-0 overflow-hidden">
          <div className="border-b border-[var(--line)] px-4 py-2.5">
            <p className="text-[13px] font-semibold">Sync history</p>
            <p className="text-[11px] text-[var(--muted)]">Historical imports attempt a 90-day window; retention differs per metric.</p>
          </div>
          <div className="table-wrap">
            <table className="grid">
              <thead><tr>{["Account", "Kind", "Status", "Records", "When", "Note"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {syncs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.account_name ?? "—"}</td>
                    <td className="text-[11px]">{job.kind}</td>
                    <td><Badge status={job.status === "succeeded" ? "published" : job.status === "failed" ? "failed" : "running"}>{job.status}</Badge></td>
                    <td className="text-[11px]">{job.records}</td>
                    <td className="text-[10.5px] text-[var(--muted)]">{timeAgo(job.created_at)}</td>
                    <td className="max-w-[220px] truncate text-[10.5px] text-[var(--muted)]">{job.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {syncs.length === 0 && <p className="px-4 py-6 text-center text-[12px] text-[var(--muted)]">No sync runs yet.</p>}
        </Card>

        <Card className="p-0 overflow-hidden">
          <div className="border-b border-[var(--line)] px-4 py-2.5">
            <p className="text-[13px] font-semibold">Webhook deliveries</p>
            <p className="text-[11px] text-[var(--muted)]">Signature-verified events, deduplicated by provider + entry id.</p>
          </div>
          <div className="table-wrap">
            <table className="grid">
              <thead><tr>{["Event", "Signature", "Status", "When"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {webhooks.map((hook) => (
                  <tr key={hook.id}>
                    <td className="text-[11.5px]">{hook.event}</td>
                    <td>
                      {hook.signature_valid ? (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-400"><CheckCircle2 size={11} /> valid</span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-rose-400"><AlertTriangle size={11} /> invalid</span>
                      )}
                    </td>
                    <td><Badge status={hook.status === "processed" ? "published" : hook.status === "failed" ? "failed" : "pending"}>{hook.status}</Badge></td>
                    <td className="text-[10.5px] text-[var(--muted)]">{timeAgo(hook.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {webhooks.length === 0 && <p className="px-4 py-6 text-center text-[12px] text-[var(--muted)]">No webhook events received.</p>}
        </Card>
      </div>

      {tokenOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setTokenOpen(false)}>
          <div className="w-full max-w-[560px] rounded-xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold">Connect with a system-user token</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
              Use this when the OAuth dialog cannot complete — for example the signing-in Facebook account has no role on
              the app. Generate a token in Meta Business settings → System users → <strong>Generate token</strong>, tick at
              least <span className="font-mono">pages_show_list</span> (plus publishing and insights scopes), then paste it here.
              It is verified, exchanged for a Page token and stored encrypted.
            </p>
            <textarea
              className="textarea mt-3 w-full font-mono text-[11px]"
              rows={4}
              value={tokenValue}
              onChange={(e) => setTokenValue(e.target.value)}
              placeholder="EAAh…"
              autoComplete="off"
            />
            {tokenError && (
              <div className="mt-2 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">{tokenError}</div>
            )}
            {tokenResult && (
              <div className="mt-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-200">
                Connected {tokenResult.imported} account(s):{" "}
                {tokenResult.accounts.map((a) => `${a.name} (${a.platform})`).join(", ")}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-1.5">
              <button className="btn btn-sm" onClick={() => setTokenOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={importToken} disabled={tokenBusy || tokenValue.trim().length < 50}>
                {tokenBusy ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />} Verify and connect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
