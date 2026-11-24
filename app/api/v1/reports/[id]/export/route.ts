import { get } from "@/lib/db";
import { guard } from "@/lib/api-guard";
import { ApiError, fail, handleApiError } from "@/lib/http";
import { buildWorkbook, toCsv } from "@/lib/excel";
import { buildReportPayload, reportRows, reportSummaryText, type ReportPayload } from "@/lib/reports";
import { formatNumber } from "@/lib/utils";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await guard("report.export");
    const report = get<{
      id: string;
      name: string;
      kind: string;
      period_start: string;
      period_end: string;
      payload_json: string | null;
      client_id: string | null;
    }>("SELECT * FROM reports WHERE id = ? AND workspace_id = ?", [id, ctx.workspace.id]);
    if (!report) throw new ApiError("Report not found", 404, "not_found");

    const range = {
      from: report.period_start || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
      to: report.period_end || new Date().toISOString().slice(0, 10),
    };
    const payload = report.payload_json
      ? (JSON.parse(report.payload_json) as ReportPayload)
      : buildReportPayload(ctx.workspace.id, range, report.client_id);

    const format = new URL(req.url).searchParams.get("format") ?? "xlsx";
    const clientName = report.client_id
      ? get<{ name: string }>("SELECT name FROM clients WHERE id = ?", [report.client_id])?.name ?? null
      : null;
    const safeName = report.name.replace(/[^a-z0-9\-_ ]/gi, "").replace(/\s+/g, "-").toLowerCase().slice(0, 60);

    if (format === "csv") {
      const headers = ["Metric", "Value", "Source"];
      const rows = reportRows(payload);
      const csv = toCsv(headers, rows);
      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${safeName}-${report.period_start}.csv"`,
        },
      });
    }

    if (format === "html") {
      const rows = reportRows(payload);
      const top = payload.topPosts
        .map(
          (post) =>
            `<tr><td>${escape(post.title)}</td><td>${escape(post.platform)}</td><td>${post.reach ?? "n/a"}</td><td>${post.engagement ?? "n/a"}</td><td>${post.engagement_rate ?? "n/a"}%</td></tr>`,
        )
        .join("");
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escape(report.name)}</title>
<style>
body{font-family:Inter,system-ui,sans-serif;background:#05080d;color:#f5f7fa;padding:40px;max-width:880px;margin:0 auto}
h1{font-size:26px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 10px;color:#35a7ff;text-transform:uppercase;letter-spacing:.08em}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid rgba(154,169,188,.18)}
th{color:#9aa9bc;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
.muted{color:#9aa9bc;font-size:12px}pre{white-space:pre-wrap;font-size:12.5px;line-height:1.6;background:#101d30;padding:16px;border-radius:12px}
@media print{body{background:#fff;color:#0a1424}pre{background:#f5f7fa}h2{color:#0b63e5}}
</style></head><body>
<h1>${escape(report.name)}</h1>
<p class="muted">${report.period_start} → ${report.period_end} · ${escape(report.kind)} · generated ${new Date(payload.generatedAt).toLocaleString("en-US")}</p>
<h2>Executive summary</h2><pre>${escape(reportSummaryText(payload, range, clientName))}</pre>
<h2>KPIs</h2><table><thead><tr><th>Metric</th><th>Value</th><th>Source</th></tr></thead><tbody>
${rows.map((r) => `<tr><td>${escape(String(r[0]))}</td><td>${escape(String(r[1]))}</td><td>${escape(String(r[2]))}</td></tr>`).join("")}
</tbody></table>
<h2>Top content</h2><table><thead><tr><th>Post</th><th>Platform</th><th>Reach</th><th>Engagement</th><th>Rate</th></tr></thead><tbody>${top}</tbody></table>
<h2>Recommendations</h2><ul>${payload.insights
        .slice(0, 6)
        .map((insight) => `<li><strong>${escape(insight.title)}</strong> — ${escape(insight.body)} <em>(${insight.kind}, ${escape(insight.period)})</em></li>`)
        .join("")}</ul>
<p class="muted">Metrics carry their source. Values the platform does not report appear as n/a. Use your browser's Print → Save as PDF for a PDF copy.</p>
</body></html>`;
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    if (format === "xlsx") {
      const buffer = await buildWorkbook("Report", ["Metric", "Value", "Source"], reportRows(payload), {
        title: report.name,
        subtitle: `${report.period_start} → ${report.period_end} · reach ${formatNumber(payload.kpis.reach)} · engagement ${formatNumber(payload.kpis.engagement)}`,
      });
      return new Response(new Uint8Array(buffer), {
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename="${safeName}-${report.period_start}.xlsx"`,
        },
      });
    }

    return fail("Unsupported format. Use xlsx, csv or html.", 400, "unsupported_format");
  } catch (err) {
    return handleApiError(err);
  }
}

function escape(value: string) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
