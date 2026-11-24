"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Command,
  FileSpreadsheet,
  Hash,
  Images,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Moon,
  PenSquare,
  Plug,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  Telescope,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { api } from "@/lib/client";

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  LayoutDashboard,
  BarChart3,
  PenSquare,
  Sparkles,
  CalendarDays,
  KanbanSquare,
  Clock,
  ListChecks,
  Images,
  Inbox,
  MessageSquare,
  Hash,
  Megaphone,
  Building2,
  Users,
  CheckSquare,
  ShieldCheck,
  Workflow,
  Telescope,
  FileSpreadsheet,
  Plug,
  Bell,
  ShieldAlert,
  Settings,
  BookOpen,
};

export type NavGroup = { label: string; items: { href: string; label: string; icon: string }[] };

export type ShellUser = { id: string; full_name: string; email: string; avatar_color: string };
export type ShellWorkspace = { id: string; name: string; role_label: string; is_demo: number };

type SearchGroup = { label: string; items: { id: string; title: string; subtitle: string; href: string }[] };

export function AppShell({
  user,
  workspace,
  workspaces,
  groups,
  children,
}: {
  user: ShellUser;
  workspace: ShellWorkspace;
  workspaces: ShellWorkspace[];
  groups: NavGroup[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("shp_theme");
    const next = stored === "light" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("light", next === "light");
    setCollapsed(localStorage.getItem("shp_sidebar") === "collapsed");
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setNotifOpen(false);
    setUserOpen(false);
    setWsOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (meta && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleCollapsed();
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
        setMobileOpen(false);
      }
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem("shp_sidebar", prev ? "expanded" : "collapsed");
      return !prev;
    });
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("shp_theme", next);
    document.documentElement.classList.toggle("light", next === "light");
  };

  const switchWorkspace = async (id: string) => {
    await api("/api/v1/workspaces/switch", { method: "POST", json: { workspaceId: id } });
    setWsOpen(false);
    router.refresh();
  };

  const signOut = async () => {
    await api("/api/v1/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const sidebarWidth = collapsed ? "lg:w-[68px]" : "lg:w-[252px]";

  return (
    <div className="min-h-screen app-bg">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col border-r border-[var(--line)] bg-[var(--navy)]/95 backdrop-blur-xl transition-all duration-200",
          sidebarWidth,
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-14 items-center gap-2 px-3.5 border-b border-[var(--line)]">
          <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#2a86ff] to-[#0b4fd1] text-white shadow-[0_8px_18px_-10px_rgba(22,119,255,0.9)]">
              <Zap size={16} strokeWidth={2.6} />
            </span>
            {!collapsed && (
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold leading-tight tracking-tight">SocialHub Pro</span>
                <span className="block text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Social OS</span>
              </span>
            )}
          </Link>
          <button className="ml-auto text-[var(--muted)] hover:text-[var(--fg)] lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {groups.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]/80">{group.label}</p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = ICONS[item.icon] ?? LayoutDashboard;
                  const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        data-active={active}
                        className={cn("nav-item", collapsed && "justify-center px-0")}
                        title={collapsed ? item.label : undefined}
                      >
                        <Icon size={15} className={active ? "text-[var(--accent)]" : "opacity-80"} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-[var(--line)] p-2">
          <button
            onClick={toggleCollapsed}
            className="nav-item w-full justify-start hidden lg:flex"
            title="Toggle sidebar (Ctrl/⌘ + B)"
          >
            {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
            {!collapsed && <span>Collapse sidebar</span>}
          </button>
        </div>
      </aside>

      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Main column */}
      <div className={cn("transition-all duration-200", collapsed ? "lg:pl-[68px]" : "lg:pl-[252px]")}>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-[var(--line)] bg-[var(--bg)]/85 px-3 backdrop-blur-xl sm:px-5 no-print">
          <button className="btn btn-ghost btn-icon lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={17} />
          </button>

          <button
            onClick={() => setPaletteOpen(true)}
            className="group flex h-9 flex-1 max-w-md items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--card-2)] px-3 text-left text-[12.5px] text-[var(--muted)] hover:border-[var(--line-strong)]"
          >
            <Search size={14} />
            <span className="flex-1 truncate">Search posts, clients, tasks…</span>
            <kbd className="hidden sm:flex items-center gap-0.5 rounded border border-[var(--line)] bg-[var(--navy)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
              <Command size={9} /> K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <div className="relative hidden md:block">
              <button className="btn btn-sm" onClick={() => setWsOpen((v) => !v)}>
                <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
                <span className="max-w-[150px] truncate">{workspace.name}</span>
                <ChevronDown size={12} />
              </button>
              {wsOpen && (
                <div className="panel absolute right-0 mt-1.5 w-64 p-1.5 z-50">
                  <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">Workspaces</p>
                  {workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => switchWorkspace(ws.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-[var(--card-3)]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{ws.name}</span>
                        <span className="block text-[10.5px] text-[var(--muted)]">{ws.role_label}</span>
                      </span>
                      {ws.id === workspace.id && <Check size={13} className="text-[var(--accent)]" />}
                    </button>
                  ))}
                  <div className="divider my-1.5" />
                  <Link href="/settings" className="block rounded-lg px-2 py-1.5 text-[12px] text-[var(--muted)] hover:bg-[var(--card-3)]">
                    Workspace settings
                  </Link>
                </div>
              )}
            </div>

            {workspace.is_demo === 1 && (
              <span className="badge hidden sm:inline-flex border-amber-500/35 text-amber-300 bg-amber-500/10" title="Demo data and sandbox publishing">
                Sandbox
              </span>
            )}

            <button onClick={toggleTheme} className="btn btn-ghost btn-icon" title="Toggle theme" aria-label="Toggle theme">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <NotificationsMenu open={notifOpen} setOpen={setNotifOpen} />

            <div className="relative">
              <button className="flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--card-2)] p-0.5 pr-1.5 hover:border-[var(--line-strong)]" onClick={() => setUserOpen((v) => !v)}>
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                  style={{ background: `linear-gradient(140deg, ${user.avatar_color}, #0a1424)` }}
                >
                  {initials(user.full_name)}
                </span>
                <ChevronDown size={11} className="text-[var(--muted)]" />
              </button>
              {userOpen && (
                <div className="panel absolute right-0 mt-1.5 w-60 p-1.5 z-50">
                  <div className="px-2 py-1.5">
                    <p className="text-[13px] font-medium truncate">{user.full_name}</p>
                    <p className="text-[11px] text-[var(--muted)] truncate">{user.email}</p>
                    <p className="mt-1 text-[10.5px] text-[var(--accent)]">{workspace.role_label}</p>
                  </div>
                  <div className="divider my-1" />
                  <Link href="/settings" className="block rounded-lg px-2 py-1.5 text-[12.5px] text-[var(--muted)] hover:bg-[var(--card-3)]">
                    Account & workspace settings
                  </Link>
                  <Link href="/docs" className="block rounded-lg px-2 py-1.5 text-[12.5px] text-[var(--muted)] hover:bg-[var(--card-3)]">
                    Documentation
                  </Link>
                  <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-rose-300 hover:bg-[var(--card-3)]">
                    <LogOut size={13} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} groups={groups} />}
    </div>
  );
}

