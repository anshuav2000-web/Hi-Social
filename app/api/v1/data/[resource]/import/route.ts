import { handleApiError, ok, fail } from "@/lib/http";
import { guard } from "@/lib/api-guard";
import { RESOURCE_MAP, type ResourceDef } from "@/lib/modules";
import { buildSchema } from "@/lib/modules";
import { createResource } from "@/lib/repo";
import { requestIp } from "@/lib/http";
import { parseImportFile, type ImportRow } from "@/lib/excel";
import { extractDocxText } from "@/lib/docx";
import { all } from "@/lib/db";

type Params = { params: Promise<{ resource: string }> };

/** Map a spreadsheet header to a registry field, by label or by field name. */
function mapRow(def: ResourceDef, row: ImportRow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of def.fields) {
    const key = Object.keys(row).find(
      (k) => k.toLowerCase() === field.label.toLowerCase() || k.toLowerCase() === field.name.toLowerCase(),
    );
    if (!key) continue;
    const value = String(row[key] ?? "").trim();
    if (value !== "") out[field.name] = value;
  }
  return out;
}

/**
 * Turn Word-doc paragraphs into rows. A line ending in ":" sets the category for
 * the lines that follow when the resource has an `industry` field — which is how
 * brand lists are usually written.
 */
function docxRows(def: ResourceDef, paragraphs: string[], knownIndustries: Set<string>): ImportRow[] {
  const industryField = def.fields.find((f) => f.name === "industry");
  const target = def.fields.find((f) => f.required)?.name ?? def.fields[0]?.name;
  if (!target) return [];
  let category = "";
  const rows: ImportRow[] = [];
  for (const line of paragraphs) {
    const heading = line.replace(/[:：]\s*$/, "");
    const isHeading = Boolean(industryField) && (/:$/.test(line) || knownIndustries.has(heading));
    if (isHeading) {
      category = heading;
      continue;
    }
    const row: ImportRow = { [target]: line };
    if (industryField && category) row[industryField.name] = category;
    rows.push(row);
  }
  return rows;
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { resource: key } = await params;
    const def = RESOURCE_MAP[key];
    if (!def) return fail(`Unknown resource “${key}”`, 404, "unknown_resource");
    const ctx = await guard(def.write);

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof File)) {
      return fail("Attach a .xlsx, .csv or .docx file", 422, "validation_failed");
    }
    const filename = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    let rows: ImportRow[];
    if (filename.endsWith(".docx")) {
      const known = new Set(
        all<{ industry: string | null }>(`SELECT DISTINCT industry FROM ${def.table} WHERE workspace_id = ? AND industry IS NOT NULL`, [
          ctx.workspace.id,
        ]).map((r) => r.industry!),
      );
      rows = docxRows(def, (await extractDocxText(buffer)).paragraphs, known);
    } else if (filename.endsWith(".xlsx") || filename.endsWith(".csv")) {
      rows = (await parseImportFile(buffer, file.name)).rows;
    } else {
      return fail("Unsupported file type. Use .xlsx, .csv or .docx", 422, "validation_failed");
    }

    if (rows.length === 0) return fail("No rows found in that file", 422, "empty_file");

    const schema = buildSchema(def);
    const imported: Record<string, unknown>[] = [];
    const errors: { row: number; message: string }[] = [];

    rows.forEach((row, index) => {
      const candidate = mapRow(def, row);
      const parsed = schema.safeParse(candidate);
      if (!parsed.success) {
        errors.push({
          row: index + 2,
          message: parsed.error.issues.map((i) => `${i.path.join(".") || "row"}: ${i.message}`).join("; "),
        });
        return;
      }
      try {
        imported.push(createResource(ctx, def, parsed.data as Record<string, unknown>, requestIp(req)));
      } catch (err) {
        errors.push({ row: index + 2, message: err instanceof Error ? err.message : "insert failed" });
      }
    });

    return ok({ imported: imported.length, rejected: errors.length, errors: errors.slice(0, 50), rows: rows.length });
  } catch (err) {
    return handleApiError(err);
  }
}
