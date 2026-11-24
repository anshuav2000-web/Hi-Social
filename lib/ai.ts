import "server-only";
import { env } from "@/lib/env";

export type AiMode =
  | "caption"
  | "captions"
  | "hashtags"
  | "idea"
  | "hook"
  | "cta"
  | "rewrite"
  | "tone"
  | "repurpose"
  | "reel_script"
  | "carousel_outline"
  | "weekly_plan"
  | "monthly_calendar"
  | "campaign_ideas"
  | "brief"
  | "creative_direction"
  | "gap_analysis"
  | "performance_advice";

export type BrandVoice = {
  brand_name?: string | null;
  personality?: string | null;
  tone?: string | null;
  audience?: string | null;
  industry?: string | null;
  languages?: string | null;
  writing_style?: string | null;
  words_to_avoid?: string | null;
  content_rules?: string | null;
};

export type AiRequest = {
  mode: AiMode;
  topic: string;
  platform?: string;
  contentType?: string;
  tone?: string;
  audience?: string;
  extra?: string;
  brandVoice?: BrandVoice | null;
  /** Real metrics passed by the caller; the model is instructed to use only these. */
  metrics?: Record<string, unknown> | null;
};

export type AiResult = {
  provider: "ollama" | "openai" | "template";
  text: string;
  model?: string;
  note?: string;
  fallbackReason?: string;
};

const MODE_BRIEFS: Record<AiMode, string> = {
  caption: "Write one social caption (max 2200 chars) with a hook line, two short value lines and one CTA.",
  captions: "Write 3 distinct caption variations, labelled Option 1/2/3, each with a different hook angle.",
  hashtags: "Suggest 12–18 relevant hashtags, grouped broad / niche / branded. Mix only, no spam lists.",
  idea: "Propose 6 content ideas as a numbered list. Each: title, one-line concept, format suggestion.",
  hook: "Write 8 scroll-stopping first lines under 90 characters each.",
  cta: "Write 8 specific calls to action that fit the platform and offer.",
  rewrite: "Rewrite the supplied copy to be tighter and more concrete. Keep facts identical.",
  tone: "Rewrite in the requested tone. Preserve meaning, claims and numbers.",
  repurpose: "Turn this into 3 derivative formats: a carousel outline, a reel script and a text post.",
  reel_script: "Write a reel script: 3-second hook, 5 beats with on-screen text and voiceover, CTA, plus a shot list.",
  carousel_outline: "Write a 6-slide carousel outline: slide number, headline, 1–2 support lines, visual direction.",
  weekly_plan: "Produce a 7-day plan. For each day: platform, format, title, hook, CTA, best-time suggestion labelled as a hypothesis.",
  monthly_calendar: "Produce a 4-week calendar skeleton with weekly themes and 3 posts per week.",
  campaign_ideas: "Propose 4 campaign concepts: objective, big idea, hero asset, 3 supporting posts, success metric.",
  brief: "Write a production brief: objective, audience, key message, must-say, must-avoid, deliverables, deadline risks.",
  creative_direction: "Describe art direction: palette, typography feel, composition, asset list, do/don't.",
  gap_analysis: "Analyse gaps using ONLY the supplied metrics. Do not invent numbers. State what is missing.",
  performance_advice: "Give recommendations using ONLY the supplied metrics and post titles. Label each recommendation as a hypothesis to test.",
};

const SYSTEM_PROMPT = `You are the content strategist inside SocialHub Pro, a social media operating system.
Rules: never invent analytics, engagement rates or follower counts; only use numbers supplied in the request.
Never guarantee results. Keep copy platform-native, concrete and free of hype. No emoji spam.
Follow the brand voice rules strictly, including words to avoid.`;

