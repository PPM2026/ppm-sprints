/**
 * Idea Capture widget — floating "Idee Omzetter" button with text/speech input.
 * Positioned above the feedback button (bottom-right).
 * Exports parseIdea/generateTodos for reuse by driving-mode.js.
 *
 * Flow: capture → save as idea → review in Ideeën omgeving → sprint/taken
 */
import { saveIdea, updateIdea } from '../services/idea-service.js'
import { analyzeIdea } from '../services/idea-ai-service.js'
import { createSpeechEngine } from './speech-engine.js'
import { openDrivingMode } from './driving-mode.js'

// Platform keyword detection for client-side parsing
const PLATFORM_KEYWORDS = {
  assetmanagement: ['asset', 'assets', 'vastgoed', 'pand', 'panden', 'gebouw', 'gebouwen', 'onderhoud', 'huurder', 'huurders', 'technisch', 'beheer'],
  projectontwikkeling: ['project', 'projecten', 'ontwikkeling', 'bouw', 'planning', 'fase', 'bouwplan', 'vergunning', 'grond'],
  acquisitie: ['acquisitie', 'aankoop', 'koop', 'bod', 'deal', 'prospect', 'target', 'portefeuille', 'investering']
}

const TYPE_KEYWORDS = {
  bug: ['bug', 'fout', 'error', 'crash', 'werkt niet', 'kapot', 'broken', 'stuk', 'probleem', 'mislukt', 'falen'],
  feature: ['feature', 'functie', 'nieuw', 'toevoegen', 'wens', 'zou mooi', 'graag', 'idee voor', 'uitbreiden'],
  improvement: ['verbeteren', 'beter', 'sneller', 'mooier', 'optimaliseren', 'upgrade', 'refactor', 'opschonen']
}

const PRIORITY_KEYWORDS = {
  critical: ['urgent', 'kritiek', 'critical', 'asap', 'nu', 'meteen', 'blocker'],
  high: ['belangrijk', 'hoog', 'high', 'prioriteit', 'snel'],
  medium: ['medium', 'normaal', 'gemiddeld'],
  low: ['laag', 'low', 'later', 'nice to have', 'eventueel', 'ooit']
}

/**
 * Parse raw idea text using keyword heuristics.
 * Returns { title, description, platform, type, priority }
 */
export function parseIdea(text) {
  if (!text) return { title: '', description: '', platform: null, type: null, priority: null }

  const lower = text.toLowerCase()

  const firstSentence = text.match(/^[^.!?\n]+[.!?]?/)
  const title = firstSentence ? firstSentence[0].trim() : text.substring(0, 60).trim()
  const description = text.trim()

  let platform = null
  let maxPlatformScore = 0
  for (const [key, keywords] of Object.entries(PLATFORM_KEYWORDS)) {
    const score = keywords.filter(kw => lower.includes(kw)).length
    if (score > maxPlatformScore) { maxPlatformScore = score; platform = key }
  }

  let type = null
  let maxTypeScore = 0
  for (const [key, keywords] of Object.entries(TYPE_KEYWORDS)) {
    const score = keywords.filter(kw => lower.includes(kw)).length
    if (score > maxTypeScore) { maxTypeScore = score; type = key }
  }

  let priority = null
  for (const [key, keywords] of Object.entries(PRIORITY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) { priority = key; break }
  }

  return { title, description, platform, type, priority }
}

/**
 * Generate suggested todo items from a parsed description.
 */
export function generateTodos(description, title) {
  if (!description) return [`Implementeer: ${title || 'Nieuw idee'}`]

  const candidates = description
    .split(/[\n\r]+|(?<=\.)\s+/)
    .map(s => s.replace(/^[\s\-\*\d.)+]+/, '').trim())
    .filter(s => s.length >= 5)

  if (candidates.length === 0) return [`Implementeer: ${title || 'Nieuw idee'}`]

  return candidates.slice(0, 8).map((item, i) => `${i + 1}. ${item}`)
}

/**
 * Initialize the Idea Capture widget and mount it to the given container.
 */
