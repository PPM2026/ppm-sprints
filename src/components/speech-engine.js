/**
 * Speech Engine — Reusable speech recognition module with silence detection.
 * Used by idea-capture.js (normal mode) and driving-mode.js (hands-free).
 */

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
    silenceTimeout = 3000
  } = options

  let recognition = null
  let active = false
  let finalTranscript = ''
  let interimTranscript = ''
  let startTime = null
  let lastResultTime = null
  let silenceTimer = null
  let retryCount = 0
  const MAX_RETRIES = 3

  const SpeechRecognition = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null

  function start() {
    if (!SpeechRecognition) {
      onError('Spraakherkenning niet ondersteund in deze browser')
      onStatusChange('not-supported')
      return false
    }

    if (active) return true

    try {
      recognition = new SpeechRecognition()
      recognition.lang = lang
      recognition.continuous = true
      recognition.interimResults = true

      finalTranscript = ''
      interimTranscript = ''
      startTime = Date.now()
      lastResultTime = Date.now()
      retryCount = 0

      recognition.onresult = handleResult
      recognition.onend = handleEnd
      recognition.onerror = handleError

      recognition.start()
      active = true
      onStatusChange('listening')

      // Start silence detection interval
      if (onSilence) {
        startSilenceDetection()
      }

      return true
    } catch (err) {
      onError('Kon spraakherkenning niet starten: ' + err.message)
      onStatusChange('error')
      return false
    }
  }

  function stop() {
    active = false
    stopSilenceDetection()

    if (recognition) {
      try { recognition.stop() } catch { /* ignore */ }
      recognition = null
    }

    onStatusChange('stopped')
  }

  function handleResult(event) {
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

  function handleEnd() {
    if (active) {
      // Auto-restart if still meant to be active
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
            recognition.onresult = handleResult
            recognition.onend = handleEnd
            recognition.onerror = handleError
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

  function handleError(event) {
    if (event.error === 'no-speech') return // ignore silence errors
    if (event.error === 'aborted' && !active) return // ignore when deliberately stopped

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
        // Silence detected with content
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
