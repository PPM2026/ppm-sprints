/**
 * Driving Mode — Full-screen hands-free idea capture overlay.
 * Optimized for use while driving: large buttons, auto-save, TTS feedback, wake lock.
 */
import { createSpeechEngine } from './speech-engine.js'
import { saveIdea, updateIdea } from '../services/idea-service.js'
import { analyzeIdea } from '../services/idea-ai-service.js'

// Import parseIdea and generateTodos from idea-capture (they're exported)
let parseIdea = null
let generateTodos = null

/**
 * Open the driving mode overlay.
 * @param {Object} opts
 * @param {function} opts.parseIdea — idea text parser
 * @param {function} opts.generateTodos — todo generator
 */
export function openDrivingMode(opts = {}) {
  parseIdea = opts.parseIdea || ((text) => ({ title: text.substring(0, 60), description: text }))
  generateTodos = opts.generateTodos || (() => [])

  // Create overlay
  const overlay = document.createElement('div')
  overlay.className = 'driving-overlay'
  overlay.id = 'driving-overlay'
  overlay.innerHTML = `
    <div class="driving-close" id="driving-close">
      <ion-icon name="close-outline"></ion-icon>
    </div>
    <div class="driving-body">
      <div class="driving-timer" id="driving-timer">0:00</div>
      <button class="driving-mic" id="driving-mic">
        <ion-icon name="mic-outline"></ion-icon>
      </button>
      <div class="driving-status" id="driving-status">Spreek je idee in...</div>
      <div class="driving-transcript" id="driving-transcript"></div>
    </div>
    <div class="driving-footer">
      <div class="driving-hint" id="driving-hint">Stilte van 3 sec = automatisch opslaan</div>
    </div>
  `
  document.body.appendChild(overlay)

  // State
  let timerInterval = null
  let wakeLock = null
  let engine = null

  // Request wake lock
  requestWakeLock().then(wl => { wakeLock = wl })

  // Create speech engine with silence detection
  engine = createSpeechEngine({
    lang: 'nl-NL',
    silenceTimeout: 3000,
    onResult: (text) => {
      document.getElementById('driving-transcript').textContent = text
    },
    onInterim: (interim) => {
      const display = engine.getFullDisplay()
      document.getElementById('driving-transcript').textContent = display
    },
    onSilence: async (transcript) => {
      // Auto-save on silence
      await handleAutoSave(transcript)
    },
    onStatusChange: (status) => {
      const statusEl = document.getElementById('driving-status')
      const micBtn = document.getElementById('driving-mic')
      if (!statusEl || !micBtn) return

      if (status === 'listening') {
        statusEl.textContent = 'Luisteren...'
        micBtn.classList.add('recording')
      } else if (status === 'stopped') {
        statusEl.textContent = 'Gestopt'
        micBtn.classList.remove('recording')
      } else if (status === 'not-supported') {
        statusEl.textContent = 'Spraak niet ondersteund'
      } else if (status === 'permission-denied') {
        statusEl.textContent = 'Microfoon toegang geweigerd'
      } else if (status === 'error') {
        statusEl.textContent = 'Fout — tik om opnieuw te proberen'
        micBtn.classList.remove('recording')
      }
    },
    onError: (msg) => {
      console.warn('PPM Driving:', msg)
    }
  })

  // Auto-start speech
  setTimeout(() => {
    engine.start()
    startTimer()
  }, 300) // Small delay for overlay animation

  // Timer
  function startTimer() {
    timerInterval = setInterval(() => {
      const secs = engine.getDuration()
      const mins = Math.floor(secs / 60)
      const s = secs % 60
      const timerEl = document.getElementById('driving-timer')
      if (timerEl) timerEl.textContent = `${mins}:${String(s).padStart(2, '0')}`
    }, 1000)
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
  }

  // Auto-save handler
  async function handleAutoSave(transcript) {
    if (!transcript || transcript.trim().length === 0) return

    engine.stop()
    stopTimer()

    const statusEl = document.getElementById('driving-status')
    const hintEl = document.getElementById('driving-hint')
    if (statusEl) statusEl.textContent = 'Opslaan...'
    if (hintEl) hintEl.textContent = ''

    try {
      // Save raw idea first
      const idea = await saveIdea({ raw_input: transcript })

      // Try AI analysis, fall back to client-side parsing
      let parsed
      try {
        const result = await analyzeIdea(idea.id)
        parsed = result.analysis || parseIdea(transcript)
      } catch {
        parsed = parseIdea(transcript)
        await updateIdea(idea.id, {
          parsed_title: parsed.title,
          parsed_description: parsed.description,
          suggested_platform: parsed.platform,
          suggested_type: parsed.type,
          suggested_priority: parsed.priority,
          status: 'parsed'
        })
      }

      if (navigator.vibrate) navigator.vibrate([100, 50, 100])

      const message = `Idee opgeslagen. Titel: ${parsed.title}`
      if (statusEl) statusEl.textContent = 'Idee opgeslagen!'
      const transcriptEl = document.getElementById('driving-transcript')
      if (transcriptEl) transcriptEl.textContent = parsed.title

      await speakTTS(message)

      // After TTS, restart for next idea
      if (hintEl) hintEl.textContent = 'Klaar voor volgend idee...'
      engine.reset()
      setTimeout(() => {
        if (document.getElementById('driving-overlay')) {
          engine.start()
          startTimer()
          if (statusEl) statusEl.textContent = 'Luisteren...'
          if (transcriptEl) transcriptEl.textContent = ''
          if (hintEl) hintEl.textContent = 'Stilte van 3 sec = automatisch opslaan'
        }
      }, 1500)

    } catch (err) {
      console.warn('PPM Driving: save failed', err)
      if (statusEl) statusEl.textContent = 'Opslaan mislukt — tik mic om opnieuw'
      if (navigator.vibrate) navigator.vibrate([300])
    }
  }

  // Close handler
  function close() {
    engine.stop()
    stopTimer()
    releaseWakeLock(wakeLock)

    const el = document.getElementById('driving-overlay')
    if (el) {
      el.style.opacity = '0'
      el.style.transition = 'opacity 0.2s'
      setTimeout(() => el.remove(), 200)
    }
  }

  // Events
  document.getElementById('driving-close').addEventListener('click', close)

  // Mic button: toggle recording or restart after error
  document.getElementById('driving-mic').addEventListener('click', () => {
    if (engine.isActive()) {
      engine.stop()
      stopTimer()
    } else {
      engine.reset()
      engine.start()
      startTimer()
    }
  })

  // Swipe down to close
  let touchStartY = 0
  overlay.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY
  }, { passive: true })

  overlay.addEventListener('touchend', (e) => {
    const deltaY = e.changedTouches[0].clientY - touchStartY
    if (deltaY > 150) close()
  }, { passive: true })
}

// === TTS ===

function speakTTS(text) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve()
      return
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'nl-NL'
    utterance.rate = 1.1
    utterance.onend = resolve
    utterance.onerror = resolve

    // Cancel any ongoing speech
    speechSynthesis.cancel()
    setTimeout(() => speechSynthesis.speak(utterance), 100)
  })
}

// === WAKE LOCK ===

async function requestWakeLock() {
  if (!navigator.wakeLock) return null
  try {
    const lock = await navigator.wakeLock.request('screen')
    // Re-request on visibility change
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && document.getElementById('driving-overlay')) {
        try { await navigator.wakeLock.request('screen') } catch { /* ignore */ }
      }
    })
    return lock
  } catch {
    return null
  }
}

function releaseWakeLock(lock) {
  if (lock) {
    try { lock.release() } catch { /* ignore */ }
  }
}
