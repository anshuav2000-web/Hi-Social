"use client";

import { useState } from "react";
import { Copy, Loader2, Sparkles, Wand2 } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Banner, Card, SectionHeader } from "@/components/ui";
import { useToast } from "@/components/toast";
import { PLATFORMS } from "@/lib/utils";

type Provider = { provider: string; configured: boolean; reachable: boolean | null; detail: string };

const MODES: { key: string; label: string; hint: string }[] = [
  { key: "caption", label: "Caption", hint: "One caption with hook, value and CTA" },
  { key: "captions", label: "3 caption variations", hint: "Three different hook angles" },
  { key: "hook", label: "Hooks", hint: "Scroll-stopping first lines" },
  { key: "hashtags", label: "Hashtags", hint: "Broad, niche and branded sets" },
  { key: "cta", label: "Calls to action", hint: "Specific, platform-native CTAs" },
  { key: "idea", label: "Content ideas", hint: "Six concepts with formats" },
  { key: "reel_script", label: "Reel script", hint: "Beats, on-screen text, shot list" },
  { key: "carousel_outline", label: "Carousel outline", hint: "Six-slide structure" },
  { key: "weekly_plan", label: "Weekly plan", hint: "Seven days, formats and CTAs" },
  { key: "monthly_calendar", label: "Monthly calendar", hint: "Four weekly themes" },
  { key: "campaign_ideas", label: "Campaign ideas", hint: "Concept, hero asset, metric" },
  { key: "brief", label: "Content brief", hint: "Objective, message, deliverables" },
  { key: "creative_direction", label: "Creative direction", hint: "Palette, type, composition" },
  { key: "repurpose", label: "Repurpose", hint: "Carousel + reel + text from one idea" },
  { key: "rewrite", label: "Rewrite", hint: "Tighter, more concrete copy" },
  { key: "tone", label: "Tone shift", hint: "Same meaning, new register" },
  { key: "gap_analysis", label: "Content gap analysis", hint: "Uses verified metrics only" },
  { key: "performance_advice", label: "Performance recommendations", hint: "Hypotheses from your real numbers" },
];

