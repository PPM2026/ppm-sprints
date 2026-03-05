import { supabase } from './supabase.js'

const PLATFORM = import.meta.env.VITE_PLATFORM_NAME || 'unknown'

const TAGS = ['UI', 'Data', 'Performance', 'Navigatie', 'Login', 'Print', 'Mobile']
const PRIORITIES = [
  { key: 'low', label: 'Laag', icon: 'arrow-down-outline' },
  { key: 'medium', label: 'Middel', icon: 'remove-outline' },
  { key: 'high', label: 'Hoog', icon: 'arrow-up-outline' },
  { key: 'critical', label: 'Kritiek', icon: 'flame-outline' }
]

// Capture recent console errors for auto-attaching
const recentErrors = []
const origError = console.error
console.error = function (...args) {
  recentErrors.push({ time: new Date().toISOString(), msg: args.map(a => String(a)).join(' ') })
  if (recentErrors.length > 10) recentErrors.shift()
  origError.apply(console, args)
}
window.addEventListener('error', (e) => {
  recentErrors.push({ time: new Date().toISOString(), msg: `${e.message} at ${e.filename}:${e.lineno}` })
  if (recentErrors.length > 10) recentErrors.shift()
})

async function uploadFile(file, folder) {
  const ext = file.name ? file.name.split('.').pop() : (file.type.includes('audio') ? 'webm' : 'png')
  const path = `${folder}/${PLATFORM}_${Date.now()}.${ext}`
  const { data, error } = await supabase.storage.from('feedback-attachments').upload(path, file)
  if (error) return null
  const { data: urlData } = supabase.storage.from('feedback-attachments').getPublicUrl(path)
  return urlData?.publicUrl || null
}

