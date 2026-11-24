import { all } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { aiStatus } from "@/lib/ai";
import { AiConsole } from "@/components/ai-console";
import { Banner, PageHeader } from "@/components/ui";

export default async function AiAssistantPage() {
  const ctx = await requirePermission("content.read");
  const clients = all<{ id: string; name: string }>("SELECT id, name FROM clients WHERE workspace_id = ? ORDER BY name", [ctx.workspace.id]);
  const providers = await aiStatus();

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Operate"
        title="AI Content Assistant"
        description="Ideas, captions, hooks, hashtags, scripts, plans and evidence-based recommendations — using your brand voice and only your real metrics."
      />
      <Banner tone="info" title="Honest AI boundaries">
        The assistant never invents reach, engagement or follower numbers: performance modes receive a database snapshot and are
        instructed to use only those values. Output is always editable and never auto-published. Connect Ollama (local, free) or an
        OpenAI-compatible endpoint for model-quality text; otherwise the deterministic template engine responds.
      </Banner>
      <AiConsole clients={clients} providers={providers} />
    </div>
  );
}
