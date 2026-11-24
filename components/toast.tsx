"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Toast = { id: number; title: string; description?: string; tone: "success" | "error" | "info" };
type ToastContextValue = {
  push: (toast: Omit<Toast, "id">) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((toast: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5200);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (title, description) => push({ title, description, tone: "success" }),
      error: (title, description) => push({ title, description, tone: "error" }),
      info: (title, description) => push({ title, description, tone: "info" }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-5 right-5 z-[120] flex w-[330px] flex-col gap-2 no-print">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "panel flex items-start gap-2.5 p-3 text-[12.5px] animate-in",
              toast.tone === "success" && "border-emerald-500/40",
              toast.tone === "error" && "border-rose-500/40",
            )}
          >
            <span className="mt-0.5">
              {toast.tone === "success" ? (
                <CheckCircle2 size={15} className="text-emerald-400" />
              ) : toast.tone === "error" ? (
                <TriangleAlert size={15} className="text-rose-400" />
              ) : (
                <Info size={15} className="text-sky-400" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">{toast.title}</p>
              {toast.description && <p className="mt-0.5 text-[var(--muted)] leading-snug break-words">{toast.description}</p>}
            </div>
            <button
              className="text-[var(--muted)] hover:text-[var(--fg)]"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      push: () => undefined,
      success: () => undefined,
      error: () => undefined,
      info: () => undefined,
    };
  }
  return ctx;
}