export async function submitFeedbackV2(payload) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }

  // Upload screenshot if present
  let screenshotUrl = null
  if (payload.screenshotFile) {
    screenshotUrl = await uploadFile(payload.screenshotFile, 'screenshots')
  }

  // Upload audio if present
  let audioUrl = null
  if (payload.audioBlob) {
    const audioFile = new File([payload.audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' })
    audioUrl = await uploadFile(audioFile, 'audio')
  }

  const { data, error } = await supabase.from('feedback').insert({
    user_id: session.user.id,
    platform: PLATFORM,
    type: payload.type,
    description: payload.description,
    priority: payload.priority,
    tags: payload.tags,
    current_view: payload.currentView || null,
    browser_info: navigator.userAgent,
    screenshot_url: screenshotUrl,
    audio_url: audioUrl,
    steps_to_reproduce: payload.steps || null,
    expected_behavior: payload.expected || null,
    actual_behavior: payload.actual || null,
    console_errors: recentErrors.length > 0 ? JSON.stringify(recentErrors) : null,
    screen_resolution: `${window.innerWidth}x${window.innerHeight} (${window.devicePixelRatio}x)`
  })

  return { data, error }
}

// Legacy wrapper for backwards compat
export async function submitFeedback(type, description, currentView) {
  return submitFeedbackV2({ type, description, currentView, priority: 'medium', tags: [] })
}

export function initFeedbackButton(container, getCurrentView) {
  const btn = document.createElement('div')
  btn.className = 'feedback-btn'
  btn.innerHTML = '<ion-icon name="chatbox-ellipses-outline"></ion-icon> Melden'
  container.appendChild(btn)

  const popup = document.createElement('div')
  popup.className = 'feedback-popup'
  container.appendChild(popup)

  let state = {
    step: 1,
    type: 'bug',
    priority: 'medium',
    tags: [],
    description: '',
    steps: '',
    expected: '',
    actual: '',
    screenshotFile: null,
    screenshotPreview: null,
    audioBlob: null,
    audioUrl: null,
    mediaRecorder: null,
    recording: false
  }

  function resetState() {
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl)
    if (state.screenshotPreview) URL.revokeObjectURL(state.screenshotPreview)
    state = {
      step: 1, type: 'bug', priority: 'medium', tags: [],
      description: '', steps: '', expected: '', actual: '',
      screenshotFile: null, screenshotPreview: null,
      audioBlob: null, audioUrl: null, mediaRecorder: null, recording: false
    }
  }

  function currentView() {
    return getCurrentView ? getCurrentView() : null
  }

  function renderStep1() {
    const view = currentView()
    return `
      <div class="fb-header">
        <span class="fb-header-title">Melding maken</span>
        <button class="fb-header-close" data-action="close"><ion-icon name="close-outline"></ion-icon></button>
      </div>
      <div class="fb-body">
        <div class="fb-steps">
          <div class="fb-step-dot active"></div>
          <div class="fb-step-dot"></div>
        </div>
        ${view ? `<div class="fb-context"><ion-icon name="location-outline"></ion-icon> ${view}</div>` : ''}

        <div class="fb-label">Type</div>
        <div class="fb-type-row">
          <div class="fb-type-btn ${state.type === 'bug' ? 'selected' : ''}" data-type="bug">
            <ion-icon name="bug-outline"></ion-icon> Bug
          </div>
          <div class="fb-type-btn ${state.type === 'feature' ? 'selected' : ''}" data-type="feature">
            <ion-icon name="bulb-outline"></ion-icon> Feature
          </div>
        </div>

        <div class="fb-label">Prioriteit</div>
        <div class="fb-priority-row">
          ${PRIORITIES.map(p => `
            <div class="fb-priority-btn ${p.key} ${state.priority === p.key ? 'selected' : ''}" data-priority="${p.key}">
              <ion-icon name="${p.icon}" style="font-size:10px;vertical-align:-1px;margin-right:1px;"></ion-icon> ${p.label}
            </div>
          `).join('')}
        </div>

        <div class="fb-label">Beschrijving</div>
        <textarea class="fb-textarea fb-textarea-md" data-field="description" placeholder="${state.type === 'bug' ? 'Wat ging er mis?' : 'Welke functie zou je willen?'}">${state.description}</textarea>

        <div class="fb-label">Tags</div>
        <div class="fb-tags-row">
          ${TAGS.map(t => `<div class="fb-tag ${state.tags.includes(t) ? 'selected' : ''}" data-tag="${t}">${t}</div>`).join('')}
        </div>

        <div class="fb-nav">
          <button class="fb-nav-btn primary" data-action="next" ${!state.description.trim() ? 'disabled' : ''}>Volgende <ion-icon name="arrow-forward-outline" style="font-size:12px;vertical-align:-2px;margin-left:2px;"></ion-icon></button>
        </div>
      </div>
    `
  }

  function renderStep2() {
    return `
      <div class="fb-header">
        <span class="fb-header-title">Extra informatie</span>
        <button class="fb-header-close" data-action="close"><ion-icon name="close-outline"></ion-icon></button>
      </div>
      <div class="fb-body">
        <div class="fb-steps">
          <div class="fb-step-dot done"></div>
          <div class="fb-step-dot active"></div>
        </div>

        <div class="fb-label">Bijlagen <span style="text-transform:none;font-weight:400;opacity:0.6;">(optioneel)</span></div>
        <div class="fb-attach-row">
          <div class="fb-attach-btn ${state.screenshotFile ? 'has-file' : ''}" data-action="screenshot">
            <ion-icon name="${state.screenshotFile ? 'checkmark-circle-outline' : 'camera-outline'}"></ion-icon>
            ${state.screenshotFile ? 'Screenshot ✓' : 'Screenshot'}
          </div>
          <div class="fb-attach-btn ${state.recording ? 'recording' : (state.audioBlob ? 'has-file' : '')}" data-action="audio">
            <ion-icon name="${state.recording ? 'stop-circle-outline' : (state.audioBlob ? 'checkmark-circle-outline' : 'mic-outline')}"></ion-icon>
            ${state.recording ? 'Opnemen...' : (state.audioBlob ? 'Opname ✓' : 'Inspreken')}
          </div>
        </div>

        ${state.screenshotPreview ? `
          <div class="fb-screenshot-preview">
            <img src="${state.screenshotPreview}" alt="Screenshot" />
            <button class="fb-screenshot-remove" data-action="remove-screenshot"><ion-icon name="close-outline"></ion-icon></button>
          </div>
        ` : ''}

        ${state.audioUrl ? `
          <div class="fb-audio-preview">
            <audio controls src="${state.audioUrl}"></audio>
            <button class="fb-audio-remove" data-action="remove-audio"><ion-icon name="close-outline"></ion-icon></button>
          </div>
        ` : ''}

        ${state.type === 'bug' ? `
          <div class="fb-extra-toggle" data-action="toggle-extra">
            <ion-icon name="chevron-forward-outline"></ion-icon> Meer details (optioneel)
          </div>
          <div class="fb-extra-content">
            <div class="fb-label">Stappen om te reproduceren</div>
            <textarea class="fb-textarea fb-textarea-sm" data-field="steps" placeholder="1. Ga naar... 2. Klik op...">${state.steps}</textarea>

            <div class="fb-label">Wat verwachtte je?</div>
            <textarea class="fb-textarea fb-textarea-sm" data-field="expected" placeholder="De pagina zou moeten laden...">${state.expected}</textarea>

            <div class="fb-label">Wat gebeurde er?</div>
            <textarea class="fb-textarea fb-textarea-sm" data-field="actual" placeholder="Ik zag een foutmelding...">${state.actual}</textarea>
          </div>
        ` : ''}

        <div class="fb-nav">
          <button class="fb-nav-btn secondary" data-action="back"><ion-icon name="arrow-back-outline" style="font-size:12px;vertical-align:-2px;margin-right:2px;"></ion-icon> Terug</button>
          <button class="fb-nav-btn primary" data-action="submit">Versturen</button>
        </div>
      </div>
    `
  }

  function render() {
    popup.innerHTML = state.step === 1 ? renderStep1() : renderStep2()
  }

  // Hidden file input for screenshots
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'image/*'
  fileInput.style.display = 'none'
  container.appendChild(fileInput)

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0]
    if (!file) return
    if (state.screenshotPreview) URL.revokeObjectURL(state.screenshotPreview)
    state.screenshotFile = file
    state.screenshotPreview = URL.createObjectURL(file)
    render()
    fileInput.value = ''
  })

  // Toggle popup
  btn.addEventListener('click', () => {
    if (popup.classList.contains('active')) {
      popup.classList.remove('active')
      return
    }
    resetState()
    render()
    popup.classList.add('active')
  })

  // Event delegation
  popup.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action
    const typeBtn = e.target.closest('.fb-type-btn')
    const prioBtn = e.target.closest('.fb-priority-btn')
    const tagBtn = e.target.closest('.fb-tag')

    // Save textarea values before re-render
    popup.querySelectorAll('textarea[data-field]').forEach(ta => {
      state[ta.dataset.field] = ta.value
    })

    if (action === 'close') {
      popup.classList.remove('active')
      return
    }

    if (typeBtn) {
      state.type = typeBtn.dataset.type
      render()
      return
    }

    if (prioBtn) {
      state.priority = prioBtn.dataset.priority
      render()
      return
    }

    if (tagBtn) {
      const tag = tagBtn.dataset.tag
      if (state.tags.includes(tag)) {
        state.tags = state.tags.filter(t => t !== tag)
      } else {
        state.tags.push(tag)
      }
      render()
      return
    }

    if (action === 'next') {
      popup.querySelectorAll('textarea[data-field]').forEach(ta => {
        state[ta.dataset.field] = ta.value
      })
      if (!state.description.trim()) return
      state.step = 2
      render()
      return
    }

    if (action === 'back') {
      state.step = 1
      render()
      return
    }

    if (action === 'screenshot') {
      fileInput.click()
      return
    }

    if (action === 'audio') {
      if (state.recording) {
        // Stop recording
        if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
          state.mediaRecorder.stop()
        }
        return
      }
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const chunks = []
        const recorder = new MediaRecorder(stream)
        state.mediaRecorder = recorder
        state.recording = true
        render()

        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
        recorder.onstop = () => {
          stream.getTracks().forEach(t => t.stop())
          state.audioBlob = new Blob(chunks, { type: 'audio/webm' })
          if (state.audioUrl) URL.revokeObjectURL(state.audioUrl)
          state.audioUrl = URL.createObjectURL(state.audioBlob)
          state.recording = false
          state.mediaRecorder = null
          render()
        }
        recorder.start()

        // Auto-stop after 60 seconds
        setTimeout(() => {
          if (recorder.state !== 'inactive') recorder.stop()
        }, 60000)
      } catch (err) {
        state.recording = false
        render()
      }
      return
    }

    if (action === 'remove-screenshot') {
      if (state.screenshotPreview) URL.revokeObjectURL(state.screenshotPreview)
      state.screenshotFile = null
      state.screenshotPreview = null
      render()
      return
    }

    if (action === 'remove-audio') {
      if (state.audioUrl) URL.revokeObjectURL(state.audioUrl)
      state.audioBlob = null
      state.audioUrl = null
      render()
      return
    }

    if (action === 'toggle-extra') {
      const toggle = popup.querySelector('.fb-extra-toggle')
      const content = popup.querySelector('.fb-extra-content')
      if (toggle && content) {
        toggle.classList.toggle('open')
        content.classList.toggle('visible')
      }
      return
    }

    if (action === 'submit') {
      // Save any textarea values
      popup.querySelectorAll('textarea[data-field]').forEach(ta => {
        state[ta.dataset.field] = ta.value
      })

      const submitBtn = popup.querySelector('[data-action="submit"]')
      if (submitBtn) {
        submitBtn.textContent = 'Verzenden...'
        submitBtn.disabled = true
      }

      const { error } = await submitFeedbackV2({
        type: state.type,
        priority: state.priority,
        tags: state.tags,
        description: state.description,
        steps: state.steps,
        expected: state.expected,
        actual: state.actual,
        screenshotFile: state.screenshotFile,
        audioBlob: state.audioBlob,
        currentView: currentView()
      })

      if (error) {
        popup.innerHTML = `
          <div class="fb-result error">
            <ion-icon name="close-circle-outline"></ion-icon>
            Fout bij verzenden
            <div class="fb-result-sub">Probeer het opnieuw</div>
          </div>`
      } else {
        popup.innerHTML = `
          <div class="fb-result success">
            <ion-icon name="checkmark-circle-outline"></ion-icon>
            Bedankt voor je melding!
            <div class="fb-result-sub">We gaan ermee aan de slag</div>
          </div>`
      }
      setTimeout(() => popup.classList.remove('active'), 2500)
      return
    }
  })

  // Enable/disable next button as user types
  popup.addEventListener('input', (e) => {
    if (e.target.dataset.field === 'description') {
      const nextBtn = popup.querySelector('[data-action="next"]')
      if (nextBtn) nextBtn.disabled = !e.target.value.trim()
    }
  })
}
