/**
 * Automatische API cost tracking.
 * Logt kosten naar cost_entries tabel bij elke API call.
 * Gedeeld via sync naar alle repos.
 */
import { supabase } from './supabase.js'

const PLATFORM = import.meta.env.VITE_PLATFORM_NAME || 'onbekend'

// Pricing per 1M tokens (in centen)
const TOKEN_PRICING = {
  'groq_llama':   { input: 59,  output: 79 },    // Llama 3.3 70B
  'gpt4omini':    { input: 15,  output: 60 },    // GPT-4o-mini
  'gpt4o':        { input: 250, output: 1000 },  // GPT-4o
  'sonnet':       { input: 300, output: 1500 },  // Claude Sonnet 4
  'haiku35':      { input: 80,  output: 400 },   // Claude Haiku 3.5
  'haiku':        { input: 25,  output: 125 }    // Claude Haiku (legacy)
}

// Per-call pricing (in centen)
const CALL_PRICING = {
  'groq_whisper': 0.2,   // ~$0.002 per korte transcriptie
  'whisper1':     0.6,    // ~$0.006 per minuut
  'serper':       0.1,    // ~$0.001 per search
  'firecrawl':    1       // ~$0.01 per scrape
}

// Service key -> model key voor pricing lookup
const SERVICE_MODEL = {
  'groq_transcript_analyze': 'groq_llama',
  'groq_agenda':             'groq_llama',
  'groq_chat':               'groq_llama',
  'groq_transcribe':         'groq_whisper',
  'openai_idea_analyze':     'gpt4omini',
  'openai_idea_chat':        'gpt4omini',
  'openai_idea_refine':      'gpt4omini',
  'openai_idea_transcribe':  'whisper1',
  'openai_dossier_memo':     'gpt4o',
  'anthropic_sprint_plan':   'sonnet',
  'anthropic_zorg_worker':   'sonnet',
  'anthropic_zorg_chat':     'haiku35',
  'anthropic_idea_analyze':  'haiku',
  'anthropic_idea_chat':     'haiku',
  'anthropic_idea_refine':   'haiku',
  'serper_search':           'serper',
  'firecrawl_scrape':        'firecrawl'
}

// Model -> provider
const PROVIDER = {
  'groq_llama': 'groq', 'groq_whisper': 'groq',
  'gpt4omini': 'openai', 'gpt4o': 'openai', 'whisper1': 'openai',
  'sonnet': 'anthropic', 'haiku35': 'anthropic', 'haiku': 'anthropic',
  'serper': 'serper', 'firecrawl': 'firecrawl'
}

/**
 * Log API cost automatisch.
 * @param {string} service - Service key (bijv. 'groq_transcript_analyze')
 * @param {object} [usage] - Token/unit usage data
 * @param {number} [usage.input_tokens] - Input tokens
 * @param {number} [usage.output_tokens] - Output tokens
 * @param {number} [usage.calls] - Aantal calls (voor per-call services)
 */
export async function logApiCost(service, usage = {}) {
  try {
    const model = SERVICE_MODEL[service]
    if (!model) return

    let amount_cents = 0
    const tokenPrice = TOKEN_PRICING[model]
    const callPrice = CALL_PRICING[model]

    if (tokenPrice && (usage.input_tokens || usage.output_tokens)) {
      const inp = ((usage.input_tokens || 0) / 1_000_000) * tokenPrice.input
      const out = ((usage.output_tokens || 0) / 1_000_000) * tokenPrice.output
      amount_cents = inp + out
    } else if (callPrice) {
      amount_cents = callPrice * (usage.calls || 1)
    }

    // Minimum 1 cent per gelogde call
    amount_cents = Math.max(Math.round(amount_cents * 100) / 100, 1)

    const now = new Date()
    const period_month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    await supabase.from('cost_entries').insert({
      service,
      platform: PLATFORM,
      amount_cents: Math.round(amount_cents),
      period_month,
      source: `api_${PROVIDER[model] || 'unknown'}`
    })
  } catch (err) {
    // Nooit de app breken voor cost logging
    console.warn('PPM: Cost logging failed', err)
  }
}
