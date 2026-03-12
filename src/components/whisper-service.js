/**
 * Whisper Service — HTTP transport for Groq Whisper API + local whisper.cpp fallback.
 * Sends audio blobs to a Whisper backend and returns transcribed text.
 * Shared across all PPM platforms via sync-shared.sh.
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const DEFAULT_LOCAL_URL = 'http://localhost:8080/inference'

/**
 * Transcribe an audio chunk using Whisper.
 * Tries Groq first, falls back to local whisper.cpp server.
 * @param {Blob} audioBlob - Audio data (webm/wav)
 * @param {string} [lang='nl'] - Language code
 * @returns {Promise<string>} Transcribed text
 */
export async function transcribeChunk(audioBlob, lang = 'nl') {
  if (!audioBlob || audioBlob.size === 0) return ''

  const groqKey = import.meta.env.VITE_GROQ_API_KEY
  const localUrl = import.meta.env.VITE_WHISPER_LOCAL_URL || DEFAULT_LOCAL_URL
  const backend = import.meta.env.VITE_WHISPER_BACKEND || 'auto'

  // Try Groq first (unless backend is explicitly 'local')
  if (groqKey && backend !== 'local') {
    try {
      const text = await transcribeGroq(audioBlob, lang, groqKey)
      return text
    } catch (err) {
      console.warn('PPM Whisper: Groq failed, trying local fallback', err.message)
      if (backend === 'groq') throw err // don't fallback if explicitly groq-only
    }
  }

  // Try local whisper.cpp server
  if (backend !== 'groq') {
    try {
      const text = await transcribeLocal(audioBlob, lang, localUrl)
      return text
    } catch (err) {
      console.warn('PPM Whisper: local fallback failed', err.message)
      throw new Error('Whisper transcriptie mislukt (geen beschikbare backend)')
    }
  }

  throw new Error('Whisper: geen API key geconfigureerd (VITE_GROQ_API_KEY)')
}

/**
 * Transcribe via Groq Whisper API.
 */
async function transcribeGroq(audioBlob, lang, apiKey) {
  const form = new FormData()
  form.append('file', audioBlob, `chunk.${getExtension(audioBlob)}`)
  form.append('model', 'whisper-large-v3')
  form.append('language', lang)
  form.append('response_format', 'text')

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: form
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Groq ${res.status}: ${body.slice(0, 200)}`)
  }

  const text = await res.text()
  return text.trim()
}

/**
 * Transcribe via local whisper.cpp HTTP server.
 */
async function transcribeLocal(audioBlob, lang, url) {
  const form = new FormData()
  form.append('file', audioBlob, `chunk.${getExtension(audioBlob)}`)
  form.append('language', lang)
  form.append('response_format', 'text')

  const res = await fetch(url, {
    method: 'POST',
    body: form
  })

  if (!res.ok) {
    throw new Error(`Local whisper ${res.status}`)
  }

  const text = await res.text()
  return text.trim()
}

/**
 * Get file extension from blob MIME type.
 */
function getExtension(blob) {
  if (blob.type.includes('webm')) return 'webm'
  if (blob.type.includes('mp4') || blob.type.includes('m4a')) return 'mp4'
  if (blob.type.includes('wav')) return 'wav'
  if (blob.type.includes('ogg')) return 'ogg'
  return 'webm'
}

/**
 * Check if Whisper backend is available.
 * @returns {Promise<{available: boolean, backend: string}>}
 */
export async function checkWhisperAvailability() {
  const groqKey = import.meta.env.VITE_GROQ_API_KEY
  const localUrl = import.meta.env.VITE_WHISPER_LOCAL_URL || DEFAULT_LOCAL_URL

  if (groqKey) {
    return { available: true, backend: 'groq' }
  }

  // Check if local server is reachable
  try {
    const res = await fetch(localUrl.replace('/inference', '/'), { method: 'GET', signal: AbortSignal.timeout(2000) })
    if (res.ok) return { available: true, backend: 'local' }
  } catch { /* not available */ }

  return { available: false, backend: 'none' }
}