function brandBlock(voice?: BrandVoice | null): string {
  if (!voice) return "No brand voice configured — keep a neutral, professional marketing tone.";
  const lines = [
    voice.brand_name && `Brand: ${voice.brand_name}`,
    voice.personality && `Personality: ${voice.personality}`,
    voice.tone && `Tone: ${voice.tone}`,
    voice.audience && `Audience: ${voice.audience}`,
    voice.industry && `Industry: ${voice.industry}`,
    voice.languages && `Languages: ${voice.languages}`,
    voice.writing_style && `Writing style: ${voice.writing_style}`,
    voice.words_to_avoid && `NEVER use these words: ${voice.words_to_avoid}`,
    voice.content_rules && `Content rules: ${voice.content_rules}`,
  ].filter(Boolean);
  return lines.join("\n");
}

export function buildPrompt(req: AiRequest): { system: string; user: string } {
  const parts = [
    MODE_BRIEFS[req.mode],
    `Topic / source material: ${req.topic}`,
    req.platform && `Platform: ${req.platform}`,
    req.contentType && `Format: ${req.contentType}`,
    req.tone && `Requested tone: ${req.tone}`,
    req.audience && `Audience: ${req.audience}`,
    `Brand voice:\n${brandBlock(req.brandVoice)}`,
    req.extra && `Additional constraints: ${req.extra}`,
    req.metrics && `Verified metrics from the database (use only these numbers):\n${JSON.stringify(req.metrics, null, 2)}`,
    "Return plain text only. No preamble, no markdown headings deeper than one level.",
  ].filter(Boolean);
  return { system: SYSTEM_PROMPT, user: parts.join("\n\n") };
}

