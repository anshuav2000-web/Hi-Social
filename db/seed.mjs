/**
 * Demo workspace seed. Plain ESM so both the Next server (first boot) and
 * scripts/migrate.mjs can call it. Everything created here is explicitly
 * flagged as demo data: workspaces.is_demo = 1, social_accounts.status =
 * 'sandbox', and metrics rows carry source = 'demo'.
 */
import fs from "node:fs";
import path from "node:path";
import { hashPassword } from "../lib/password.mjs";

const DEMO_PASSWORD = "SocialHub!2026";

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20261118);

export function seedDemo(db, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const iso = (d) => new Date(d).toISOString();
  const day = (offset, hour = 9, minute = 0) => {
    const d = new Date(now);
    d.setUTCHours(hour, minute, 0, 0);
    d.setUTCDate(d.getUTCDate() + offset);
    return d;
  };
  const dateOnly = (d) => new Date(d).toISOString().slice(0, 10);

  const ins = (table, row) => {
    const keys = Object.keys(row);
    const sql = `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`;
    db.prepare(sql).run(...keys.map((k) => row[k]));
    return row.id;
  };
  const pw = hashPassword(DEMO_PASSWORD);

  // ── Identity ────────────────────────────────────────────────
  const users = [
    ["u_ava", "Ava Mercer", "admin@socialhubpro.app", "Founder & Agency Lead", "#1677FF", 1],
    ["u_maya", "Maya Chen", "maya@socialhubpro.app", "Social Media Manager", "#35A7FF", 0],
    ["u_noah", "Noah Fields", "noah@socialhubpro.app", "Senior Copywriter", "#8B5CF6", 0],
    ["u_lena", "Lena Ortiz", "lena@socialhubpro.app", "Art Director", "#F59E0B", 0],
    ["u_sam", "Sam Patel", "sam@socialhubpro.app", "Brand Approver", "#10B981", 0],
    ["u_ivy", "Ivy Brooks", "ivy@socialhubpro.app", "Performance Analyst", "#EC4899", 0],
    ["u_jordan", "Jordan Hale", "client@lumina.test", "Lumina Brand Lead", "#6366F1", 0],
  ];
  for (const [id, name, email, title, color, superAdmin] of users) {
    ins("users", {
      id,
      email,
      password_hash: pw,
      full_name: name,
      job_title: title,
      avatar_color: color,
      timezone: "UTC",
      locale: "en",
      is_super_admin: superAdmin,
      notification_prefs: JSON.stringify({ email: true, inApp: true, browser: false, digest: "weekly" }),
      is_active: 1,
      last_login_at: iso(day(-1, 8)),
      created_at: iso(day(-120, 10)),
    });
  }

  const wsId = "ws_northwind";
  ins("workspaces", {
    id: wsId,
    name: "Northwind Collective",
    slug: "northwind-collective",
    owner_id: "u_ava",
    plan: "agency",
    timezone: "UTC",
    logo_color: "#1677FF",
    is_demo: 1,
    settings_json: JSON.stringify({
      publisher: "sandbox",
      holidays: ["2026-12-25", "2027-01-01"],
      workingHours: "09:00-18:00",
    }),
    created_at: iso(day(-120, 10)),
  });

  const members = [
    ["u_ava", "workspace_admin"],
    ["u_maya", "social_media_manager"],
    ["u_noah", "content_writer"],
    ["u_lena", "graphic_designer"],
    ["u_sam", "approver"],
    ["u_ivy", "analyst"],
  ];
  members.forEach(([uidv, role], i) => {
    ins("workspace_members", {
      id: `wm_${uidv}`,
      workspace_id: wsId,
      user_id: uidv,
      role_key: role,
      status: "active",
      invited_email: null,
      invited_by: "u_ava",
      client_scope: null,
      created_at: iso(day(-118 + i, 10)),
    });
  });

  // ── Clients & brands ────────────────────────────────────────
  const clients = [
    ["c_lumina", "Lumina Skincare", "Beauty & Skincare", "#35A7FF"],
    ["c_nordic", "Nordic Roast Coffee", "Food & Beverage", "#F59E0B"],
    ["c_atlas", "Atlas Fitness", "Health & Fitness", "#10B981"],
  ];
  for (const [id, name, industry, color] of clients) {
    ins("clients", {
      id,
      workspace_id: wsId,
      name,
      industry,
      website: `https://${name.toLowerCase().replace(/[^a-z]+/g, "")}.example`,
      contact_name: `${name.split(" ")[0]} Team`,
      contact_email: `hello@${name.split(" ")[0].toLowerCase()}.example`,
      status: "active",
      approval_required: 1,
      approval_stages: "internal_review,client_approval",
      notes: "Quarterly brand refresh in flight.",
      color,
      created_at: iso(day(-110, 11)),
    });
    ins("brand_profiles", {
      id: `bp_${id}`,
      workspace_id: wsId,
      client_id: id,
      brand_name: name,
      personality: "Warm, confident, quietly premium",
      tone: "Friendly expert — never salesy",
      audience: "25-40, design-conscious, values clean ingredients",
      industry,
      languages: "English, Danish",
      writing_style: "Short sentences. Concrete benefits. One idea per line.",
      words_to_avoid: "cheap, miracle, guaranteed, hack",
      content_rules: "Always pair a product claim with a proof point. No medical claims.",
      competitor_refs: "OSEA, Typology, Frama",
      guidelines_url: "https://example.com/brand-guidelines.pdf",
      updated_at: iso(day(-30, 12)),
      created_at: iso(day(-110, 12)),
    });
  }

  ins("workspace_members", {
    id: "wm_u_jordan",
    workspace_id: wsId,
    user_id: "u_jordan",
    role_key: "client_viewer",
    status: "active",
    invited_email: null,
    invited_by: "u_ava",
    client_scope: "c_lumina",
    created_at: iso(day(-90, 10)),
  });

  // ── Social accounts (sandbox — no live Meta credentials in the demo) ──
  const accounts = [
    ["a_ig_lumina", "c_lumina", "instagram", "business", "ig_lumina_001", "Lumina Skincare", "luminaskin", 48210],
    ["a_fb_lumina", "c_lumina", "facebook", "page", "fb_lumina_001", "Lumina Skincare", "luminaskin", 31740],
    ["a_ig_nordic", "c_nordic", "instagram", "creator", "ig_nordic_001", "Nordic Roast", "nordicroast", 22480],
    ["a_fb_nordic", "c_nordic", "facebook", "page", "fb_nordic_001", "Nordic Roast Coffee", "nordicroast", 15920],
    ["a_ig_atlas", "c_atlas", "instagram", "business", "ig_atlas_001", "Atlas Fitness", "atlasfit", 60135],
  ];
  for (const [id, clientId, platform, type, externalId, name, username, followers] of accounts) {
    ins("social_accounts", {
      id,
      workspace_id: wsId,
      client_id: clientId,
      platform,
      account_type: type,
      external_id: externalId,
      name,
      username,
      avatar_url: null,
      followers_count: followers,
      status: "sandbox",
      token_expires_at: null,
      scopes: platform === "instagram"
        ? "instagram_basic,instagram_content_publish,instagram_manage_comments,pages_show_list,pages_read_engagement,business_management"
        : "pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement,read_insights",
      meta_json: JSON.stringify({ demo: true, note: "Sandbox account — connect Meta to go live" }),
      connected_at: iso(day(-100, 9)),
      last_synced_at: iso(day(-1, 23)),
    });
  }

  // ── Campaigns ───────────────────────────────────────────────
  const campaigns = [
    ["cmp_lumina_q4", "c_lumina", "Lumina Winter Glow", "awareness", "Q4 hero launch", "active", -14, 26],
    ["cmp_nordic_ritual", "c_nordic", "Nordic Morning Ritual", "engagement", "Ritual storytelling", "active", -30, 14],
    ["cmp_atlas_newyear", "c_atlas", "Atlas New Year Reset", "conversion", "January membership push", "planned", 20, 62],
  ];
  for (const [id, clientId, name, objective, audience, status, startOff, endOff] of campaigns) {
    ins("campaigns", {
      id,
      workspace_id: wsId,
      client_id: clientId,
      name,
      objective,
      audience,
      budget_cents: 450000,
      currency: "USD",
      platforms: "instagram,facebook",
      start_date: dateOnly(day(startOff)),
      end_date: dateOnly(day(endOff)),
      status,
      deliverables: "8 posts, 2 reels, 1 carousel, 1 story set",
      notes: "Track saves as the primary engagement signal.",
      created_at: iso(day(startOff - 10, 10)),
    });
  }

  // ── Media folders + SVG demo assets ─────────────────────────
  const storageRoot = process.env.STORAGE_DIR || path.join(process.cwd(), "storage", "uploads");
  fs.mkdirSync(path.join(storageRoot, "demo"), { recursive: true });

  const folders = [
    ["mf_lumina", "c_lumina", "Lumina — Winter Glow"],
    ["mf_nordic", "c_nordic", "Nordic — Ritual"],
    ["mf_atlas", "c_atlas", "Atlas — Reset"],
  ];
  for (const [id, clientId, name] of folders) {
    ins("media_folders", {
      id,
      workspace_id: wsId,
      client_id: clientId,
      parent_id: null,
      name,
      created_at: iso(day(-40, 10)),
    });
  }

  function writeSvg(id, label, from, to) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="1080" height="1080" fill="url(#g)"/>
  <circle cx="820" cy="240" r="260" fill="rgba(255,255,255,0.12)"/>
  <circle cx="240" cy="880" r="180" fill="rgba(255,255,255,0.08)"/>
  <text x="80" y="700" font-family="Helvetica,Arial,sans-serif" font-size="86" font-weight="700" fill="#F5F7FA">${label}</text>
  <text x="80" y="780" font-family="Helvetica,Arial,sans-serif" font-size="34" fill="rgba(245,247,250,0.75)">SocialHub Pro · demo asset</text>
</svg>`;
    const file = path.join(storageRoot, "demo", `${id}.svg`);
    fs.writeFileSync(file, svg, "utf8");
    return path.join("demo", `${id}.svg`);
  }

  const assets = [
    ["ma_glow_hero", "c_lumina", "mf_lumina", "Winter Glow — hero", "#35A7FF", "#0A1424", "product,hero"],
    ["ma_glow_carousel_a", "c_lumina", "mf_lumina", "Winter Glow — carousel 1", "#1677FF", "#0A1424", "carousel,product"],
    ["ma_glow_reel", "c_lumina", "mf_lumina", "Winter Glow — reel cover", "#8B5CF6", "#05080D", "reel,video"],
    ["ma_nordic_ritual", "c_nordic", "mf_nordic", "Morning Ritual — flat lay", "#F59E0B", "#3B1F05", "product,lifestyle"],
    ["ma_nordic_story", "c_nordic", "mf_nordic", "Ritual — story frame", "#FB923C", "#111827", "story"],
    ["ma_atlas_reset", "c_atlas", "mf_atlas", "New Year Reset — key art", "#10B981", "#052E2B", "campaign,keyart"],
    ["ma_atlas_motion", "c_atlas", "mf_atlas", "Reset — motion still", "#22D3EE", "#0A1424", "video,motion"],
    ["ma_brand_pattern", "c_lumina", "mf_lumina", "Brand pattern tile", "#0EA5E9", "#0A1424", "brand,pattern"],
  ];
  for (const [id, clientId, folderId, name, from, to, tags] of assets) {
    const rel = writeSvg(id, name.split("—")[0].trim(), from, to);
    const stat = fs.statSync(path.join(storageRoot, rel));
    ins("media_assets", {
      id,
      workspace_id: wsId,
      client_id: clientId,
      folder_id: folderId,
      name: `${name}.svg`,
      kind: "image",
      mime_type: "image/svg+xml",
      size_bytes: stat.size,
      width: 1080,
      height: 1080,
      storage_path: rel,
      url: `/api/v1/media/file/${id}`,
      thumb_url: `/api/v1/media/file/${id}`,
      tags,
      alt_text: name,
      checksum: `demo-${id}`,
      usage_count: 0,
      uploaded_by: "u_lena",
      created_at: iso(day(-9, 15)),
      deleted_at: null,
    });
  }

  // ── Posts ───────────────────────────────────────────────────
  const postSpecs = [
    // title, client, platform, type, pillar, status, scheduledOffset, hour, assetId
    ["Winter Glow launch — hero", "c_lumina", "instagram", "image", "Product", "published", -8, 9, "ma_glow_hero"],
    ["Winter Glow carousel: 3 layers", "c_lumina", "instagram", "carousel", "Education", "published", -6, 11, "ma_glow_carousel_a"],
    ["Barrier repair reel", "c_lumina", "instagram", "reel", "Education", "published", -4, 17, "ma_glow_reel"],
    ["Lumina community repost", "c_lumina", "facebook", "image", "Community", "published", -3, 12, "ma_brand_pattern"],
    ["Ingredient spotlight: squalane", "c_lumina", "facebook", "image", "Education", "scheduled", 1, 10, "ma_glow_hero"],
    ["Winter Glow testimonial", "c_lumina", "instagram", "image", "Social proof", "approved", 2, 9, "ma_glow_carousel_a"],
    ["Ritual in 30 seconds", "c_lumina", "instagram", "reel", "Product", "review", 3, 18, "ma_glow_reel"],
    ["Founder note: why fewer products", "c_lumina", "instagram", "text", "Brand", "changes_requested", 4, 11, null],
    ["Behind the lab", "c_lumina", "instagram", "carousel", "Brand", "in_creation", 5, 14, "ma_glow_carousel_a"],
    ["Story set: morning routine", "c_lumina", "instagram", "story", "Education", "planned", 6, 8, "ma_brand_pattern"],
    ["Nordic morning ritual — flat lay", "c_nordic", "instagram", "image", "Product", "published", -5, 7, "ma_nordic_ritual"],
    ["Why slow roast wins", "c_nordic", "facebook", "text", "Education", "published", -2, 7, null],
    ["Ritual reel: 60s pour", "c_nordic", "instagram", "reel", "Product", "scheduled", 1, 7, "ma_nordic_story"],
    ["Coffee origin: Ethiopia Guji", "c_nordic", "instagram", "carousel", "Education", "approved", 3, 7, "ma_nordic_ritual"],
    ["Roaster's notes — February", "c_nordic", "facebook", "link", "Community", "draft", 7, 9, null],
    ["Story: subscriber welcome", "c_nordic", "instagram", "story", "Community", "planned", 2, 8, "ma_nordic_story"],
    ["Subscription waitlist open", "c_nordic", "facebook", "image", "Conversion", "idea", 10, 10, "ma_nordic_ritual"],
    ["New Year Reset — key art", "c_atlas", "instagram", "image", "Campaign", "published", -7, 6, "ma_atlas_reset"],
    ["12-week strength block", "c_atlas", "instagram", "carousel", "Education", "published", -1, 6, "ma_atlas_motion"],
    ["Member story: Priya", "c_atlas", "facebook", "image", "Social proof", "scheduled", 2, 6, "ma_atlas_reset"],
    ["Reset reel: week one", "c_atlas", "instagram", "reel", "Campaign", "review", 4, 18, "ma_atlas_motion"],
    ["Coach Q&A thread", "c_atlas", "instagram", "text", "Community", "planned", 5, 17, null],
    ["January membership offer", "c_atlas", "facebook", "image", "Conversion", "draft", 8, 12, "ma_atlas_reset"],
    ["Mobility minute #12", "c_atlas", "instagram", "reel", "Education", "idea", 12, 7, "ma_atlas_motion"],
  ];

  const captions = {
    Product: "Small bottles. Loud results. The Winter Glow duo is built for the season your skin forgets how to behave.",
    Education: "Three layers, one routine. Swipe for the order that actually makes a difference.",
    Community: "You sent it, we shared it. This is why we read every message.",
    "Social proof": "“Two weeks in and my skin stopped negotiating with winter.” — Amara, member since 2023.",
    Brand: "Fewer products, used properly, beats a shelf full of maybe.",
    Campaign: "The Reset starts January 6. Twelve weeks, three lifts, one version of you that shows up.",
    Conversion: "Waitlist members get first access and the founding price. That's it, that's the offer.",
  };

  const postIds = [];
  postSpecs.forEach((spec, index) => {
    const [title, clientId, platform, type, pillar, status, offset, hour, assetId] = spec;
    const id = `p_${String(index + 1).padStart(3, "0")}`;
    postIds.push(id);
    const clientName = clients.find((c) => c[0] === clientId)[1];
    const scheduled = day(offset, hour, index % 2 === 0 ? 0 : 30);
    const isPublished = status === "published";
    const campaignId =
      clientId === "c_lumina" ? "cmp_lumina_q4" : clientId === "c_nordic" ? "cmp_nordic_ritual" : "cmp_atlas_newyear";
    const tag =
      clientId === "c_lumina"
        ? "#LuminaSkin #WinterGlow #BarrierCare"
        : clientId === "c_nordic"
          ? "#NordicRoast #SlowCoffee #MorningRitual"
          : "#AtlasFitness #NewYearReset #StrengthForLife";
    ins("social_posts", {
      id,
      workspace_id: wsId,
      client_id: clientId,
      campaign_id: campaignId,
      title,
      caption: `${captions[pillar] || captions.Brand}\n\n${tag}`,
      description: `${clientName} · ${pillar} pillar. Keep the CTA single and specific.`,
      hashtags: tag,
      mentions: clientId === "c_atlas" ? "@atlascoaches" : null,
      cta: pillar === "Conversion" ? "Join the waitlist" : "Save this for later",
      location_name: clientId === "c_nordic" ? "Copenhagen, Denmark" : null,
      platform,
      content_type: type,
      content_pillar: pillar,
      internal_notes: "Reference the Q4 creative direction doc before publishing.",
      first_comment: tag,
      alt_text: `${title} — ${clientName} creative`,
      status,
      priority: ["campaign", "Campaign"].includes(pillar) ? "high" : index % 3 === 0 ? "high" : "medium",
      assigned_writer_id: clientId === "c_atlas" ? "u_noah" : "u_noah",
      assigned_designer_id: "u_lena",
      reviewer_id: "u_sam",
      deadline: iso(day(offset - 2, 17)),
      scheduled_at: ["scheduled", "published", "approved"].includes(status) ? iso(scheduled) : null,
      timezone: "UTC",
      published_at: isPublished ? iso(day(offset, hour + 1)) : null,
      external_post_id: null,
      external_url: null,
      media_ready: assetId ? 1 : 0,
      approval_required: 1,
      created_by: "u_maya",
      created_at: iso(day(offset - 12, 10)),
      updated_at: iso(day(-1, 16)),
      archived_at: null,
    });

    if (assetId) {
      ins("post_media", {
        id: `pm_${id}`,
        post_id: id,
        media_asset_id: assetId,
        position: 0,
        role: "primary",
      });
      db.prepare("UPDATE media_assets SET usage_count = usage_count + 1 WHERE id = ?").run(assetId);
    }
    if (platform === "facebook") {
      ins("post_platforms", { id: `pp_${id}_ig`, post_id: id, platform: "instagram" });
    }
    ins("campaign_posts", { id: `cp_${id}`, campaign_id: campaignId, post_id: id });

    ins("content_briefs", {
      id: `cb_${id}`,
      workspace_id: wsId,
      post_id: id,
      brief: `${title}: lead with the benefit, close with one CTA. Keep first line under 90 characters.`,
      creative_requirements: assetId ? "1080x1080 primary + 1080x1920 story cut" : "Typography-only, brand pattern background",
      reference_files: "Q4 creative direction, brand guidelines v3",
      target_audience: clientId === "c_atlas" ? "Members returning after a break" : "Warm audience, 25-40",
      updated_at: iso(day(-5, 10)),
    });

    ins("content_versions", {
      id: `cv_${id}_1`,
      post_id: id,
      version_no: 1,
      snapshot_json: JSON.stringify({ title, caption: captions[pillar] || captions.Brand, status: "draft" }),
      changed_by: "u_noah",
      created_at: iso(day(offset - 11, 14)),
    });

    if (["review", "changes_requested", "approved", "scheduled", "published"].includes(status)) {
      ins("content_approvals", {
        id: `ap_${id}_1`,
        workspace_id: wsId,
        post_id: id,
        stage: "internal_review",
        status: ["approved", "scheduled", "published"].includes(status) ? "approved" : status === "changes_requested" ? "changes_requested" : "pending",
        reviewer_id: "u_sam",
        decided_by: ["approved", "scheduled", "published", "changes_requested"].includes(status) ? "u_sam" : null,
        feedback:
          status === "changes_requested"
            ? "Open with the customer problem, not the product name. Resend after the rewrite."
            : status === "pending"
              ? null
              : "Copy and creative match the brief.",
        due_at: iso(day(offset - 3, 17)),
        created_at: iso(day(offset - 4, 9)),
        decided_at: ["approved", "scheduled", "published", "changes_requested"].includes(status) ? iso(day(offset - 3, 15)) : null,
      });
      if (clientId === "c_lumina") {
        ins("content_approvals", {
          id: `ap_${id}_2`,
          workspace_id: wsId,
          post_id: id,
          stage: "client_approval",
          status: ["approved", "scheduled", "published"].includes(status) ? "approved" : "pending",
          reviewer_id: "u_jordan",
          decided_by: ["approved", "scheduled", "published"].includes(status) ? "u_jordan" : null,
          feedback: ["approved", "scheduled", "published"].includes(status) ? "Approved for publish." : null,
          due_at: iso(day(offset - 1, 12)),
          created_at: iso(day(offset - 3, 16)),
          decided_at: ["approved", "scheduled", "published"].includes(status) ? iso(day(offset - 2, 11)) : null,
        });
      }
    }

    if (isPublished) {
      ins("published_posts", {
        id: `pub_${id}`,
        workspace_id: wsId,
        post_id: id,
        social_account_id: platform === "instagram" ? `a_ig_${clientId.slice(2)}` : `a_fb_${clientId.slice(2)}`,
        platform,
        external_post_id: null,
        url: null,
        channel: "sandbox",
        published_at: iso(day(offset, hour + 1)),
        raw_json: JSON.stringify({ sandbox: true }),
      });
      ins("publishing_jobs", {
        id: `job_${id}`,
        workspace_id: wsId,
        post_id: id,
        social_account_id: platform === "instagram" ? `a_ig_${clientId.slice(2)}` : `a_fb_${clientId.slice(2)}`,
        platform,
        status: "succeeded",
        run_at: iso(day(offset, hour)),
        attempts: 1,
        max_attempts: 5,
        idempotency_key: `seed-${id}`,
        last_error: null,
        locked_at: null,
        worker_id: "seed",
        channel: "sandbox",
        created_at: iso(day(offset - 3, 10)),
        updated_at: iso(day(offset, hour + 1)),
        finished_at: iso(day(offset, hour + 1)),
      });
      ins("publishing_attempts", {
        id: `att_${id}`,
        job_id: `job_${id}`,
        attempt_no: 1,
        status: "succeeded",
        http_status: null,
        response_body: JSON.stringify({ channel: "sandbox", note: "Demo publish — no Meta credentials configured" }),
        error: null,
        started_at: iso(day(offset, hour)),
        finished_at: iso(day(offset, hour + 1)),
      });
    }
  });

  // One failed job so the queue + retry UI has real state.
  ins("publishing_jobs", {
    id: "job_failed_demo",
    workspace_id: wsId,
    post_id: "p_007",
    social_account_id: "a_ig_lumina",
    platform: "instagram",
    status: "failed",
    run_at: iso(day(-1, 18)),
    attempts: 3,
    max_attempts: 5,
    idempotency_key: "seed-failed-demo",
    last_error: "Media not ready: caption present but carousel needs at least 2 images (Graph API 9004)",
    locked_at: null,
    worker_id: "seed",
    channel: "sandbox",
    created_at: iso(day(-2, 9)),
    updated_at: iso(day(-1, 18, 5)),
    finished_at: iso(day(-1, 18, 5)),
  });
  for (let i = 1; i <= 3; i++) {
    ins("publishing_attempts", {
      id: `att_failed_${i}`,
      job_id: "job_failed_demo",
      attempt_no: i,
      status: "failed",
      http_status: 400,
      response_body: JSON.stringify({ error: { message: "Media not ready", code: 9004 } }),
      error: "Media validation failed before delivery",
      started_at: iso(day(-1, 18, i)),
      finished_at: iso(day(-1, 18, i + 1)),
    });
  }

  ins("queue_state", { workspace_id: wsId, is_paused: 0, paused_by: null, updated_at: iso(now) });

  // ── Tasks ───────────────────────────────────────────────────
  const tasks = [
    ["Write caption: Ritual in 30 seconds", "writing", "in_progress", "high", "u_noah", 1, "p_007"],
    ["Design carousel: Behind the lab", "design", "todo", "medium", "u_lena", 2, "p_009"],
    ["Cut reel: Reset week one", "video", "in_progress", "high", "u_lena", 2, "p_021"],
    ["Rewrite founder note", "writing", "todo", "high", "u_noah", 0, "p_008"],
    ["Client review pack — Lumina", "review", "todo", "medium", "u_sam", 3, null],
    ["Story frame exports", "design", "done", "low", "u_lena", -2, "p_010"],
    ["Nordic February notes", "writing", "todo", "low", "u_noah", 5, "p_015"],
    ["Atlas offer lockup", "design", "review", "medium", "u_lena", 4, "p_023"],
    ["Monthly analytics narrative", "other", "todo", "medium", "u_ivy", 6, null],
    ["Hashtag refresh — Atlas", "other", "done", "low", "u_maya", -3, null],
  ];
  tasks.forEach(([title, kind, status, priority, assignee, dueOff, postId], i) => {
    const id = `t_${String(i + 1).padStart(3, "0")}`;
    ins("tasks", {
      id,
      workspace_id: wsId,
      client_id: postId && postId.startsWith("p_02") ? "c_atlas" : "c_lumina",
      post_id: postId,
      title,
      description: "Deliver per brief. Link the source file in the attachments panel.",
      kind,
      status,
      priority,
      assignee_id: assignee,
      reviewer_id: "u_sam",
      due_date: iso(day(dueOff, 17)),
      parent_task_id: null,
      depends_on_task_id: null,
      recurring_rule: null,
      created_by: "u_maya",
      created_at: iso(day(dueOff - 5, 10)),
      completed_at: status === "done" ? iso(day(dueOff, 15)) : null,
    });
    ins("task_assignees", { id: `ta_${id}`, task_id: id, user_id: assignee });
    ins("task_checklist_items", { id: `tc_${id}_1`, task_id: id, label: "Draft", is_done: status === "done" ? 1 : 0, position: 0 });
    ins("task_checklist_items", { id: `tc_${id}_2`, task_id: id, label: "Internal review", is_done: status === "done" ? 1 : 0, position: 1 });
    if (i === 0) {
      ins("task_comments", {
        id: "tk_1",
        task_id: id,
        user_id: "u_maya",
        body: "Keep the hook under 8 words — the reel opens on the pour.",
        created_at: iso(day(-1, 11)),
      });
    }
  });

  // ── Hashtags ────────────────────────────────────────────────
  const hashtagSets = [
    ["ht_lumina_core", "c_lumina", "Lumina core", "#LuminaSkin #CleanBeauty #BarrierCare #SkinBarrier #WinterSkin"],
    ["ht_lumina_launch", "c_lumina", "Winter Glow launch", "#WinterGlow #LuminaWinter #GlowRoutine #SkincareLaunch"],
    ["ht_nordic_core", "c_nordic", "Nordic core", "#NordicRoast #SlowCoffee #SpecialtyCoffee #MorningRitual"],
    ["ht_atlas_reset", "c_atlas", "Atlas Reset", "#AtlasFitness #NewYearReset #StrengthTraining #12WeekBlock"],
  ];
  hashtagSets.forEach(([id, clientId, name, tags]) => {
    ins("hashtag_collections", {
      id,
      workspace_id: wsId,
      client_id: clientId,
      name,
      tags,
      notes: "Rotate 3 of 5 per post to avoid repetition penalties.",
      platform: "instagram",
      created_by: "u_maya",
      created_at: iso(day(-20, 10)),
    });
  });

  // ── Inbox ───────────────────────────────────────────────────
  const conversations = [
    ["conv_1", "c_lumina", "a_ig_lumina", "instagram", "comment", "When does Winter Glow restock?", "Amara Okafor", "@amaraokafor", "open", "high", "u_maya", "unanswered,restock", -1],
    ["conv_2", "c_nordic", "a_ig_nordic", "instagram", "comment", "Subscription shipping to Germany?", "Jonas Weber", "@jonasweber", "pending", "normal", null, "shipping", -2],
    ["conv_3", "c_atlas", "a_ig_atlas", "instagram", "comment", "Is the reset program beginner friendly?", "Priya Raman", "Priya Raman", "open", "normal", "u_maya", "onboarding", -3],
    ["conv_4", "c_lumina", "a_fb_lumina", "facebook", "message", "Partnership enquiry", "Studio Fold", "Studio Fold", "resolved", "low", "u_ava", "partnership", -6],
  ];
  for (const [id, clientId, accountId, platform, kind, subject, pName, pHandle, status, priority, assignee, labels, off] of conversations) {
    ins("inbox_conversations", {
      id,
      workspace_id: wsId,
      client_id: clientId,
      social_account_id: accountId,
      platform,
      external_id: `demo-${id}`,
      kind,
      subject,
      participant_name: pName,
      participant_handle: pHandle,
      status,
      priority,
      assignee_id: assignee,
      labels,
      post_ref: null,
      first_response_seconds: status === "resolved" ? 5400 : null,
      last_message_at: iso(day(off, 14)),
      created_at: iso(day(off, 13)),
    });
    ins("inbox_messages", {
      id: `msg_${id}_1`,
      conversation_id: id,
      direction: "inbound",
      author_name: pName,
      author_external_id: pHandle,
      body: subject,
      external_id: `demo-${id}-1`,
      is_read: 0,
      sent_by: null,
      created_at: iso(day(off, 13)),
    });
    if (status === "resolved") {
      ins("inbox_messages", {
        id: `msg_${id}_2`,
        conversation_id: id,
        direction: "outbound",
        author_name: "Ava Mercer",
        author_external_id: null,
        body: "Thanks for reaching out — sending the partnership deck now.",
        external_id: null,
        is_read: 1,
        sent_by: "u_ava",
        created_at: iso(day(off, 15)),
      });
    }
  }

  // ── Automations ─────────────────────────────────────────────
  const automations = [
    ["au_1", "Notify approvers when a post enters review", "post.review_requested", [{ field: "client", op: "any" }], [{ type: "notify", target: "role:approver", message: "A post is waiting for review" }], 1],
    ["au_2", "Escalate failed publishes", "publish.failed", [{ field: "attempts", op: "gte", value: 3 }], [{ type: "notify", target: "role:workspace_admin", message: "Publishing failed 3+ times" }, { type: "create_task", title: "Investigate failed publish" }], 1],
    ["au_3", "Create design task on approval", "post.approved", [{ field: "content_type", op: "in", value: "carousel,reel" }], [{ type: "create_task", title: "Export final creative" }], 0],
  ];
  for (const [id, name, trigger, conditions, actions, enabled] of automations) {
    ins("automations", {
      id,
      workspace_id: wsId,
      name,
      trigger_key: trigger,
      conditions_json: JSON.stringify(conditions),
      actions_json: JSON.stringify(actions),
      is_enabled: enabled,
      last_run_at: iso(day(-1, 12)),
      run_count: 4,
      created_by: "u_ava",
      created_at: iso(day(-25, 10)),
    });
    ins("automation_runs", {
      id: `ar_${id}`,
      automation_id: id,
      workspace_id: wsId,
      trigger_event: trigger,
      status: "succeeded",
      log: "Conditions matched. 1 action executed.",
      duration_ms: 42,
      created_at: iso(day(-1, 12)),
    });
  }

  // ── Competitors & research ──────────────────────────────────
  const competitors = [
    ["cx_1", "c_lumina", "OSEA", "instagram", "@osea", "Clean skincare, ocean-led storytelling"],
    ["cx_2", "c_nordic", "Coffee Collective", "instagram", "@coffeecollective", "Copenhagen roaster, strong education content"],
    ["cx_3", "c_atlas", "Strength Side", "instagram", "@strengthside", "Short-form coaching clips"],
  ];
  for (const [id, clientId, name, platform, handle, notes] of competitors) {
    ins("competitor_profiles", {
      id,
      workspace_id: wsId,
      client_id: clientId,
      name,
      platform,
      handle,
      url: `https://instagram.com/${handle.replace("@", "")}`,
      notes,
      created_at: iso(day(-35, 10)),
    });
  }
  const refs = [
    ["cr_1", "cx_1", "Seaweed routine carousel", "instagram", "Carousel pacing worth borrowing", "carousel,hooks"],
    ["cr_2", "cx_2", "Origin story reel", "instagram", "Origin storytelling with a single narrator", "reel,storytelling"],
    ["cr_3", "cx_3", "12-week block explainer", "instagram", "Clean diagram overlay on video", "education,diagram"],
  ];
  for (const [id, competitorId, title, platform, notes, tags] of refs) {
    ins("competitor_references", {
      id,
      workspace_id: wsId,
      competitor_id: competitorId,
      title,
      url: null,
      platform,
      notes,
      tags,
      saved_at: iso(day(-8, 12)),
    });
  }

  // ── Reports ─────────────────────────────────────────────────
  ins("reports", {
    id: "rp_1",
    workspace_id: wsId,
    client_id: "c_lumina",
    name: "Lumina — monthly performance",
    kind: "monthly",
    period_start: dateOnly(day(-30)),
    period_end: dateOnly(day(0)),
    format: "pdf",
    status: "ready",
    payload_json: null,
    created_by: "u_ivy",
    created_at: iso(day(-1, 9)),
  });
  ins("report_schedules", {
    id: "rs_1",
    workspace_id: wsId,
    client_id: "c_nordic",
    name: "Nordic weekly digest",
    kind: "weekly",
    cadence: "weekly",
    format: "pdf",
    recipients: "team@nordicroast.example",
    next_run_at: iso(day(6, 8)),
    is_enabled: 1,
    created_at: iso(day(-20, 10)),
  });

  // ── Notifications, audit, sync, security ────────────────────
  const notifs = [
    ["A post needs your review", "Ritual in 30 seconds is waiting on internal review.", "/approvals", "approval", 0],
    ["Publishing failed", "job_failed_demo exhausted 3 of 5 attempts.", "/publishing-queue", "publish_failed", 0],
    ["Lumina approved 2 posts", "Client approval received for Winter Glow assets.", "/approvals", "approval", 1],
    ["Weekly digest ready", "Your analytics digest for last week is available.", "/reports", "report", 1],
    ["Integration health", "All demo accounts are in sandbox mode. Connect Meta to publish for real.", "/integrations", "integration", 1],
  ];
  notifs.forEach(([title, body, link, kind, isRead], i) => {
    ins("notifications", {
      id: `n_${i + 1}`,
      workspace_id: wsId,
      user_id: "u_ava",
      kind,
      title,
      body,
      link,
      is_read: isRead,
      created_at: iso(day(-i, 9)),
    });
  });

  const audits = [
    ["u_maya", "post.scheduled", "social_post", "p_005"],
    ["u_sam", "approval.approved", "content_approval", "ap_p_006_1"],
    ["u_lena", "media.uploaded", "media_asset", "ma_glow_hero"],
    ["u_ava", "member.invited", "workspace_member", "wm_u_jordan"],
    ["u_maya", "publish.failed", "publishing_job", "job_failed_demo"],
    ["u_noah", "post.updated", "social_post", "p_008"],
    ["u_ivy", "report.generated", "report", "rp_1"],
    ["u_ava", "integration.status_checked", "social_account", "a_ig_lumina"],
  ];
  audits.forEach(([actor, action, entityType, entityId], i) => {
    ins("audit_logs", {
      id: `al_${i + 1}`,
      workspace_id: wsId,
      actor_id: actor,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata_json: JSON.stringify({ demo: true }),
      ip: "127.0.0.1",
      created_at: iso(day(-i, 10 + (i % 6))),
    });
  });

  [["seed_login", "info"], ["token_expired", "warning"], ["rate_limit_hit", "warning"]].forEach(([kind, sev], i) => {
    ins("security_events", {
      id: `se_${i + 1}`,
      workspace_id: wsId,
      user_id: "u_ava",
      kind,
      severity: sev,
      detail: kind === "token_expired" ? "Demo account token placeholder expired — reauthorize to publish." : "Recorded during demo bootstrap.",
      ip: "127.0.0.1",
      created_at: iso(day(-i - 1, 8)),
    });
  });

  ["history", "insights", "comments"].forEach((kind, i) => {
    ins("sync_jobs", {
      id: `sj_${i + 1}`,
      workspace_id: wsId,
      social_account_id: "a_ig_lumina",
      kind,
      status: "succeeded",
      progress: 100,
      records: [24, 90, 12][i],
      error: null,
      started_at: iso(day(-1, 22)),
      finished_at: iso(day(-1, 23)),
      created_at: iso(day(-1, 22)),
    });
  });

  // ── Demo analytics (90 days) ────────────────────────────────
  const baseFollowers = Object.fromEntries(accounts.map((a) => [a[0], a[7]]));
  for (const [accountId, , platform] of accounts) {
    let followers = Math.round(baseFollowers[accountId] * 0.86);
    for (let d = 89; d >= 0; d--) {
      const growth = Math.round(18 + rnd() * 70 + (d < 30 ? 30 : 0));
      followers += growth;
      const reach = Math.round(1200 + rnd() * 3400 + (platform === "instagram" ? 900 : 0));
      const impressions = Math.round(reach * (1.25 + rnd() * 0.5));
      const engagement = Math.round(impressions * (0.021 + rnd() * 0.017));
      ins("account_metrics", {
        id: `am_${accountId}_${d}`,
        workspace_id: wsId,
        social_account_id: accountId,
        platform,
        captured_on: dateOnly(day(-d)),
        followers,
        follower_growth: growth,
        impressions,
        reach,
        profile_views: Math.round(reach * (0.03 + rnd() * 0.02)),
        engagement,
        source: "demo",
      });
    }
    db.prepare("UPDATE social_accounts SET followers_count = ? WHERE id = ?").run(followers, accountId);
  }

  const publishedPosts = db
    .prepare("SELECT id, platform, client_id FROM social_posts WHERE workspace_id = ? AND status = 'published'")
    .all(wsId);
  publishedPosts.forEach((post, idx) => {
    const accountId = post.platform === "instagram" ? `a_ig_${post.client_id.slice(2)}` : `a_fb_${post.client_id.slice(2)}`;
    const base = 1800 + Math.round(rnd() * 5200);
    const snapshots = [
      [0, 0.45],
      [6, 0.82],
      [29, 1],
    ];
    snapshots.forEach(([dayOffset, factor], k) => {
      const impressions = Math.round(base * factor * (1 + idx * 0.04));
      const reach = Math.round(impressions * 0.74);
      const likes = Math.round(reach * (0.035 + rnd() * 0.02));
      const comments = Math.round(likes * (0.06 + rnd() * 0.04));
      const shares = Math.round(likes * (0.04 + rnd() * 0.03));
      const saves = Math.round(likes * (0.08 + rnd() * 0.05));
      const engagement = likes + comments + shares + saves;
      ins("post_metrics", {
        id: `pmtr_${post.id}_${k}`,
        workspace_id: wsId,
        post_id: post.id,
        social_account_id: accountId,
        platform: post.platform,
        captured_at: iso(day(-30 + dayOffset, 12)),
        impressions,
        reach,
        likes,
        comments,
        shares,
        saves,
        views: post.platform === "instagram" ? Math.round(impressions * 1.4) : null,
        video_views: null,
        clicks: Math.round(reach * 0.012),
        engagement,
        engagement_rate: Number(((engagement / reach) * 100).toFixed(2)),
        source: "demo",
      });
    });
  });

  return { workspaceId: wsId, password: DEMO_PASSWORD };
}
