"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { ResourceManager, type Lookups } from "@/components/resource-manager";
import { useToast } from "@/components/toast";

export function HashtagManager({ lookups, canWrite }: { lookups: Lookups; canWrite: boolean }) {
  const toast = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (row: Record<string, unknown>) => {
    const tags = String(row.tags ?? "");
    try {
      await navigator.clipboard.writeText(tags);
      setCopied(String(row.id));
      toast.success("Hashtags copied", `${tags.split(/\s+/).filter(Boolean).length} tags`);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.error("Clipboard unavailable in this browser context");
    }
  };

  return (
    <ResourceManager
      resourceKey="hashtags"
      lookups={lookups}
      canWrite={canWrite}
      extraColumns={[
        {
          key: "__copy",
          header: "",
          width: "44px",
          align: "right",
          render: (row) => (
            <button
              className="btn btn-ghost btn-sm btn-icon"
              onClick={(event) => {
                event.stopPropagation();
                void copy(row);
              }}
              aria-label="Copy hashtags"
              title="Copy hashtags"
            >
              {copied === String(row.id) ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
          ),
        },
      ]}
    />
  );
}
