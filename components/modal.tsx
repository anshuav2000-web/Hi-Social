"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: "max-w-[420px]", md: "max-w-[560px]", lg: "max-w-[760px]", xl: "max-w-[1040px]" };

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto bg-black/65 p-4 py-[6vh] backdrop-blur-sm" onClick={onClose}>
      <div className={cn("panel w-full animate-in", widths[size])} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-3.5">
          <div>
            <h3 className="text-[15px] font-semibold">{title}</h3>
            {description && <p className="mt-0.5 text-[12px] text-[var(--muted)]">{description}</p>}
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon btn-sm" aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmButton({
  onConfirm,
  children,
  className = "btn btn-danger btn-sm",
  message = "Are you sure? This cannot be undone.",
}: {
  onConfirm: () => void;
  children: ReactNode;
  className?: string;
  message?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (window.confirm(message)) onConfirm();
      }}
    >
      {children}
    </button>
  );
}