export function initIdeaCapture(container) {
  const fab = document.createElement('div')
  fab.className = 'idea-fab'
  fab.innerHTML = `<ion-icon name="bulb-outline"></ion-icon> Idee`
  container.appendChild(fab)

  const panel = document.createElement('div')
  panel.className = 'idea-panel'
  panel.style.display = 'none'
  panel.innerHTML = `
    <div class="idea-panel-header">
      <div class="idea-panel-title">Idee Omzetter</div>
      <div class="idea-panel-actions">
        <div class="idea-driving-btn" title="Rij-modus (hands-free)"><ion-icon name="car-outline"></ion-icon></div>
        <div class="idea-panel-close"><ion-icon name="close-outline"></ion-icon></div>
      </div>
    </div>

    <div class="idea-tabs">
      <button class="idea-tab active" data-mode="text">
        <ion-icon name="create-outline"></ion-icon> Tekst
      </button>
      <button class="idea-tab" data-mode="speech">
        <ion-icon name="mic-outline"></ion-icon> Spraak
      </button>
    </div>

    <div class="idea-mode" id="idea-mode-text">
      <textarea class="idea-textarea" id="idea-text-input" placeholder="Beschrijf je idee, bug of feature wens..." rows="4"></textarea>
    </div>

    <div class="idea-mode" id="idea-mode-speech" style="display:none;">
      <div class="idea-speech-area">
        <button class="idea-record-btn" id="idea-record-btn">
          <ion-icon name="mic-outline"></ion-icon>
        </button>
        <div class="idea-speech-status" id="idea-speech-status">Klik om te beginnen met spreken</div>
        <div class="idea-speech-text" id="idea-speech-text"></div>
      </div>
    </div>

    <button class="btn-primary idea-submit" id="idea-submit" style="width:100%;justify-content:center;">
      <ion-icon name="flash-outline"></ion-icon> Verwerk
    </button>

    <div class="idea-result" id="idea-result" style="display:none;">
      <div class="idea-result-title" id="idea-result-title"></div>
      <div class="idea-result-desc" id="idea-result-desc"></div>
      <div class="idea-result-tags" id="idea-result-tags"></div>

      <div class="idea-result-actions">
        <button class="btn-primary" id="idea-save-btn">
          <ion-icon name="bookmark-outline"></ion-icon> Bewaar als idee
        </button>
      </div>
    </div>
  `
  container.appendChild(panel)

  // State
  let isOpen = false
  let currentMode = 'text'
  let speechEngine = null

  // Long-press detection on FAB (500ms = driving mode, short tap = normal panel)
  let longPressTimer = null
  let longPressTriggered = false

  fab.addEventListener('pointerdown', () => {
    longPressTriggered = false
    longPressTimer = setTimeout(() => {
      longPressTriggered = true
      if (navigator.vibrate) navigator.vibrate(50)
      openDrivingMode({ parseIdea, generateTodos })
    }, 500)
  })

  fab.addEventListener('pointerup', () => {
    clearTimeout(longPressTimer)
    if (!longPressTriggered) {
      isOpen = !isOpen
      panel.style.display = isOpen ? 'flex' : 'none'
      fab.classList.toggle('active', isOpen)
      if (isOpen) {
        restoreDraft()
        resetPanel()
      } else {
        saveDraft()
        stopSpeech()
      }
    }
  })

  fab.addEventListener('pointerleave', () => { clearTimeout(longPressTimer) })
  fab.addEventListener('contextmenu', (e) => e.preventDefault())

  // Driving mode button in panel header
  panel.querySelector('.idea-driving-btn').addEventListener('click', () => {
    isOpen = false
    panel.style.display = 'none'
    fab.classList.remove('active')
    stopSpeech()
    openDrivingMode({ parseIdea, generateTodos })
  })

  // Close button
  panel.querySelector('.idea-panel-close').addEventListener('click', () => {
    isOpen = false
    panel.style.display = 'none'
    fab.classList.remove('active')
    saveDraft()
    stopSpeech()
  })

  // Tab switching
  panel.querySelectorAll('.idea-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentMode = tab.dataset.mode
      panel.querySelectorAll('.idea-tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      document.getElementById('idea-mode-text').style.display = currentMode === 'text' ? 'block' : 'none'
      document.getElementById('idea-mode-speech').style.display = currentMode === 'speech' ? 'block' : 'none'
      if (currentMode !== 'speech') stopSpeech()
    })
  })

  // Record button
  const recordBtn = document.getElementById('idea-record-btn')
  recordBtn.addEventListener('click', () => {
    if (speechEngine && speechEngine.isActive()) {
      stopSpeech()
    } else {
      startSpeech()
    }
  })

  // Submit / process button
  document.getElementById('idea-submit').addEventListener('click', async () => {
    const rawText = currentMode === 'text'
      ? document.getElementById('idea-text-input').value.trim()
      : (speechEngine ? speechEngine.getTranscript() : '').trim()

    if (!rawText) return

    const submitBtn = document.getElementById('idea-submit')
    submitBtn.disabled = true
    submitBtn.innerHTML = '<ion-icon name="hourglass-outline"></ion-icon> Verwerken...'

    try {
      const idea = await saveIdea({ raw_input: rawText })

      // Try AI analysis first, fall back to client-side parsing
      let parsed
      try {
        const result = await analyzeIdea(idea.id)
        parsed = result.analysis || parseIdea(rawText)
      } catch {
        // AI unavailable — use client-side heuristics as fallback
        parsed = parseIdea(rawText)
        await updateIdea(idea.id, {
          parsed_title: parsed.title,
          parsed_description: parsed.description,
          suggested_platform: parsed.platform,
          suggested_type: parsed.type,
          suggested_priority: parsed.priority,
          status: 'parsed'
        })
      }

      localStorage.removeItem('ppm-idea-draft')
      showResult(parsed)
    } catch (err) {
      console.warn('PPM: Could not save idea', err)
    } finally {
      submitBtn.disabled = false
      submitBtn.innerHTML = '<ion-icon name="flash-outline"></ion-icon> Verwerk'
    }
  })

  // Save as idea button
  document.getElementById('idea-save-btn').addEventListener('click', () => {
    localStorage.removeItem('ppm-idea-draft')
    showConfirmation('Idee bewaard!')
  })

  // === SPEECH ===

  function startSpeech() {
    speechEngine = createSpeechEngine({
      lang: 'nl-NL',
      onResult: (text) => {
        document.getElementById('idea-speech-text').textContent = text
      },
      onInterim: () => {
        const display = speechEngine.getFullDisplay()
        document.getElementById('idea-speech-text').textContent = display
      },
      onStatusChange: (status) => {
        const statusEl = document.getElementById('idea-speech-status')
        if (status === 'listening') {
          statusEl.textContent = 'Luisteren...'
          recordBtn.classList.add('recording')
        } else if (status === 'stopped') {
          statusEl.textContent = 'Klik om te beginnen met spreken'
          recordBtn.classList.remove('recording')
        } else if (status === 'not-supported') {
          statusEl.textContent = 'Spraakherkenning niet ondersteund'
        } else if (status === 'permission-denied') {
          statusEl.textContent = 'Microfoon toegang geweigerd'
        } else if (status === 'error') {
          statusEl.textContent = 'Fout — klik om opnieuw'
          recordBtn.classList.remove('recording')
        }
      },
      onError: (msg) => { console.warn('PPM Speech:', msg) }
    })
    speechEngine.start()
  }

  function stopSpeech() {
    if (speechEngine) speechEngine.stop()
    recordBtn.classList.remove('recording')
    document.getElementById('idea-speech-status').textContent = 'Klik om te beginnen met spreken'
  }

  // === DRAFT PERSISTENCE ===

  function saveDraft() {
    const text = document.getElementById('idea-text-input').value.trim()
    if (text) localStorage.setItem('ppm-idea-draft', text)
  }

  function restoreDraft() {
    const draft = localStorage.getItem('ppm-idea-draft')
    if (draft) document.getElementById('idea-text-input').value = draft
  }

  // === UI HELPERS ===

  function resetPanel() {
    if (!localStorage.getItem('ppm-idea-draft')) {
      document.getElementById('idea-text-input').value = ''
    }
    document.getElementById('idea-speech-text').textContent = ''
    document.getElementById('idea-result').style.display = 'none'
    document.getElementById('idea-submit').style.display = 'flex'
  }

  function showResult(parsed) {
    document.getElementById('idea-submit').style.display = 'none'
    const resultEl = document.getElementById('idea-result')
    resultEl.style.display = 'block'

    document.getElementById('idea-result-title').textContent = parsed.title || 'Geen titel herkend'
    document.getElementById('idea-result-desc').textContent = parsed.description || ''

    const tags = []
    if (parsed.platform) {
      const names = { assetmanagement: 'Assetmanagement', projectontwikkeling: 'Projectontwikkeling', acquisitie: 'Acquisitie' }
      tags.push(`<span class="pill-sm blue">${names[parsed.platform] || parsed.platform}</span>`)
    }
    if (parsed.type) {
      const cls = parsed.type === 'bug' ? 'red' : parsed.type === 'feature' ? 'purple' : 'orange'
      const label = parsed.type === 'bug' ? 'Bug' : parsed.type === 'feature' ? 'Feature' : 'Verbetering'
      tags.push(`<span class="pill-sm ${cls}">${label}</span>`)
    }
    if (parsed.priority) {
      const cls = parsed.priority === 'critical' || parsed.priority === 'high' ? 'red' : parsed.priority === 'medium' ? 'orange' : 'gray'
      const label = { critical: 'Kritiek', high: 'Hoog', medium: 'Medium', low: 'Laag' }
      tags.push(`<span class="pill-sm ${cls}">${label[parsed.priority] || parsed.priority}</span>`)
    }
    if (tags.length === 0) tags.push('<span class="pill-sm gray">Niet geclassificeerd</span>')
    document.getElementById('idea-result-tags').innerHTML = tags.join(' ')
  }

  function showConfirmation(message) {
    const resultEl = document.getElementById('idea-result')
    resultEl.innerHTML = `
      <div style="text-align:center;padding:16px 0;">
        <ion-icon name="checkmark-circle-outline" style="font-size:28px;color:#1B7D3A;display:block;margin:0 auto 8px;"></ion-icon>
        <div style="font-size:13px;font-weight:600;color:#1B7D3A;">${message}</div>
        <div class="idea-goto-link" style="font-size:11px;color:#8A7356;cursor:pointer;margin-top:8px;display:inline-flex;align-items:center;gap:4px;">
          Bekijk in Idee\u00ebn <ion-icon name="arrow-forward-outline" style="font-size:12px;"></ion-icon>
        </div>
      </div>
    `
    resultEl.querySelector('.idea-goto-link')?.addEventListener('click', () => {
      isOpen = false
      panel.style.display = 'none'
      fab.classList.remove('active')
      window.__ppmSwitchView?.('ideeen')
    })

    setTimeout(() => {
      if (isOpen) {
        isOpen = false
        panel.style.display = 'none'
        fab.classList.remove('active')
      }
    }, 4000)
  }
}
