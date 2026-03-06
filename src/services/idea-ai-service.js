/**
 * Idea AI service — Claude Haiku analysis + chat via Edge Functions.
 */
import { supabase } from '../lib/supabase.js'

const BASE_URL = 'https://evtgzkdpixwugevchdii.supabase.co/functions/v1'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2dGd6a2RwaXh3dWdldmNoZGlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzMyNjMsImV4cCI6MjA4ODIwOTI2M30.a0biC6s_t17eUolbQn0OkvgVflD0QJ3h-t_JwQ3oDHA'

/**
 * Get auth headers for Edge Function calls.
 */
async function getHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
    'apikey': ANON_KEY
  }
}

/**
 * Trigger AI analysis for an idea via the idea-analyze Edge Function.
 * Returns { success, analysis: { title, description, platform, type, priority, tags, confidence } }
 */
export async function analyzeIdea(ideaId) {
  const headers = await getHeaders()
  const res = await fetch(`${BASE_URL}/idea-analyze`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ idea_id: ideaId })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Analysis failed')
  return data
}

/**
 * Send a chat message and stream the response via SSE.
 * Can start a new conversation (pass ideaId) or continue one (pass conversationId).
 *
 * @param {object} opts
 * @param {string} [opts.ideaId] — start new conversation for this idea
 * @param {string} [opts.conversationId] — continue existing conversation
 * @param {string} opts.message — user message
 * @param {function} opts.onChunk — called with each text chunk
 * @param {function} [opts.onConversationId] — called with conversation_id when received
 * @param {function} [opts.onComplete] — called when stream finishes, with { conversationId }
 * @param {function} [opts.onError] — called on error
 * @returns {function} abort — call to cancel the stream
 */
export function sendChatMessage(opts) {
  const { ideaId, conversationId, message, onChunk, onConversationId, onComplete, onError } = opts
  const controller = new AbortController()

  ;(async () => {
    try {
      const headers = await getHeaders()
      const body = { message }
      if (conversationId) body.conversation_id = conversationId
      else if (ideaId) body.idea_id = ideaId
      else throw new Error('Either ideaId or conversationId required')

      const res = await fetch(`${BASE_URL}/idea-chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Chat failed (${res.status})`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let convId = conversationId || null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') continue

          try {
            const evt = JSON.parse(payload)

            if (evt.conversation_id && !convId) {
              convId = evt.conversation_id
              onConversationId?.(convId)
            }

            if (evt.type === 'text_delta' && evt.text) {
              onChunk?.(evt.text)
            }

            if (evt.type === 'message_stop') {
              // Stream complete
            }
          } catch { /* skip malformed events */ }
        }
      }

      onComplete?.({ conversationId: convId })
    } catch (err) {
      if (err.name === 'AbortError') return
      console.warn('PPM AI Chat:', err)
      onError?.(err)
    }
  })()

  return () => controller.abort()
}

/**
 * Fetch all conversations for an idea.
 */
export async function fetchConversations(ideaId) {
  const { data, error } = await supabase
    .from('idea_conversations')
    .select('*')
    .eq('idea_id', ideaId)
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('PPM: Could not fetch conversations', error)
    return []
  }
  return data || []
}

/**
 * Save a summary for a conversation (auto-generated from chat content).
 * This summary is used when creating sprints to provide full context.
 */
export async function saveConversationSummary(conversationId, summary) {
  const { error } = await supabase
    .from('idea_conversations')
    .update({ summary, updated_at: new Date().toISOString() })
    .eq('id', conversationId)

  if (error) console.warn('PPM: Could not save conversation summary', error)
}

/**
 * Build a text summary from the last N messages of a conversation.
 * Used to store context for sprint planning.
 */
export async function generateConversationSummary(conversationId) {
  const messages = await fetchMessages(conversationId)
  if (messages.length === 0) return null

  // Build compact summary: key points from the conversation
  const lines = messages
    .filter(m => m.role !== 'system')
    .map(m => `${m.role === 'user' ? 'Gebruiker' : 'AI'}: ${m.content}`)

  const summary = lines.join('\n\n')

  // Save to conversation
  await saveConversationSummary(conversationId, summary)
  return summary
}

/**
 * Fetch messages for a conversation.
 */
export async function fetchMessages(conversationId) {
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) {
    console.warn('PPM: Could not fetch messages', error)
    return []
  }
  return data || []
}
