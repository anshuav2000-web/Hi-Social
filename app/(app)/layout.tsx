import { requireAuth } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import { NAV_GROUPS } from "@/lib/modules";
import { AppShell, type NavGroup } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAuth();

  const groups: NavGroup[] = NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.items
      .filter((item) => !item.permission || hasPermission(ctx, item.permission))
      .map(({ href, label, icon }) => ({ href, label, icon })),
  })).filter((group) => group.items.length > 0);

  return (
    <AppShell
      user={{
        id: ctx.user.id,
        full_name: ctx.user.full_name,
        email: ctx.user.email,
        avatar_color: ctx.user.avatar_color,
      }}
      workspace={{
        id: ctx.workspace.id,
        name: ctx.workspace.name,
        role_label: ctx.workspace.role_label,
        is_demo: ctx.workspace.is_demo,
      }}
      workspaces={ctx.workspaces.map((w) => ({ id: w.id, name: w.name, role_label: w.role_label, is_demo: w.is_demo }))}
      groups={groups}
    >
      {children}
    </AppShell>
  );
}
