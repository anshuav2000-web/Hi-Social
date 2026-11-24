import { describe, expect, it } from "vitest";
import { can, PERMISSIONS, ROLE_PERMISSIONS, ROLES } from "@/lib/rbac";

describe("RBAC matrix", () => {
  it("defines permissions for every role and nothing unknown", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...ROLES].sort());
    for (const role of ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
  });

  it("gives super admins every permission", () => {
    for (const permission of PERMISSIONS) {
      expect(can("super_admin", permission)).toBe(true);
    }
  });

  it("keeps client viewers read-only and scoped", () => {
    expect(can("client_viewer", "content.read")).toBe(true);
    expect(can("client_viewer", "content.write")).toBe(false);
    expect(can("client_viewer", "content.publish")).toBe(false);
    expect(can("client_viewer", "content.approve")).toBe(false);
    expect(can("client_viewer", "client.manage")).toBe(false);
    expect(can("client_viewer", "integration.manage")).toBe(false);
    expect(can("client_viewer", "admin.view")).toBe(false);
  });

  it("does not let workspace admins reach platform administration", () => {
    expect(can("workspace_admin", "workspace.manage")).toBe(true);
    expect(can("workspace_admin", "client.manage")).toBe(true);
    expect(can("workspace_admin", "integration.manage")).toBe(true);
    expect(can("workspace_admin", "workspace.manage")).toBe(true);
    expect(can("workspace_admin", "admin.view")).toBe(false);
  });

  it("does not let analysts publish or approve", () => {
    expect(can("analyst", "analytics.read")).toBe(true);
    expect(can("analyst", "report.export")).toBe(true);
    expect(can("analyst", "content.publish")).toBe(false);
    expect(can("analyst", "content.approve")).toBe(false);
  });

  it("denies unknown or missing roles", () => {
    expect(can(null, "content.read")).toBe(false);
    expect(can(undefined, "content.read")).toBe(false);
    expect(can("intern_from_mars", "content.read")).toBe(false);
  });
});
