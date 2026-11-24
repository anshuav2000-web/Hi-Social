import "server-only";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { z } from "zod";

export const TEMPLATE_COLUMNS = [
  "Post Title",
  "Client",
  "Campaign",
  "Platform",
  "Content Type",
  "Content Pillar",
  "Content Brief",
  "Caption",
  "Hashtags",
  "Creative Link",
  "Assigned Writer",
  "Assigned Designer",
  "Reviewer",
  "Priority",
  "Deadline",
  "Publish Date",
  "Publish Time",
  "Timezone",
  "Approval Status",
  "Publishing Status",
  "Post ID",
] as const;

const PLATFORMS = ["instagram", "facebook", "linkedin", "youtube", "tiktok", "x", "pinterest", "threads"];
const TYPES = ["image", "carousel", "reel", "video", "story", "text", "link"];
const PRIORITIES = ["low", "medium", "high", "urgent"];

export type ImportRow = Record<string, string>;
export type ImportIssue = { row: number; column: string; message: string; severity: "error" | "warning" };

export const rowSchema = z.object({
  title: z.string().min(2, "Post Title is required").max(200),
  platform: z.enum(PLATFORMS as [string, ...string[]], { message: "Platform must be one of the supported channels" }),
  contentType: z.enum(TYPES as [string, ...string[]]).default("image"),
  caption: z.string().max(2200).optional(),
  hashtags: z.string().max(2000).optional(),
  priority: z.enum(PRIORITIES as [string, ...string[]]).default("medium"),
  publishDate: z.string().optional(),
  publishTime: z.string().optional(),
  timezone: z.string().default("UTC"),
  clientName: z.string().optional(),
  campaignName: z.string().optional(),
  brief: z.string().optional(),
  pillar: z.string().optional(),
  writer: z.string().optional(),
  designer: z.string().optional(),
  reviewer: z.string().optional(),
  deadline: z.string().optional(),
  creativeLink: z.string().optional(),
  postId: z.string().optional(),
});

export type ParsedRow = z.infer<typeof rowSchema>;

export async function buildTemplateWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SocialHub Pro";
  wb.created = new Date();
  const sheet = wb.addWorksheet("Posts");
  sheet.columns = TEMPLATE_COLUMNS.map((header) => ({ header, key: header, width: Math.max(16, header.length + 6) }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
  sheet.getRow(1).height = 22;
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  sheet.addRow([
    "Winter Glow launch — hero",
    "Lumina Skincare",
    "Lumina Winter Glow",
    "instagram",
    "image",
    "Product",
    "Lead with the benefit, close with one CTA.",
    "Small bottles. Loud results.",
    "#LuminaSkin #WinterGlow",
    "https://example.com/creative.jpg",
    "Noah Fields",
    "Lena Ortiz",
    "Sam Patel",
    "high",
    "2026-12-01",
    "2026-12-03",
    "09:00",
    "UTC",
    "Approved",
    "Draft",
    "",
  ]);

  for (let row = 2; row <= 500; row++) {
    sheet.getCell(`D${row}`).dataValidation = { type: "list", allowBlank: false, formulae: [`"${PLATFORMS.join(",")}"`] };
    sheet.getCell(`E${row}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${TYPES.join(",")}"`] };
    sheet.getCell(`N${row}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${PRIORITIES.join(",")}"`] };
  }

  const help = wb.addWorksheet("How to use");
  help.columns = [{ width: 30 }, { width: 90 }];
  const rows: [string, string][] = [
    ["Template version", "SocialHub Pro bulk planner v1"],
    ["Required columns", "Post Title, Platform"],
    ["Platforms", PLATFORMS.join(", ")],
    ["Content types", TYPES.join(", ")],
    ["Dates", "YYYY-MM-DD (Deadline, Publish Date)"],
    ["Time", "24h HH:MM (Publish Time)"],
    ["Behaviour", "Rows import as DRAFT. Nothing is published by an import."],
    ["Scheduling", "Publishing Status = Scheduled creates a queue job only when you tick “schedule imported posts”."],
    ["Duplicates", "Same title + platform + publish date anywhere in the file or the workspace is flagged."],
    ["Clients", "Client must already exist in the workspace (case-insensitive match)."],
    ["Assets", "Creative Link is stored as a reference, not downloaded."],
  ];
  rows.forEach(([k, v]) => help.addRow([k, v]));
  help.getRow(1).font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function parseImportFile(
  buffer: Buffer,
  filename: string,
): Promise<{ headers: string[]; rows: ImportRow[]; format: "xlsx" | "csv" }> {
  if (filename.toLowerCase().endsWith(".csv")) {
    const text = buffer.toString("utf8");
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
    return {
      headers: parsed.meta.fields ?? [],
      rows: (parsed.data as Record<string, string>[]).map(normalizeKeys),
      format: "csv",
    };
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("The workbook has no sheets");
  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, col) => {
    headers[col - 1] = String(cell.value ?? "").trim();
  });
  const rows: ImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const raw: Record<string, string> = {};
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const header = headers[col - 1];
      if (!header) return;
      const value = cell.value;
      raw[header] = value === null || value === undefined ? "" : String((value as { text?: string }).text ?? value).trim();
    });
    if (Object.values(raw).some((v) => v !== "")) rows.push(normalizeKeys(raw));
  });
  return { headers, rows, format: "xlsx" };
}

