/**
 * Speech Engine — Reusable speech recognition module with silence detection.
 * Uses Whisper (via Groq API / local whisper.cpp) for accurate Dutch transcription.
 * Falls back to browser Web Speech API if no Whisper backend is available.
 * Used by idea-capture.js, driving-mode.js, speech-input.js, recording-service.js.
 */

import { createWhisperTranscriber } from './whisper-transcriber.js'
import { checkWhisperAvailability } from './whisper-service.js'

/**
 * Create a speech recognition engine instance.
 * @param {Object} options
 * @param {string} [options.lang='nl-NL'] — recognition language
 * @param {function} options.onResult — called with final transcript text
 * @param {function} [options.onInterim] — called with interim (live) text
 * @param {function} [options.onSilence] — called when silence detected (with final transcript)
 * @param {function} [options.onError] — called on recognition error
 * @param {function} [options.onStatusChange] — called with status string
 * @param {number} [options.silenceTimeout=3000] — ms of silence before triggering onSilence
 * @param {MediaStream} [options.stream] — reuse existing mic stream
 * @returns {{ start, stop, isActive, getTranscript, getDuration, reset }}
 */
export function createSpeechEngine(options = {}) {
  const {
    lang = 'nl-NL',
    onResult = () => {},
    onInterim = () => {},
    onSilence = null,
    onError = () => {},
    onStatusChange = () => {},
    silenceTimeout = 3000,
    stream: externalStream = null
  } = options

  let active = false
  let finalTranscript = ''
  let interimTranscript = ''
  let startTime = null
  let transcriber = null
  let usingWhisper = false

  // --- Web Speech API fallback state ---
  let recognition = null
  let lastResultTime = null
  let silenceTimer = null
  let retryCount = 0
  const MAX_RETRIES = 3

  const SpeechRecognition = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null

  // --- Whisper-based start ---
  function startWhisper() {
    // Convert lang code: 'nl-NL' → 'nl' for Whisper
    const whisperLang = lang.split('-')[0]

    transcriber = createWhisperTranscriber({
      lang: whisperLang,
      onResult: (text) => {
        finalTranscript = text
        lastResultTime = Date.now()
        onResult(finalTranscript)
      },
      onInterim: (text) => {
        interimTranscript = text
        onInterim(interimTranscript)
      },
      onSilence: onSilence ? (text) => {
        finalTranscript = text
        onSilence(finalTranscript)
      } : null,
      onError: (err) => {
        onError(err)
      },
      onStatusChange: (status) => {
        onStatusChange(status)
      }
    })

    return transcriber.start(externalStream)
  }

  // --- Web Speech API fallback start ---
  function startWebSpeech() {
    if (!SpeechRecognition) {
      onError('Spraakherkenning niet ondersteund in deze browser')
      onStatusChange('not-supported')
      return false
    }

    try {
      recognition = new SpeechRecognition()
      recognition.lang = lang
      recognition.continuous = true
      recognition.interimResults = true

      finalTranscript = ''
      interimTranscript = ''
      lastResultTime = Date.now()
      retryCount = 0

      recognition.onresult = handleWebSpeechResult
      recognition.onend = handleWebSpeechEnd
      recognition.onerror = handleWebSpeechError

      recognition.start()
      onStatusChange('listening')

      if (onSilence) startSilenceDetection()

      return true
    } catch (err) {
      onError('Kon spraakherkenning niet starten: ' + err.message)
      onStatusChange('error')
      return false
    }
  }

  // --- Public interface ---

  async function start() {
    if (active) return true

    startTime = Date.now()
    finalTranscript = ''
    interimTranscript = ''

    // Try Whisper first
    const { available } = await checkWhisperAvailability()

    if (available) {
      usingWhisper = true
      const ok = await startWhisper()
      if (ok) {
        active = true
        return true
      }
      // Whisper failed to start, fall back
      console.warn('PPM: Whisper start failed, falling back to Web Speech API')
    }

    // Fallback to Web Speech API
    usingWhisper = false
    const ok = startWebSpeech()
    active = ok
    return ok
  }

  function stop() {
    active = false

    if (usingWhisper && transcriber) {
      transcriber.stop()
      transcriber = null
    } else {
      stopSilenceDetection()
      if (recognition) {
        try { recognition.stop() } catch { /* ignore */ }
        recognition = null
      }
    }

    onStatusChange('stopped')
  }

  function isActive() {
    return active
  }

  function getTranscript() {
    return finalTranscript
  }

  function getFullDisplay() {
    return finalTranscript + (interimTranscript ? ' ' + interimTranscript : '')
  }

  function getDuration() {
    if (!startTime) return 0
    return Math.floor((Date.now() - startTime) / 1000)
  }

  function reset() {
    stop()
    finalTranscript = ''
    interimTranscript = ''
    startTime = null
    lastResultTime = null
    retryCount = 0
  }

  // --- Web Speech API handlers (fallback only) ---

  function handleWebSpeechResult(event) {
    let interim = ''
    let final = ''

    for (let i = 0; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        final += event.results[i][0].transcript + ' '
      } else {
        interim += event.results[i][0].transcript
      }
    }

    finalTranscript = final.trim()
    interimTranscript = interim
    lastResultTime = Date.now()

    onResult(finalTranscript)
    onInterim(interimTranscript)
  }

  function handleWebSpeechEnd() {
    if (active) {
      if (retryCount < MAX_RETRIES) {
        retryCount++
        const delay = Math.min(500 * retryCount, 2000)
        setTimeout(() => {
          if (!active) return
          try {
            recognition = new SpeechRecognition()
            recognition.lang = lang
            recognition.continuous = true
            recognition.interimResults = true
            recognition.onresult = handleWebSpeechResult
            recognition.onend = handleWebSpeechEnd
            recognition.onerror = handleWebSpeechError
            recognition.start()
            retryCount = 0
            onStatusChange('listening')
          } catch {
            onError('Herverbinden mislukt')
            onStatusChange('error')
          }
        }, delay)
      } else {
        onError('Spraakherkenning gestopt na meerdere pogingen')
        onStatusChange('error')
        active = false
        stopSilenceDetection()
      }
    }
  }

  function handleWebSpeechError(event) {
    if (event.error === 'no-speech') return
    if (event.error === 'aborted' && !active) return
    onError('Spraakfout: ' + event.error)
    if (event.error === 'not-allowed') {
      onStatusChange('permission-denied')
      stop()
    }
  }

  function startSilenceDetection() {
    stopSilenceDetection()
    silenceTimer = setInterval(() => {
      if (!active || !lastResultTime) return
      const elapsed = Date.now() - lastResultTime
      if (elapsed >= silenceTimeout && finalTranscript.trim().length > 0) {
        stopSilenceDetection()
        onSilence(finalTranscript)
      }
    }, 500)
  }

  function stopSilenceDetection() {
    if (silenceTimer) {
      clearInterval(silenceTimer)
      silenceTimer = null
    }
  }

  return {
    start,
    stop,
    isActive,
    getTranscript,
    getFullDisplay,
    getDuration,
    reset
  }
}
