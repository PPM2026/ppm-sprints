import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * idea-analyze — AI analysis of raw idea captures.
 *
 * POST { idea_id: string }
 * Returns { success: true, analysis: { title, description, platform, type, priority, tags, confidence } }
 *
 * Uses GPT-4o-mini to parse raw idea input into structured fields.
 * Cost is always logged under platform "ideeen" (not the AI-suggested platform).
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Verify JWT auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", detail: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { idea_id } = await req.json();
    if (!idea_id) {
      return new Response(
        JSON.stringify({ error: "Missing idea_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const sb = createClient(supabaseUrl, serviceRoleKey);

    // Get OpenAI API key from platform_secrets
    const { data: secretRow } = await sb
      .from("platform_secrets")
      .select("value")
      .eq("key", "OPENAI_API_KEY")
      .single();
    const openaiKey = secretRow?.value;

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the idea
    const { data: idea, error: ideaErr } = await sb
      .from("idea_captures")
      .select("*")
      .eq("id", idea_id)
      .single();

    if (ideaErr || !idea) {
      return new Response(
        JSON.stringify({ error: "Idea not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawInput = idea.raw_input || idea.parsed_title || "";

    // Build prompt for analysis
    const systemPrompt = `Je bent een AI-assistent die ruwe idee-invoer analyseert voor PPM Group (vastgoed & projectontwikkeling).

Analyseer het idee en geef een gestructureerd JSON-antwoord met:
- title: beknopte titel (max 60 tekens)
- description: uitgebreide beschrijving (2-3 zinnen)
- platform: het meest relevante platform (kies EEN uit: assetmanagement, projectontwikkeling, acquisitie, meta, team, zorgplatform, ideeen)
- type: classificatie (feature, improvement, bug, research, operations)
- priority: prioriteit (low, medium, high, critical)
- tags: array van max 3 relevante tags
- confidence: score 0-1 hoe zeker je bent van de analyse

BELANGRIJK: Kies altijd PRECIES EEN platform. Als het idee meerdere platforms raakt, kies het meest relevante.

Antwoord ALLEEN met valid JSON, geen extra tekst.`;

    // Call OpenAI GPT-4o-mini
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: rawInput },
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("OpenAI API error:", openaiRes.status, errText);
      return new Response(
        JSON.stringify({ error: `OpenAI API error (${openaiRes.status})` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiRes.json();
    const content = openaiData.choices?.[0]?.message?.content || "{}";
    const usage = openaiData.usage;

    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch {
      console.error("Failed to parse analysis:", content);
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sanitize platform — must be a single value, no pipes
    if (analysis.platform && analysis.platform.includes("|")) {
      analysis.platform = analysis.platform.split("|")[0].trim();
    }

    // Valid platforms
    const validPlatforms = [
      "assetmanagement", "projectontwikkeling", "acquisitie",
      "meta", "team", "zorgplatform", "ideeen"
    ];
    if (!validPlatforms.includes(analysis.platform)) {
      analysis.platform = "meta"; // default
    }

    // Update idea in database
    const updateData: Record<string, unknown> = {
      analysis: analysis,
      updated_at: new Date().toISOString(),
    };
    if (analysis.title) updateData.parsed_title = analysis.title;
    if (analysis.description) updateData.parsed_description = analysis.description;
    if (analysis.platform) updateData.suggested_platform = analysis.platform;
    if (analysis.type) updateData.suggested_type = analysis.type;
    if (analysis.priority) updateData.suggested_priority = analysis.priority;
    if (analysis.tags) updateData.tags = analysis.tags;

    await sb
      .from("idea_captures")
      .update(updateData)
      .eq("id", idea_id);

    // Log API cost — ALWAYS use "ideeen" as platform (this function serves the Ideeën app)
    if (usage) {
      const inputCost = ((usage.prompt_tokens || 0) / 1_000_000) * 15; // GPT-4o-mini: $0.15/M
      const outputCost = ((usage.completion_tokens || 0) / 1_000_000) * 60; // GPT-4o-mini: $0.60/M
      const amountCents = Math.max(Math.round(inputCost + outputCost), 1);
      const now = new Date();
      const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      await sb.from("cost_entries").insert({
        service: "openai_idea_analyze",
        platform: "ideeen", // Always "ideeen" — NOT the AI-suggested platform
        amount_cents: amountCents,
        period_month: periodMonth,
        source: "api_openai",
        description: `Idee analyse: ${analysis.title || rawInput.substring(0, 60)}`,
        api_raw_data: {
          model: "gpt-4o-mini",
          idea_id,
          input_tokens: usage.prompt_tokens || 0,
          output_tokens: usage.completion_tokens || 0,
        },
      }).then(() => {}).catch((err: Error) => {
        console.warn("Cost logging failed:", err);
      });
    }

    return new Response(
      JSON.stringify({ success: true, analysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("idea-analyze error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