function normalizeKeys(raw: Record<string, string>): ImportRow {
  const out: ImportRow = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k.trim()] = typeof v === "string" ? v.trim() : String(v ?? "");
  }
  return out;
}

const get = (row: ImportRow, ...names: string[]) => {
  for (const name of names) {
    const found = Object.keys(row).find((k) => k.toLowerCase() === name.toLowerCase());
    if (found && row[found]) return row[found]!;
  }
  return "";
};

export function validateImport(rows: ImportRow[]): { valid: ParsedRow[]; issues: ImportIssue[] } {
  const valid: ParsedRow[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Map<string, number>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const platform = get(row, "Platform").toLowerCase();
    const candidate = {
      title: get(row, "Post Title", "Title"),
      platform,
      contentType: (get(row, "Content Type") || "image").toLowerCase(),
      caption: get(row, "Caption"),
      hashtags: get(row, "Hashtags"),
      priority: (get(row, "Priority") || "medium").toLowerCase(),
      publishDate: get(row, "Publish Date"),
      publishTime: get(row, "Publish Time"),
      timezone: get(row, "Timezone") || "UTC",
      clientName: get(row, "Client"),
      campaignName: get(row, "Campaign"),
      brief: get(row, "Content Brief", "Brief"),
      pillar: get(row, "Content Pillar"),
      writer: get(row, "Assigned Writer"),
      designer: get(row, "Assigned Designer"),
      reviewer: get(row, "Reviewer"),
      deadline: get(row, "Deadline"),
      creativeLink: get(row, "Creative Link"),
      postId: get(row, "Post ID"),
    };

    const parsed = rowSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({ row: rowNumber, column: issue.path.join("."), message: issue.message, severity: "error" });
      }
      return;
    }

    const key = `${parsed.data.title.toLowerCase()}|${parsed.data.platform}|${parsed.data.publishDate}`;
    if (seen.has(key)) {
      issues.push({
        row: rowNumber,
        column: "Post Title",
        message: `Duplicate of row ${seen.get(key)} in this file (same title, platform and publish date).`,
        severity: "error",
      });
      return;
    }
    seen.set(key, rowNumber);

    if (parsed.data.publishDate && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.data.publishDate)) {
      issues.push({ row: rowNumber, column: "Publish Date", message: "Use YYYY-MM-DD", severity: "error" });
      return;
    }
    if (parsed.data.publishTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(parsed.data.publishTime)) {
      issues.push({ row: rowNumber, column: "Publish Time", message: "Use 24-hour HH:MM", severity: "error" });
      return;
    }
    if (parsed.data.creativeLink && !/^https?:\/\//.test(parsed.data.creativeLink)) {
      issues.push({ row: rowNumber, column: "Creative Link", message: "Must be an http(s) URL", severity: "warning" });
    }
    if (parsed.data.contentType === "carousel") {
      issues.push({ row: rowNumber, column: "Content Type", message: "Carousels need 2+ media items added after import.", severity: "warning" });
    }
    valid.push(parsed.data);
  });

  return { valid, issues };
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (value: string | number | null | undefined) => {
    const str = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\r\n");
}

export async function buildWorkbook(
  sheetName: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
  meta?: { title: string; subtitle?: string },
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SocialHub Pro";
  const sheet = wb.addWorksheet(sheetName.slice(0, 31));
  sheet.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(14, Math.min(48, h.length + 8)) }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF101D30" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  rows.forEach((row) => sheet.addRow(row));
  if (meta) {
    const info = wb.addWorksheet("Report info");
    info.columns = [{ width: 26 }, { width: 80 }];
    info.addRow(["Report", meta.title]);
    info.addRow(["Generated", new Date().toISOString()]);
    if (meta.subtitle) info.addRow(["Notes", meta.subtitle]);
    info.addRow(["Source", "SocialHub Pro database — metrics carry a source column (meta | demo | manual)."]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
