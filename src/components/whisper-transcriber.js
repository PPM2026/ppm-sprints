/**
 * Whisper Transcriber — Real-time audio capture with chunked Whisper transcription.
 * Captures microphone audio, sends chunks every few seconds to Whisper,
 * and stitches results into a continuous transcript with interim updates.
 * Shared across all PPM platforms via sync-shared.sh.
 */

import { transcribeChunk } from './whisper-service.js'

const CHUNK_INTERVAL = 3000 // ms between chunks (3s = ~20 req/min within Groq limits)
const SILENCE_CHUNKS = 3   // consecutive empty chunks before triggering onSilence
const SUPPORTED_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

/**
 * Create a Whisper-based transcriber instance.
 * Same callback pattern as speech-engine.js for drop-in compatibility.
 * @param {Object} options
 * @param {string} [options.lang='nl'] - Whisper language code
 * @param {function} options.onResult - called with accumulated final transcript
 * @param {function} [options.onInterim] - called with current chunk being processed
 * @param {function} [options.onSilence] - called when silence detected
 * @param {function} [options.onError] - called on error
 * @param {function} [options.onStatusChange] - called with status string
 * @param {number} [options.chunkInterval=3000] - ms between chunks
 * @returns {{ start, stop, isActive }}
 */
export function createWhisperTranscriber(options = {}) {
  const {
    lang = 'nl',
    onResult = () => {},
    onInterim = () => {},
    onSilence = null,
    onError = () => {},
    onStatusChange = () => {},
    chunkInterval = CHUNK_INTERVAL
  } = options

  let active = false
  let stream = null
  let ownStream = false // true if we created the stream (so we should stop it)
  let recorder = null
  let chunkTimer = null
  let confirmedText = ''
  let pendingText = ''
  let silenceCount = 0
  let processing = false
  let audioChunks = []

  function getMimeType() {
    for (const type of SUPPORTED_TYPES) {
      if (MediaRecorder.isTypeSupported(type)) return type
    }
    return '' // let browser pick default
  }

  /**
   * Start capturing and transcribing.
   * @param {MediaStream} [existingStream] - Reuse an existing mic stream
   */
  async function start(existingStream) {
    if (active) return true

    try {
      if (existingStream) {
        stream = existingStream
        ownStream = false
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        ownStream = true
      }

      const mimeType = getMimeType()
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
      audioChunks = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data)
      }

      // Start recording, collecting data every second
      recorder.start(1000)
      active = true
      confirmedText = ''
      pendingText = ''
      silenceCount = 0

      // Process chunks at regular intervals
      chunkTimer = setInterval(processCurrentChunk, chunkInterval)

      onStatusChange('listening')
      return true
    } catch (err) {
      onError('Kon microfoon niet openen: ' + err.message)
      onStatusChange('error')
      return false
    }
  }

  function stop() {
    active = false

    if (chunkTimer) {
      clearInterval(chunkTimer)
      chunkTimer = null
    }

    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop() } catch { /* ignore */ }
    }

    // Process any remaining audio
    if (audioChunks.length > 0) {
      processCurrentChunk()
    }

    if (ownStream && stream) {
      stream.getTracks().forEach(t => t.stop())
    }
    stream = null
    recorder = null

    onStatusChange('stopped')
  }

  async function processCurrentChunk() {
    if (!active && audioChunks.length === 0) return
    if (processing) return // skip if previous chunk still processing

    // Grab collected chunks and reset
    const chunks = audioChunks.splice(0, audioChunks.length)
    if (chunks.length === 0) return

    const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' })

    // Skip very small blobs (likely silence/noise)
    if (blob.size < 1000) {
      silenceCount++
      if (onSilence && silenceCount >= SILENCE_CHUNKS && confirmedText.trim()) {
        onSilence(confirmedText)
        silenceCount = 0
      }
      return
    }

    processing = true
    onStatusChange('processing')

    try {
      const text = await transcribeChunk(blob, lang)

      if (text && text.trim()) {
        silenceCount = 0

        // Stitch: deduplicate overlap between confirmed end and new chunk start
        const newText = deduplicateOverlap(confirmedText, text.trim())

        if (newText) {
          // Move pending to confirmed, set new pending
          if (pendingText) {
            confirmedText += (confirmedText ? ' ' : '') + pendingText
          }
          pendingText = newText

          // Fire callbacks
          const fullText = confirmedText + (confirmedText && pendingText ? ' ' : '') + pendingText
          onResult(fullText)
          onInterim(pendingText)
        }
      } else {
        // Empty result — possible silence
        silenceCount++
        if (onSilence && silenceCount >= SILENCE_CHUNKS && confirmedText.trim()) {
          // Confirm any pending text before triggering silence
          if (pendingText) {
            confirmedText += (confirmedText ? ' ' : '') + pendingText
            pendingText = ''
          }
          onSilence(confirmedText)
          silenceCount = 0
        }
        onInterim('')
      }
    } catch (err) {
      console.warn('PPM Whisper: chunk transcription failed', err.message)
      onError('Transcriptie fout: ' + err.message)
    } finally {
      processing = false
      if (active) onStatusChange('listening')
    }
  }

  function isActive() {
    return active
  }

  return { start, stop, isActive }
}

/**
 * Deduplicate overlap between end of previous text and start of new text.
 * Whisper may repeat the last few words of the previous chunk at the start of the next.
 * @param {string} previous - Accumulated confirmed text
 * @param {string} newText - New chunk transcription
 * @returns {string} The truly new portion of newText
 */
function deduplicateOverlap(previous, newText) {
  if (!previous) return newText

  const prevWords = previous.toLowerCase().split(/\s+/)
  const newWords = newText.split(/\s+/)
  const newWordsLower = newText.toLowerCase().split(/\s+/)

  // Check if the start of newText overlaps with the end of previous
  // Try matching the last N words of previous with the first N words of new
  const maxOverlap = Math.min(8, prevWords.length, newWordsLower.length)

  for (let overlap = maxOverlap; overlap >= 2; overlap--) {
    const prevTail = prevWords.slice(-overlap)
    const newHead = newWordsLower.slice(0, overlap)

    if (prevTail.join(' ') === newHead.join(' ')) {
      // Found overlap — return only the non-overlapping part
      return newWords.slice(overlap).join(' ')
    }
  }

  // No overlap detected — return full new text
  return newText
}