function NotificationsMenu({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const [items, setItems] = useState<{ id: string; title: string; body: string | null; link: string | null; is_read: number; created_at: string }[]>([]);
  const [unread, setUnread] = useState(0);
  const loaded = useRef(false);

  const load = useCallback(async () => {
    const res = await api<{ rows: typeof items; unread: number }>("/api/v1/notifications?limit=12");
    if (res.ok) {
      setItems(res.data.rows);
      setUnread(res.data.unread);
      loaded.current = true;
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const markAll = async () => {
    await api("/api/v1/notifications", { method: "POST", json: { action: "read_all" } });
    setUnread(0);
    setItems((prev) => prev.map((i) => ({ ...i, is_read: 1 })));
  };

  return (
    <div className="relative">
      <button className="btn btn-ghost btn-icon relative" onClick={() => setOpen(!open)} aria-label="Notifications">
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[9px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="panel absolute right-0 mt-1.5 w-[330px] z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--line)]">
            <p className="text-[12.5px] font-semibold">Notifications</p>
            <button onClick={markAll} className="text-[11px] text-[var(--accent)] hover:underline">
              Mark all read
            </button>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {items.length === 0 && <p className="px-3 py-6 text-center text-[12px] text-[var(--muted)]">No notifications yet.</p>}
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.link ?? "/notifications"}
                className={cn("block px-3 py-2.5 border-b border-[var(--line)] last:border-0 hover:bg-[var(--card-3)]", !item.is_read && "bg-[var(--brand-soft)]")}
                onClick={() => setOpen(false)}
              >
                <p className="text-[12.5px] font-medium">{item.title}</p>
                {item.body && <p className="mt-0.5 text-[11.5px] text-[var(--muted)] line-clamp-2">{item.body}</p>}
                <p className="mt-1 text-[10px] text-[var(--muted)]">{new Date(item.created_at).toLocaleString("en-US")}</p>
              </Link>
            ))}
          </div>
          <Link href="/notifications" className="block px-3 py-2 text-center text-[11.5px] text-[var(--accent)] border-t border-[var(--line)]">
            Open notification center
          </Link>
        </div>
      )}
    </div>
  );
}

function CommandPalette({ onClose, groups }: { onClose: () => void; groups: NavGroup[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      const res = await api<{ groups: SearchGroup[] }>(`/api/v1/search?q=${encodeURIComponent(query)}`);
      if (active) {
        setResults(res.ok ? res.data.groups : []);
        setLoading(false);
      }
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const navMatches = useMemo(() => {
    const flat = groups.flatMap((g) => g.items);
    if (!query.trim()) return flat;
    return flat.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()));
  }, [groups, query]);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 p-4 pt-[10vh] backdrop-blur-sm" onClick={onClose}>
      <div className="panel w-full max-w-[620px] overflow-hidden animate-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2.5">
          <Search size={15} className="text-[var(--muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or jump to a module…"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--muted)]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && navMatches[0]) {
                router.push(navMatches[0].href);
                onClose();
              }
            }}
          />
          <kbd className="rounded border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">ESC</kbd>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {loading && <p className="px-2 py-2 text-[12px] text-[var(--muted)]">Searching…</p>}
          {results.map((group) => (
            <div key={group.label} className="mb-2">
              <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">{group.label}</p>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    router.push(item.href);
                    onClose();
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--card-3)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px]">{item.title}</span>
                    <span className="block truncate text-[11px] text-[var(--muted)]">{item.subtitle}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
          {!loading && results.length === 0 && (
            <div>
              <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">Navigate</p>
              {navMatches.slice(0, 9).map((item) => (
                <button
                  key={item.href}
                  onClick={() => {
                    router.push(item.href);
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-[var(--card-3)]"
                >
                  <span className="text-[var(--muted)]">↗</span>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
