import { requirePermission, hasPermission } from "@/lib/auth";
import { workspaceLookups } from "@/lib/lookups";
import { HashtagManager } from "@/components/hashtag-manager";
import { Banner, PageHeader } from "@/components/ui";

export default async function HashtagManagerPage() {
  const ctx = await requirePermission("content.read");
  const lookups = workspaceLookups(ctx.workspace.id);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Publishing"
        title="Hashtag Manager"
        description="Reusable hashtag sets per client and platform, ready to copy into a caption. Sets are stored in hashtag_collections."
      />
      <Banner tone="info" title="How sets are used">
        Collections are a library, not an automated injector. Copy a set into a post, then trim it — repetition across posts
        is the most common cause of reach loss. AI hashtag suggestions respect these collections when you pick a client.
      </Banner>
      <HashtagManager lookups={lookups} canWrite={hasPermission(ctx, "content.write")} />
    </div>
  );
}
