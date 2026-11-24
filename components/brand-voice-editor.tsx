"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/client";
import { useToast } from "@/components/toast";
import { Card, EmptyState, SectionHeader } from "@/components/ui";

type Profile = {
  brand_name: string;
  personality: string;
  tone: string;
  audience: string;
  industry: string;
  languages: string;
  writing_style: string;
  words_to_avoid: string;
  content_rules: string;
  competitor_refs: string;
  guidelines_url: string;
};

const EMPTY: Profile = {
  brand_name: "",
  personality: "",
  tone: "",
  audience: "",
  industry: "",
  languages: "",
  writing_style: "",
  words_to_avoid: "",
  content_rules: "",
  competitor_refs: "",
  guidelines_url: "",
};

const FIELDS: { key: keyof Profile; label: string; hint?: string; textarea?: boolean }[] = [
  { key: "personality", label: "Brand personality", hint: "e.g. warm, confident, quietly premium" },
  { key: "tone", label: "Tone of voice", hint: "How it should sound in one line" },
  { key: "audience", label: "Target audience", textarea: true },
  { key: "industry", label: "Industry" },
  { key: "languages", label: "Languages", hint: "Comma separated" },
  { key: "writing_style", label: "Writing style", textarea: true },
  { key: "words_to_avoid", label: "Words to avoid", textarea: true },
  { key: "content_rules", label: "Content rules", textarea: true },
  { key: "competitor_refs", label: "Competitor references" },
  { key: "guidelines_url", label: "Guidelines URL" },
];

export function BrandVoiceEditor({ clients, canWrite }: { clients: { id: string; name: string }[]; canWrite: boolean }) {
  const toast = useToast();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exists, setExists] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let active = true;
    setLoading(true);
    api<{ profile: Profile | null; client: { name: string } }>(`/api/v1/brand-profiles?clientId=${clientId}`).then((res) => {
      if (!active) return;
      setLoading(false);
      if (res.ok) {
        const p = res.data.profile;
        setExists(Boolean(p));
        setProfile(
          p
            ? {
                brand_name: p.brand_name ?? res.data.client.name,
                personality: p.personality ?? "",
                tone: p.tone ?? "",
                audience: p.audience ?? "",
                industry: p.industry ?? "",
                languages: p.languages ?? "",
                writing_style: p.writing_style ?? "",
                words_to_avoid: p.words_to_avoid ?? "",
                content_rules: p.content_rules ?? "",
                competitor_refs: p.competitor_refs ?? "",
                guidelines_url: p.guidelines_url ?? "",
              }
            : { ...EMPTY, brand_name: res.data.client.name },
        );
      }
    });
    return () => {
      active = false;
    };
  }, [clientId]);

  const save = async () => {
    setSaving(true);
    const res = await api("/api/v1/brand-profiles", { method: "PUT", json: { clientId, ...profile, brand_name: profile.brand_name || "Brand" } });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setExists(true);
    toast.success("Brand voice saved", "The AI assistant now uses these rules.");
  };

  if (clients.length === 0) {
    return (
      <Card>
        <EmptyState title="No clients yet" description="Create a client first — brand voice is stored per client." icon={<Sparkles size={18} />} />
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        title="Brand voice"
        description="Every AI generation for this client follows these rules. Stored in brand_profiles."
        actions={
          <select className="select h-8 w-auto text-[12px]" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        }
      />
      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-16" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Brand name</label>
              <input className="input" value={profile.brand_name} onChange={(e) => setProfile({ ...profile, brand_name: e.target.value })} disabled={!canWrite} />
            </div>
            {FIELDS.map((field) => (
              <div key={field.key} className={field.textarea ? "sm:col-span-2" : undefined}>
                <label className="label">{field.label}</label>
                {field.textarea ? (
                  <textarea
                    className="textarea"
                    rows={2}
                    value={profile[field.key]}
                    onChange={(e) => setProfile({ ...profile, [field.key]: e.target.value })}
                    disabled={!canWrite}
                    placeholder={field.hint}
                  />
                ) : (
                  <input
                    className="input"
                    value={profile[field.key]}
                    onChange={(e) => setProfile({ ...profile, [field.key]: e.target.value })}
                    disabled={!canWrite}
                    placeholder={field.hint}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[11px] text-[var(--muted)]">
              {exists ? "Saved profile — edits create an audit entry." : "No profile saved yet for this client."}
            </p>
            {canWrite && (
              <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save brand voice"}
              </button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