async function callOllama(system: string, user: string): Promise<AiResult> {
  const res = await fetch(`${env.ai.ollamaBaseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: env.ai.ollamaModel,
      stream: false,
      options: { temperature: 0.7 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
  const json = (await res.json()) as { message?: { content?: string } };
  const text = json.message?.content?.trim();
  if (!text) throw new Error("Ollama returned an empty response");
  return { provider: "ollama", text, model: env.ai.ollamaModel };
}

async function callOpenAiCompatible(system: string, user: string): Promise<AiResult> {
  const res = await fetch(`${env.ai.openaiBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.ai.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: env.ai.openaiModel,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`AI provider responded ${res.status}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("AI provider returned an empty response");
  return { provider: "openai", text, model: env.ai.openaiModel };
}

/** Template engine: always available, deterministic, no network. Used as the final fallback. */
export function templateEngine(req: AiRequest): AiResult {
  const topic = req.topic.trim() || "your next post";
  const brand = req.brandVoice?.brand_name || "the brand";
  const tone = req.tone || req.brandVoice?.tone || "confident and warm";
  const platform = req.platform || "instagram";
  const hashtags = templateHashtags(topic, brand);

  const openers = [
    `Nobody talks about this part of ${topic}.`,
    `A short note on ${topic} — and what we changed.`,
    `We tested ${topic} for four weeks. Here is the honest version.`,
    `If ${topic} keeps slipping, start here.`,
  ];
  const pick = (i: number) => openers[i % openers.length]!;

  const body: Record<AiMode, () => string> = {
    caption: () =>
      `${pick(0)}\n\n${topic} works when it is specific. Here is the version we actually use: one clear promise, one proof point, no filler.\n\nSave this if it is useful — and tell us what you want covered next.\n\n${hashtags}`,
    captions: () =>
      [0, 1, 2]
        .map(
          (i) =>
            `Option ${i + 1} — ${["Problem-first", "Proof-first", "Question-first"][i]}\n${pick(i)}\n${topic} in one line: ${["fewer steps, better result", "the version we keep coming back to", "what actually moves the number"][i]}.\nCTA: ${i === 0 ? "Save this for later" : i === 1 ? "Read the full breakdown" : "Tell us your take"}\n`,
        )
        .join("\n"),
    hashtags: () => hashtags,
    idea: () =>
      [
        "1. Myth vs. reality — 5-slide carousel",
        "2. One-minute explainer reel",
        "3. Customer question, answered publicly",
        "4. Before/after with the process shown",
        "5. Team POV: what we changed this quarter",
        "6. Small test, documented weekly",
      ]
        .map((line) => `${line} — concept: apply “${topic}” to ${brand}'s audience in a ${tone} tone.`)
        .join("\n"),
    hook: () =>
      [
        `The part of ${topic} nobody explains`,
        `We stopped doing ${topic} the hard way`,
        `Three minutes on ${topic}, no fluff`,
        `${topic} is not the problem`,
        `What changed when we rewrote our approach to ${topic}`,
        `A ${tone} take on ${topic}`,
        `Read this before you plan ${topic} again`,
        `The one-line version of ${topic}`,
      ]
        .map((h, i) => `${i + 1}. ${h}`)
        .join("\n"),
    cta: () =>
      [
        "Save this — you will need it at planning time.",
        "Tell us which version you would pick.",
        "Get the full checklist in the link in bio.",
        "Reply with your biggest blocker on this.",
        "Share this with the person who owns the calendar.",
        "Join the waitlist — first access, no spam.",
        "Book a 15-minute walkthrough.",
        "Follow for the next breakdown.",
      ]
        .map((c, i) => `${i + 1}. ${c}`)
        .join("\n"),
    rewrite: () =>
      `${topic.replace(/\s+/g, " ").trim()}\n\nTighter version: keep the single promise, cut hedging, end on one action. Tone: ${tone}. Platform: ${platform}.`,
    tone: () => `${topic}\n\nRewritten in a ${tone} register for ${platform}. Claims and numbers unchanged.`,
    repurpose: () =>
      `Carousel (6 slides)\n1. ${pick(0)}\n2. Why it matters\n3. The mistake\n4. The fix\n5. Proof point\n6. CTA\n\nReel (20s)\nHook: ${pick(1)}\nBeats: problem → demo → result → CTA\n\nText post\n${pick(2)}\n\nOne specific claim, one action.`,
    reel_script: () =>
      `0-3s hook (on-screen): ${pick(0)}\nVoiceover: “Here is the version that actually works.”\n\nBeat 1 (3-8s): Show the starting point.\nBeat 2 (8-14s): The single change.\nBeat 3 (14-20s): The result, stated plainly.\nBeat 4 (20-26s): What to avoid.\nBeat 5 (26-30s): CTA.\n\nShot list: wide establishing, hands-on detail, text overlay, product end card.\nAudio: low-key instrumental, no trending audio dependency.`,
    carousel_outline: () =>
      `Slide 1 — ${pick(0)}\nSlide 2 — Why ${topic} fails quietly\nSlide 3 — The three-part fix\nSlide 4 — What we measured\nSlide 5 — What we would do differently\nSlide 6 — CTA: save + share\n\nVisual direction: dark navy ground, one accent per slide, max 12 words of copy.`,
    weekly_plan: () =>
      ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        .map((d, i) => `${d} · ${["carousel", "reel", "story", "image", "text", "reel", "story"][i]} · ${topic} angle ${i + 1} · CTA: ${i % 2 === 0 ? "save" : "reply"}`)
        .join("\n") + "\n\nPosting times are hypotheses based on your own observed averages — verify in Analytics.",
    monthly_calendar: () =>
      `Week 1 — Theme: reset. Posts: 3 (1 carousel, 1 reel, 1 story set)\nWeek 2 — Theme: proof. Posts: 3 (customer story, before/after, Q&A)\nWeek 3 — Theme: education. Posts: 3 (explainer, myth-bust, checklist)\nWeek 4 — Theme: offer. Posts: 3 (launch, objection-handling, last call)`,
    campaign_ideas: () =>
      [
        "1. “Show the work” — objective: trust. Hero: 45s process reel. Support: 3 carousel breakdowns. Metric: saves.",
        "2. “Ask us anything” — objective: engagement. Hero: story Q&A. Support: 3 reply posts. Metric: replies per 1k reach.",
        "3. “30-day reset” — objective: conversion. Hero: landing-linked reel. Support: weekly check-ins. Metric: link clicks.",
        "4. “Behind the counter” — objective: community. Hero: staff POV video. Support: 3 photo essays. Metric: profile visits.",
      ].join("\n"),
    brief: () =>
      `Objective: make ${topic} legible in one scroll.\nAudience: ${req.audience || req.brandVoice?.audience || "warm, existing followers"}.\nKey message: one specific promise, one proof point.\nMust say: product or service name, the action.\nMust avoid: ${req.brandVoice?.words_to_avoid || "hype, guarantees"}.\nDeliverables: 1 primary asset + 1 cutdown + caption + alt text.\nRisks: approval lead time — book the review slot before the deadline.`,
    creative_direction: () =>
      `Palette: deep navy ground, electric blue accent, warm highlight.\nType: one geometric sans for headlines, one humanist sans for body.\nComposition: single subject, generous negative space, rule of thirds.\nAssets: 1080x1080 primary, 1080x1350 feed, 1080x1920 story.\nDo: show the product in use. Don't: stack more than two messages.`,
    gap_analysis: () =>
      `Using only the supplied metrics:\n${req.metrics ? JSON.stringify(req.metrics, null, 2) : "No metrics were supplied, so no analysis is possible."}\n\nWhat is missing: any channel without metric rows in the period. Do not read absence of data as zero performance.`,
    performance_advice: () =>
      `Based only on supplied data:\n${req.metrics ? JSON.stringify(req.metrics, null, 2) : "No metrics were supplied."}\n\nHypotheses to test (not predictions):\n1. Re-use the top post's hook in a different format.\n2. Move one weekly slot into the best observed window.\n3. Replace the weakest content type with one proven format.\nValidate against your own reporting period before changing the plan.`,
  };

  return {
    provider: "template",
    text: body[req.mode](),
    note: "Generated by the built-in template engine — no LLM provider configured. Connect Ollama for model-quality output.",
  };
}

function templateHashtags(topic: string, brand: string) {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  const words = clean(topic).slice(0, 4);
  const brandTag = `#${clean(brand).join("") || "SocialHub"}`;
  const broad = ["#SocialMedia", "#ContentStrategy", "#MarketingTips", "#Growth"];
  const niche = words.map((w) => `#${w}`);
  return [...new Set([...broad, ...niche, brandTag])].join(" ");
}

export async function generate(req: AiRequest): Promise<AiResult> {
  const { system, user } = buildPrompt(req);
  let lastError = "";
  for (const provider of env.ai.order) {
    try {
      if (provider === "ollama" && env.ai.ollamaBaseUrl) {
        return await callOllama(system, user);
      }
      if (provider === "openai" && env.ai.openaiBaseUrl && env.ai.openaiApiKey) {
        return await callOpenAiCompatible(system, user);
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "provider failed";
    }
  }
  const fallback = templateEngine(req);
  return { ...fallback, fallbackReason: lastError || "No AI provider configured" };
}

export async function aiStatus() {
  const out: { provider: string; configured: boolean; reachable: boolean | null; detail: string }[] = [];
  if (env.ai.ollamaBaseUrl) {
    let reachable = false;
    let detail = "";
    try {
      const res = await fetch(`${env.ai.ollamaBaseUrl.replace(/\/$/, "")}/api/tags`, {
        signal: AbortSignal.timeout(2500),
      });
      reachable = res.ok;
      detail = res.ok ? `Models available at ${env.ai.ollamaBaseUrl}` : `HTTP ${res.status}`;
    } catch {
      detail = `Cannot reach ${env.ai.ollamaBaseUrl}`;
    }
    out.push({ provider: "ollama", configured: true, reachable, detail });
  } else {
    out.push({ provider: "ollama", configured: false, reachable: null, detail: "OLLAMA_BASE_URL not set — local inference disabled" });
  }
  out.push({
    provider: "openai",
    configured: Boolean(env.ai.openaiBaseUrl && env.ai.openaiApiKey),
    reachable: null,
    detail: env.ai.openaiBaseUrl ? "OpenAI-compatible endpoint configured" : "No external AI endpoint configured",
  });
  out.push({
    provider: "template",
    configured: true,
    reachable: true,
    detail: "Built-in template engine always available (no external calls)",
  });
  return out;
}
