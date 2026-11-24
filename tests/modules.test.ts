import { describe, expect, it } from "vitest";
import { buildSchema, RESOURCES, RESOURCE_MAP } from "@/lib/modules";
import { PERMISSIONS } from "@/lib/rbac";

describe("resource registry", () => {
  it("has unique keys and tables", () => {
    const keys = RESOURCES.map((resource) => resource.key);
    const tables = RESOURCES.map((resource) => resource.table);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(tables).size).toBe(tables.length);
    for (const key of keys) {
      expect(RESOURCE_MAP[key]).toBeDefined();
    }
  });

  it("maps every resource to real permissions", () => {
    for (const resource of RESOURCES) {
      expect(PERMISSIONS).toContain(resource.read);
      expect(PERMISSIONS).toContain(resource.write);
      expect(resource.fields.length).toBeGreaterThan(0);
      expect(resource.searchColumns.length).toBeGreaterThan(0);
    }
  });

  it("rejects unknown fields (strict schemas)", () => {
    const schema = buildSchema(RESOURCE_MAP.clients);
    const result = schema.safeParse({ name: "Lumina", not_a_column: "nope" });
    expect(result.success).toBe(false);
  });

  it("requires the mandatory fields", () => {
    expect(buildSchema(RESOURCE_MAP.clients).safeParse({}).success).toBe(false);
    expect(buildSchema(RESOURCE_MAP.clients).safeParse({ name: "Lumina" }).success).toBe(true);

    const campaign = buildSchema(RESOURCE_MAP.campaigns);
    expect(campaign.safeParse({ name: "Winter Glow" }).success).toBe(false);
    expect(campaign.safeParse({ name: "Winter Glow", client_id: "c_lumina" }).success).toBe(true);
  });

  it("allows empty partial payloads for PATCH", () => {
    for (const resource of RESOURCES) {
      expect(buildSchema(resource, true).safeParse({}).success).toBe(true);
    }
  });
});