export function AiConsole({
  clients,
  providers,
}: {
  clients: { id: string; name: string }[];
  providers: Provider[];
}) {
  const toast = useToast();
  const [mode, setMode] = useState("caption");
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [contentType, setContentType] = useState("image");
  const [tone, setTone] = useState("");
  const [audience, setAudience] = useState("");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [result, setResult] = useState("");
  const [provider, setProvider] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<{ mode: string; text: string; at: string }[]>([]);
  const [metricsUsed, setMetricsUsed] = useState<Record<string, unknown> | null>(null);

  const run = async () => {
    if (!topic.trim()) {
      toast.error("Describe the topic first");
      return;
    }
    setLoading(true);
    const res = await api<{ provider: string; text: string; note?: string; metricsUsed?: Record<string, unknown> }>("/api/v1/ai", {
      method: "POST",
      json: { mode, topic, platform, contentType, tone: tone || undefined, audience: audience || undefined, clientId: clientId || undefined },
    });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setResult(res.data.text);
    setProvider(res.data.provider);
    setNote(res.data.note ?? null);
    setMetricsUsed(res.data.metricsUsed ?? null);
    setHistory((prev) => [{ mode, text: res.data.text, at: new Date().toISOString() }, ...prev].slice(0, 8));
  };

  const active = MODES.find((m) => m.key === mode);

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-3">
        <Card>
          <SectionHeader title="Brief" description="Everything here is optional except the topic." />
          <div className="mt-3 space-y-2.5">
            <div>
              <label className="label">What is it about?</label>
              <textarea className="textarea" rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Winter Glow launch: barrier repair duo for cold weather" />
            </div>
            <div>
              <label className="label">Task</label>
              <select className="select" value={mode} onChange={(e) => setMode(e.target.value)}>
                {MODES.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
              <p className="mt-1 text-[10.5px] text-[var(--muted)]">{active?.hint}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Platform</label>
                <select className="select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                  {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Format</label>
                <select className="select" value={contentType} onChange={(e) => setContentType(e.target.value)}>
                  {["image", "carousel", "reel", "video", "story", "text", "link"].map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Brand voice</label>
              <select className="select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">No brand voice</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
              <p className="mt-1 text-[10.5px] text-[var(--muted)]">Pulls the saved brand profile: tone, audience, words to avoid, content rules.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Tone override</label>
                <input className="input" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="dry, warm…" />
              </div>
              <div>
                <label className="label">Audience</label>
                <input className="input" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="returning members" />
              </div>
            </div>
            <button className="btn btn-primary w-full" onClick={run} disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Generate
            </button>
          </div>
        </Card>

        <Card>
          <SectionHeader title="Providers" description="Order of preference is configurable." />
          <div className="mt-2 space-y-1.5">
            {providers.map((item) => (
              <div key={item.provider} className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] px-2.5 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium capitalize">{item.provider}</span>
                  <Badge status={item.reachable || item.configured ? "approved" : "draft"}>
                    {item.provider === "template" ? "always on" : item.reachable ? "reachable" : item.configured ? "configured" : "not configured"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[10px] text-[var(--muted)]">{item.detail}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-3">
        <Card className="min-h-[320px]">
          <SectionHeader
            title="Output"
            description="Always editable. Nothing is posted or scheduled without an explicit human action."
            actions={provider ? <Badge status="published">generated by {provider}</Badge> : undefined}
          />
          {note && <div className="mt-3"><Banner tone="info" title="Provider note">{note}</Banner></div>}
          {result ? (
            <>
              <textarea className="textarea mt-3 min-h-[280px] font-mono text-[12.5px]" value={result} onChange={(e) => setResult(e.target.value)} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(result).then(() => toast.success("Copied"))}>
                  <Copy size={11} /> Copy
                </button>
                <a className="btn btn-sm" href={`/content-studio?new=1`}>
                  <Sparkles size={11} /> Create a post with this
                </a>
                <button className="btn btn-sm" onClick={run} disabled={loading}>Regenerate</button>
              </div>
            </>
          ) : (
            <div className="mt-6 flex flex-col items-center justify-center py-12 text-center">
              <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--card-2)] text-[var(--accent)]">
                <Sparkles size={18} />
              </span>
              <p className="text-[13px] font-medium">Nothing generated yet</p>
              <p className="mt-1 max-w-sm text-[11.5px] text-[var(--muted)]">
                Describe the topic on the left. With no LLM configured, the deterministic template engine returns structured,
                usable copy and never invents analytics.
              </p>
            </div>
          )}
        </Card>

        {metricsUsed && (
          <Card>
            <SectionHeader title="Verified metrics supplied to the model" description="These numbers come from this workspace's database." />
            <pre className="mt-2 max-h-[240px] overflow-auto rounded-lg border border-[var(--line)] bg-[var(--navy)] p-3 text-[10.5px] leading-relaxed text-[var(--muted)]">
              {JSON.stringify(metricsUsed, null, 2)}
            </pre>
          </Card>
        )}

        {history.length > 0 && (
          <Card>
            <SectionHeader title="Session history" description="Not persisted — copy anything you want to keep." />
            <div className="mt-2 space-y-1.5">
              {history.map((item, index) => (
                <button
                  key={index}
                  className="block w-full rounded-lg border border-[var(--line)] bg-[var(--card-2)] px-2.5 py-1.5 text-left hover:border-[var(--line-strong)]"
                  onClick={() => { setResult(item.text); setMode(item.mode); }}
                >
                  <p className="text-[10.5px] text-[var(--muted)]">{item.mode} · {new Date(item.at).toLocaleTimeString("en-US")}</p>
                  <p className="line-clamp-2 text-[11.5px]">{item.text}</p>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
