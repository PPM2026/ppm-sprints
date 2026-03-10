/**
 * Code view — Claude Code sessions overview + live terminal.
 * Redesigned: dark terminal, minimal chrome, Claude Code desktop feel with PPM branding.
 */
import { supabase } from '../lib/supabase.js'
import {
  fetchExecution,
  fetchExecutionEvents,
  subscribeToExecutionEvents,
  subscribeToExecution,
  sendExecutionMessage,
  deleteExecution
} from '../services/sprints-service.js'

let unsubEvents = null
let unsubExec = null
let unsubList = null
let execution = null
let autoScroll = true
let elapsedInterval = null
let previewUrl = null
const pendingToolCalls = new Map()

function cleanup() {
  if (unsubEvents) { unsubEvents(); unsubEvents = null }
  if (unsubExec) { unsubExec(); unsubExec = null }
  if (unsubList) { unsubList(); unsubList = null }
  if (elapsedInterval) { clearInterval(elapsedInterval); elapsedInterval = null }
  document.querySelectorAll('.feedback-btn, .idea-fab').forEach(f => f.style.display = '')
  execution = null
  autoScroll = true
  previewUrl = null
  pendingToolCalls.clear()
}

export async function render(el, executionId) {
  cleanup()

  const fabs = document.querySelectorAll('.feedback-btn, .idea-fab')
  fabs.forEach(f => f.style.display = executionId ? 'none' : '')
  document.querySelectorAll('.idea-panel, .feedback-popup').forEach(f => f.style.display = 'none')

  if (executionId) {
    await renderTerminal(el, executionId)
  } else {
    el.style.display = ''
    el.style.flexDirection = ''
    el.style.height = ''
    await renderOverview(el)
  }
}

/* ═══════════════════════════════════════════
   OVERVIEW — clean session list
   ═══════════════════════════════════════════ */

async function renderOverview(el) {
  const [{ data: executions }, { data: platforms }] = await Promise.all([
    supabase.from('sprint_executions').select('*, sprints(name, display_id)').order('created_at', { ascending: false }).limit(30),
    supabase.from('platforms').select('*').order('name')
  ])

  const platformList = platforms || []
  const all = executions || []

  el.innerHTML = `
    <div class="main-header">
      <div>
        <div class="view-title">Code</div>
        <div class="view-sub">Claude Code sessies</div>
      </div>
      <button class="btn-primary" id="code-new-session">
        <ion-icon name="add-outline"></ion-icon> Nieuwe sessie
      </button>
    </div>
    <div class="cc-overview">
      ${all.length === 0 ? `
        <div class="cc-empty">
          <ion-icon name="terminal-outline"></ion-icon>
          <div class="cc-empty-title">Geen sessies</div>
          <div class="cc-empty-sub">Start een nieuwe Claude Code sessie</div>
        </div>
      ` : `
        <div class="cc-list">
          ${all.map(e => renderSessionCard(e)).join('')}
        </div>
      `}
    </div>

    <!-- New session dialog -->
    <div class="cc-dialog-overlay" id="code-new-dialog" style="display:none;">
      <div class="cc-dialog">
        <div class="cc-dialog-title">Nieuwe sessie</div>
        <div class="cc-dialog-field">
          <label>Platform</label>
          <div class="cc-platform-list" id="code-platform-list">
            ${platformList.map(p => `
              <div class="cc-platform-item" data-name="${escapeHtml(p.name)}" data-id="${p.id}">
                <span class="cc-platform-name">${escapeHtml(p.name)}</span>
                <button class="cc-platform-delete" data-id="${p.id}" title="Verwijder">
                  <ion-icon name="close-outline"></ion-icon>
                </button>
              </div>
            `).join('')}
            <div class="cc-platform-add" id="code-platform-add">
              <ion-icon name="add-outline"></ion-icon>
              <span>Nieuw platform</span>
            </div>
            <div class="cc-platform-add-form" id="code-platform-add-form" style="display:none;">
              <input type="text" id="code-new-platform-name" placeholder="bijv. ppm-nieuw-platform" />
              <button class="btn-primary btn-sm" id="code-platform-add-confirm">Toevoegen</button>
              <button class="btn-secondary btn-sm" id="code-platform-add-cancel">Annuleer</button>
            </div>
          </div>
        </div>
        <div class="cc-dialog-field">
          <label>Mode</label>
          <div class="cc-dialog-modes">
            <button class="cc-dialog-mode active" data-mode="plan">
              <ion-icon name="eye-outline"></ion-icon> Plan
            </button>
            <button class="cc-dialog-mode" data-mode="execute">
              <ion-icon name="flash-outline"></ion-icon> Bypass
            </button>
          </div>
        </div>
        <div class="cc-dialog-field">
          <label>Prompt</label>
          <textarea id="code-new-prompt" rows="5" placeholder="Wat moet Claude Code doen?"></textarea>
        </div>
        <div class="cc-dialog-actions">
          <button class="btn-secondary" id="code-new-cancel">Annuleer</button>
          <button class="btn-primary" id="code-new-start">Start sessie</button>
        </div>
      </div>
    </div>
  `

  // Session card clicks
  el.querySelectorAll('.cc-card').forEach(card => {
    card.addEventListener('click', () => {
      window.__ppmSwitchView('code', card.dataset.execId)
    })
  })

  // New session dialog logic
  const dialog = document.getElementById('code-new-dialog')
  let selectedMode = 'plan'
  let selectedPlatform = platformList.length > 0 ? platformList[0].name : null

  function updatePlatformSelection() {
    dialog.querySelectorAll('.cc-platform-item').forEach(item => {
      item.classList.toggle('selected', item.dataset.name === selectedPlatform)
    })
  }

  dialog.querySelectorAll('.cc-platform-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.cc-platform-delete')) return
      selectedPlatform = item.dataset.name
      updatePlatformSelection()
    })
  })
  updatePlatformSelection()

  // Delete platform
  dialog.querySelectorAll('.cc-platform-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const id = btn.dataset.id
      const name = btn.closest('.cc-platform-item').dataset.name
      if (!confirm(`Platform "${name}" verwijderen?`)) return
      await supabase.from('platforms').delete().eq('id', id)
      renderOverview(el)
    })
  })

  // Add platform
  const addBtn = document.getElementById('code-platform-add')
  const addForm = document.getElementById('code-platform-add-form')
  addBtn.addEventListener('click', () => {
    addBtn.style.display = 'none'
    addForm.style.display = 'flex'
    document.getElementById('code-new-platform-name').focus()
  })
  document.getElementById('code-platform-add-cancel').addEventListener('click', () => {
    addForm.style.display = 'none'
    addBtn.style.display = ''
  })
  document.getElementById('code-platform-add-confirm').addEventListener('click', async () => {
    const name = document.getElementById('code-new-platform-name').value.trim()
    if (!name) return
    const { error } = await supabase.from('platforms').insert({ name })
    if (error) { alert('Platform toevoegen mislukt: ' + error.message); return }
    renderOverview(el)
    setTimeout(() => {
      const d = document.getElementById('code-new-dialog')
      if (d) d.style.display = 'flex'
    }, 100)
  })

  document.getElementById('code-new-session').addEventListener('click', () => {
    dialog.style.display = 'flex'
  })
  document.getElementById('code-new-cancel').addEventListener('click', () => {
    dialog.style.display = 'none'
  })
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.style.display = 'none'
  })

  dialog.querySelectorAll('.cc-dialog-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      dialog.querySelectorAll('.cc-dialog-mode').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      selectedMode = btn.dataset.mode
    })
  })

  document.getElementById('code-new-start').addEventListener('click', async () => {
    if (!selectedPlatform) { alert('Selecteer een platform'); return }
    const prompt = document.getElementById('code-new-prompt').value.trim()
    if (!prompt) { alert('Voer een prompt in'); return }
    if (selectedMode === 'execute') {
      if (!confirm('Let op: Bypass mode wijzigt code en maakt een PR aan. Doorgaan?')) return
    }
    const { data: newExec, error } = await supabase
      .from('sprint_executions')
      .insert({ repo_name: selectedPlatform, status: 'queued', mode: selectedMode, prompt })
      .select().single()
    if (error) { alert('Sessie aanmaken mislukt: ' + error.message); return }
    dialog.style.display = 'none'
    window.__ppmSwitchView('code', newExec.id)
  })

  // Realtime overview updates
  const channel = supabase
    .channel('code-overview')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sprint_executions' }, () => {
      renderOverview(el)
    })
    .subscribe()
  unsubList = () => supabase.removeChannel(channel)
}

function renderSessionCard(exec) {
  const info = getStatusInfo(exec.status)
  const modeLabel = exec.mode === 'plan' ? 'Plan' : 'Bypass'
  const modeClass = exec.mode === 'plan' ? 'cc-mode-plan' : 'cc-mode-exec'
  const timeAgo = getTimeAgo(exec.completed_at || exec.started_at || exec.created_at)
  const isActive = ['queued', 'running', 'waiting'].includes(exec.status)

  return `
    <div class="cc-card ${isActive ? 'cc-card-active' : ''}" data-exec-id="${exec.id}">
      <div class="cc-card-left">
        <div class="cc-card-dot cc-dot-${exec.status}"></div>
        <div class="cc-card-info">
          <div class="cc-card-name">${escapeHtml(exec.repo_name)}</div>
        </div>
      </div>
      <div class="cc-card-right">
        <span class="cc-tag ${modeClass}">${modeLabel}</span>
        <span class="cc-tag cc-tag-${exec.status}">${info.label}</span>
        <span class="cc-card-time">${timeAgo}</span>
      </div>
    </div>
  `
}

/* ═══════════════════════════════════════════
   TERMINAL — dark Claude Code desktop feel
   ═══════════════════════════════════════════ */

async function renderTerminal(el, executionId) {
  try {
    execution = await fetchExecution(executionId)
  } catch {
    el.innerHTML = `
      <div class="main-header">
        <div>
          <div class="view-title">Code</div>
          <div class="view-sub">Sessie niet gevonden</div>
        </div>
      </div>
      <div class="cc-empty" style="padding:60px 20px;">
        <ion-icon name="alert-circle-outline"></ion-icon>
        <div class="cc-empty-title">Execution niet gevonden</div>
        <button class="btn-primary" style="margin-top:12px;" onclick="window.__ppmSwitchView('code')">Terug</button>
      </div>
    `
    return
  }

  const info = getStatusInfo(execution.status)
  const modeLabel = execution.mode === 'plan' ? 'PLAN' : 'BYPASS'
  const modeClass = execution.mode === 'plan' ? 'plan' : 'execute'
  const prompt = execution.sprints?.claude_code_prompt || execution.prompt || ''
  let isFinished = ['plan_ready', 'pr_created', 'failed', 'cancelled'].includes(execution.status)
  let isWaiting = execution.status === 'waiting'
  const isRunning = ['queued', 'running'].includes(execution.status)

  el.style.display = 'flex'
  el.style.flexDirection = 'column'
  el.style.height = '100vh'

  el.innerHTML = `
    <div class="ct-header">
      <button class="ct-back" id="code-back" title="Terug">
        <ion-icon name="chevron-back-outline"></ion-icon>
      </button>
      <span class="ct-repo">${escapeHtml(execution.repo_name)}</span>
      <div class="ct-mode ct-mode-${modeClass}">
        <ion-icon name="${execution.mode === 'plan' ? 'eye-outline' : 'flash-outline'}"></ion-icon>
        ${modeLabel}
      </div>
      <span style="flex:1;"></span>
      <div class="ct-elapsed" id="code-elapsed">
        <ion-icon name="time-outline"></ion-icon>
        <span id="code-term-time">0:00</span>
      </div>
      <span class="ct-status ct-status-${execution.status}" id="code-term-status">${info.label}</span>
      <button class="ct-preview-toggle" id="code-preview-btn" title="Preview" style="display:none">
        <ion-icon name="eye-outline"></ion-icon>
      </button>
    </div>

    ${prompt ? `
      <div class="ct-prompt-bar" id="code-prompt-section">
        <button class="ct-prompt-toggle" id="code-prompt-toggle">
          <ion-icon name="document-text-outline"></ion-icon>
          <span>Prompt</span>
          <ion-icon name="chevron-down-outline" class="ct-prompt-chevron" id="code-prompt-chevron"></ion-icon>
        </button>
        <div class="ct-prompt-body" id="code-prompt-content" style="display:none;">
          <pre class="ct-prompt-text">${escapeHtml(prompt)}</pre>
        </div>
      </div>
    ` : ''}

    <div class="ct-body">
      <div class="ct-chat-pane">
        <div class="ct-feed" id="code-terminal"></div>
        <div class="ct-new-output" id="code-new-output" style="display:none;">↓ Nieuwe output</div>
        <div class="ct-input-area">
          ${isFinished ? `
            <div class="ct-finished-actions">
              <button class="btn-primary" id="code-retry">
                <ion-icon name="refresh-outline"></ion-icon> Opnieuw
              </button>
              <button class="btn-secondary" id="code-new-from-term">
                <ion-icon name="add-outline"></ion-icon> Nieuw
              </button>
            </div>
          ` : ''}
          ${isWaiting ? `
            <div class="ct-waiting-actions" id="code-waiting-actions">
              ${execution.mode === 'plan' ? `
                <button class="ct-approve-btn" id="code-approve">
                  <ion-icon name="checkmark-circle-outline"></ion-icon> Goedkeuren & Uitvoeren
                </button>
              ` : ''}
              <button class="btn-secondary" id="code-done">
                <ion-icon name="checkmark-outline"></ion-icon> Afsluiten
              </button>
            </div>
          ` : ''}
          <div class="ct-input-box" id="code-input-container">
            <div class="ct-attachments" id="code-attachments" style="display:none"></div>
            <textarea id="code-message" placeholder="Message Claude Code..." rows="1"></textarea>
            <div class="ct-input-actions">
              <label class="ct-attach-btn" title="Bestand uploaden">
                <ion-icon name="attach-outline"></ion-icon>
                <input type="file" id="code-file-input" multiple accept="image/*,.pdf,.txt,.js,.css,.html,.json,.md,.csv" style="display:none">
              </label>
              <span class="ct-input-hint" id="code-input-hint">Enter om te versturen</span>
              <button id="code-action-btn" class="${isRunning ? 'ct-action-stop' : 'ct-action-send'}" title="${isRunning ? 'Stop' : 'Verstuur'}">
                <ion-icon name="${isRunning ? 'stop' : 'send-outline'}"></ion-icon>
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="ct-preview-pane" id="code-preview-pane" style="display:none">
        <div class="ct-preview-toolbar">
          <span class="ct-preview-url" id="code-preview-url">localhost</span>
          <button class="ct-preview-tool-btn" id="code-preview-refresh" title="Ververs">
            <ion-icon name="refresh-outline"></ion-icon>
          </button>
          <button class="ct-preview-tool-btn" id="code-preview-external" title="Open extern">
            <ion-icon name="open-outline"></ion-icon>
          </button>
          <button class="ct-preview-tool-btn" id="code-preview-close" title="Sluiten">
            <ion-icon name="close-outline"></ion-icon>
          </button>
        </div>
        <iframe class="ct-preview-iframe" id="code-preview-iframe" src=""></iframe>
      </div>
    </div>
  `

  const terminal = document.getElementById('code-terminal')
  const textarea = document.getElementById('code-message')
  const actionBtn = document.getElementById('code-action-btn')
  const newOutputBadge = document.getElementById('code-new-output')
  const attachmentsEl = document.getElementById('code-attachments')
  const fileInput = document.getElementById('code-file-input')
  const pendingFiles = [] // files waiting to be sent

  // File upload handling
  function addFiles(files) {
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) { alert('Max 10MB per bestand'); continue }
      pendingFiles.push(file)
    }
    renderAttachments()
  }

  function renderAttachments() {
    if (!pendingFiles.length) { attachmentsEl.style.display = 'none'; return }
    attachmentsEl.style.display = 'flex'
    attachmentsEl.innerHTML = pendingFiles.map((f, i) => {
      const isImg = f.type.startsWith('image/')
      const thumb = isImg ? URL.createObjectURL(f) : null
      return `<div class="ct-attachment" data-idx="${i}">
        ${thumb ? `<img src="${thumb}" class="ct-attachment-thumb">` : `<ion-icon name="document-outline" class="ct-attachment-icon"></ion-icon>`}
        <span class="ct-attachment-name">${escapeHtml(f.name.length > 20 ? f.name.substring(0, 17) + '...' : f.name)}</span>
        <button class="ct-attachment-remove" data-idx="${i}"><ion-icon name="close-outline"></ion-icon></button>
      </div>`
    }).join('')
    attachmentsEl.querySelectorAll('.ct-attachment-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        pendingFiles.splice(parseInt(btn.dataset.idx), 1)
        renderAttachments()
      })
    })
  }

  fileInput?.addEventListener('change', () => {
    if (fileInput.files.length) addFiles(Array.from(fileInput.files))
    fileInput.value = ''
  })

  // Paste images from clipboard
  textarea.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    const imageFiles = []
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    if (imageFiles.length) {
      e.preventDefault()
      addFiles(imageFiles)
    }
  })

  // Drag and drop
  const inputContainer = document.getElementById('code-input-container')
  inputContainer.addEventListener('dragover', (e) => { e.preventDefault(); inputContainer.classList.add('ct-drag-over') })
  inputContainer.addEventListener('dragleave', () => inputContainer.classList.remove('ct-drag-over'))
  inputContainer.addEventListener('drop', (e) => {
    e.preventDefault()
    inputContainer.classList.remove('ct-drag-over')
    if (e.dataTransfer.files.length) addFiles(Array.from(e.dataTransfer.files))
  })

  async function uploadPendingFiles() {
    if (!pendingFiles.length) return []
    const urls = []
    for (const file of pendingFiles) {
      const ext = file.name.split('.').pop() || 'bin'
      const fileName = `${executionId}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`
      const { error } = await supabase.storage.from('code-attachments').upload(fileName, file, { contentType: file.type, upsert: false })
      if (error) { console.warn('Upload failed:', error.message); continue }
      const { data: { publicUrl } } = supabase.storage.from('code-attachments').getPublicUrl(fileName)
      urls.push({ name: file.name, url: publicUrl, type: file.type })
    }
    pendingFiles.length = 0
    renderAttachments()
    return urls
  }

  // Prompt toggle
  const promptToggle = document.getElementById('code-prompt-toggle')
  const promptContent = document.getElementById('code-prompt-content')
  const promptChevron = document.getElementById('code-prompt-chevron')
  if (promptToggle) {
    promptToggle.addEventListener('click', () => {
      const open = promptContent.style.display !== 'none'
      promptContent.style.display = open ? 'none' : 'block'
      promptChevron.name = open ? 'chevron-down-outline' : 'chevron-up-outline'
    })
  }

  // Load existing events
  const existingEvents = await fetchExecutionEvents(executionId)
  for (const evt of existingEvents) appendEvent(terminal, evt)
  terminal.scrollTop = terminal.scrollHeight

  // Auto-scroll detection
  terminal.addEventListener('scroll', () => {
    const nearBottom = terminal.scrollHeight - terminal.scrollTop - terminal.clientHeight < 100
    autoScroll = nearBottom
    if (nearBottom) newOutputBadge.style.display = 'none'
  })
  newOutputBadge.addEventListener('click', () => {
    terminal.scrollTop = terminal.scrollHeight
    autoScroll = true
    newOutputBadge.style.display = 'none'
  })

  // Realtime events
  unsubEvents = subscribeToExecutionEvents(executionId, (payload) => {
    if (payload.new.event_type === 'user') return
    appendEvent(terminal, payload.new)
    if (autoScroll) terminal.scrollTop = terminal.scrollHeight
    else newOutputBadge.style.display = 'block'
  })

  // Execution status updates
  unsubExec = subscribeToExecution(executionId, (payload) => {
    execution = payload.new
    isFinished = ['plan_ready', 'pr_created', 'failed', 'cancelled'].includes(execution.status)
    isWaiting = execution.status === 'waiting'
    const isNowRunning = ['queued', 'running'].includes(execution.status)
    const newInfo = getStatusInfo(execution.status)

    // Update status badge
    const statusBadge = document.getElementById('code-term-status')
    if (statusBadge) {
      statusBadge.className = `ct-status ct-status-${execution.status}`
      statusBadge.textContent = newInfo.label
    }

    // Update mode pill
    const modePill = el.querySelector('.ct-mode')
    if (modePill) {
      const isPlan = execution.mode === 'plan'
      modePill.className = `ct-mode ct-mode-${isPlan ? 'plan' : 'execute'}`
      modePill.innerHTML = `<ion-icon name="${isPlan ? 'eye-outline' : 'flash-outline'}"></ion-icon> ${isPlan ? 'PLAN' : 'BYPASS'}`
    }

    updateActionBtn()

    // Update waiting/finished actions dynamically
    const inputArea = el.querySelector('.ct-input-area')
    const existingWaiting = document.getElementById('code-waiting-actions')
    const existingFinished = el.querySelector('.ct-finished-actions')

    if (isWaiting && !existingWaiting) {
      if (existingFinished) existingFinished.remove()
      const waitDiv = document.createElement('div')
      waitDiv.className = 'ct-waiting-actions'
      waitDiv.id = 'code-waiting-actions'
      waitDiv.innerHTML = `
        ${execution.mode === 'plan' ? `
          <button class="ct-approve-btn" id="code-approve">
            <ion-icon name="checkmark-circle-outline"></ion-icon> Goedkeuren & Uitvoeren
          </button>
        ` : ''}
        <button class="btn-secondary" id="code-done">
          <ion-icon name="checkmark-outline"></ion-icon> Afsluiten
        </button>
      `
      inputArea.insertBefore(waitDiv, document.getElementById('code-input-container'))
      bindWaitingActions()
    } else if (!isWaiting && existingWaiting) {
      existingWaiting.remove()
    }

    if (isFinished && !existingFinished) {
      if (existingWaiting) existingWaiting.remove()
      const finDiv = document.createElement('div')
      finDiv.className = 'ct-finished-actions'
      finDiv.innerHTML = `
        <button class="btn-primary" id="code-retry">
          <ion-icon name="refresh-outline"></ion-icon> Opnieuw
        </button>
        <button class="btn-secondary" id="code-new-from-term">
          <ion-icon name="add-outline"></ion-icon> Nieuw
        </button>
      `
      inputArea.insertBefore(finDiv, document.getElementById('code-input-container'))
      bindFinishedActions()
    }
  })

  // Chat input
  async function handleSend() {
    const content = textarea.value.trim()
    const hasFiles = pendingFiles.length > 0
    if (!content && !hasFiles) return
    textarea.value = ''
    textarea.style.height = 'auto'

    // Upload files first
    let attachments = []
    if (hasFiles) {
      try {
        attachments = await uploadPendingFiles()
      } catch (err) {
        appendEvent(terminal, { event_type: 'error', content: { message: `Upload mislukt: ${err.message}` }, created_at: new Date().toISOString() })
        return
      }
    }

    // Build message with attachment URLs
    let fullMessage = content || ''
    if (attachments.length) {
      const attachInfo = attachments.map(a => {
        if (a.type.startsWith('image/')) return `[Afbeelding: ${a.name}](${a.url})`
        return `[Bestand: ${a.name}](${a.url})`
      }).join('\n')
      fullMessage = fullMessage ? `${fullMessage}\n\n${attachInfo}` : attachInfo
    }

    appendEvent(terminal, {
      event_type: 'user',
      content: { message: content || (attachments.length ? `📎 ${attachments.map(a => a.name).join(', ')}` : ''), attachments },
      created_at: new Date().toISOString()
    })
    if (autoScroll) terminal.scrollTop = terminal.scrollHeight

    try {
      if (isFinished) {
        await supabase
          .from('sprint_executions')
          .update({ status: 'waiting', completed_at: null, current_task: 'Wacht op verwerking...' })
          .eq('id', executionId)
      }
      await sendExecutionMessage(executionId, fullMessage)
    } catch (err) {
      appendEvent(terminal, {
        event_type: 'error',
        content: { message: `Versturen mislukt: ${err.message}` },
        created_at: new Date().toISOString()
      })
    }
  }

  function updateActionBtn() {
    const hasText = textarea.value.trim().length > 0
    const isNowRunning = execution && ['queued', 'running'].includes(execution.status)
    if (hasText || isFinished || isWaiting) {
      actionBtn.className = 'ct-action-send'
      actionBtn.title = 'Verstuur'
      actionBtn.querySelector('ion-icon').name = 'send-outline'
    } else if (isNowRunning) {
      actionBtn.className = 'ct-action-stop'
      actionBtn.title = 'Stop'
      actionBtn.querySelector('ion-icon').name = 'stop'
    }
    actionBtn.disabled = false
  }

  actionBtn.addEventListener('click', async () => {
    const hasText = textarea.value.trim().length > 0
    const isNowRunning = execution && ['queued', 'running'].includes(execution.status)
    if (hasText) {
      handleSend()
      setTimeout(updateActionBtn, 0)
    } else if (isNowRunning) {
      if (!confirm('Sessie stoppen?')) return
      actionBtn.disabled = true
      actionBtn.innerHTML = '<ion-icon name="hourglass-outline"></ion-icon>'
      try {
        await sendExecutionMessage(executionId, '__STOP__')
        appendEvent(terminal, { event_type: 'system', content: { message: 'Stop verzoek verstuurd...' }, created_at: new Date().toISOString() })
        if (autoScroll) terminal.scrollTop = terminal.scrollHeight
      } catch (err) {
        appendEvent(terminal, { event_type: 'error', content: { message: `Stop mislukt: ${err.message}` }, created_at: new Date().toISOString() })
      }
    }
  })
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); setTimeout(updateActionBtn, 0) }
  })
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
    updateActionBtn()
  })

  // --- Action button bindings ---
  function bindFinishedActions() {
    const retryBtn = document.getElementById('code-retry')
    if (retryBtn) {
      retryBtn.addEventListener('click', async () => {
        const { data: newExec, error } = await supabase
          .from('sprint_executions')
          .insert({
            sprint_id: execution.sprint_id || null,
            repo_name: execution.repo_name,
            status: 'queued',
            mode: execution.mode,
            branch_name: execution.branch_name,
            prompt: execution.prompt
          })
          .select().single()
        if (error) { alert('Opnieuw starten mislukt: ' + error.message); return }
        window.__ppmSwitchView('code', newExec.id)
      })
    }
    const newFromTermBtn = document.getElementById('code-new-from-term')
    if (newFromTermBtn) {
      newFromTermBtn.addEventListener('click', () => {
        window.__ppmSwitchView('code')
        setTimeout(() => {
          const btn = document.getElementById('code-new-session')
          if (btn) btn.click()
        }, 100)
      })
    }
  }

  function bindWaitingActions() {
    const approveBtn = document.getElementById('code-approve')
    if (approveBtn) {
      approveBtn.addEventListener('click', async () => {
        if (!confirm('Plan goedkeuren en uitvoeren in bypass mode?')) return
        approveBtn.disabled = true
        approveBtn.innerHTML = '<ion-icon name="hourglass-outline"></ion-icon> Bezig...'
        try {
          await sendExecutionMessage(executionId, '__APPROVE__')
          appendEvent(terminal, { event_type: 'system', content: { message: 'Plan goedgekeurd — overschakelen naar uitvoermodus...' }, created_at: new Date().toISOString() })
          if (autoScroll) terminal.scrollTop = terminal.scrollHeight
        } catch (err) {
          appendEvent(terminal, { event_type: 'error', content: { message: `Goedkeuren mislukt: ${err.message}` }, created_at: new Date().toISOString() })
          approveBtn.disabled = false
          approveBtn.innerHTML = '<ion-icon name="checkmark-circle-outline"></ion-icon> Goedkeuren & Uitvoeren'
        }
      })
    }
    const doneBtn = document.getElementById('code-done')
    if (doneBtn) {
      doneBtn.addEventListener('click', async () => {
        doneBtn.disabled = true
        try {
          await sendExecutionMessage(executionId, '__DONE__')
          appendEvent(terminal, { event_type: 'system', content: { message: 'Sessie wordt afgesloten...' }, created_at: new Date().toISOString() })
          if (autoScroll) terminal.scrollTop = terminal.scrollHeight
        } catch (err) {
          appendEvent(terminal, { event_type: 'error', content: { message: `Afsluiten mislukt: ${err.message}` }, created_at: new Date().toISOString() })
          doneBtn.disabled = false
        }
      })
    }
  }

  bindFinishedActions()
  bindWaitingActions()

  // Back
  document.getElementById('code-back').addEventListener('click', () => {
    window.__ppmSwitchView('code')
  })

  // Preview toggle
  const previewBtn = document.getElementById('code-preview-btn')
  const previewPane = document.getElementById('code-preview-pane')
  const previewIframe = document.getElementById('code-preview-iframe')
  const previewUrlEl = document.getElementById('code-preview-url')

  function togglePreview() {
    const isOpen = previewPane.style.display !== 'none'
    if (isOpen) {
      previewPane.style.display = 'none'
      previewBtn.classList.remove('active')
      previewIframe.src = ''
    } else if (previewUrl) {
      previewPane.style.display = ''
      previewBtn.classList.add('active')
      previewIframe.src = previewUrl
      previewUrlEl.textContent = previewUrl.replace('http://', '')
    }
  }
  previewBtn.addEventListener('click', togglePreview)
  document.getElementById('code-preview-refresh').addEventListener('click', () => {
    if (previewIframe.src) previewIframe.src = previewIframe.src
  })
  document.getElementById('code-preview-external').addEventListener('click', () => {
    if (previewUrl) window.open(previewUrl, '_blank')
  })
  document.getElementById('code-preview-close').addEventListener('click', () => {
    previewPane.style.display = 'none'
    previewBtn.classList.remove('active')
    previewIframe.src = ''
  })

  // Elapsed time
  updateElapsed()
  elapsedInterval = setInterval(() => {
    if (!document.getElementById('code-term-time')) { clearInterval(elapsedInterval); return }
    updateElapsed()
  }, 1000)
}

/* ═══════════════════════════════════════════
   EVENT RENDERING
   ═══════════════════════════════════════════ */

const TOOL_ICONS = {
  Read: 'document-text-outline', Edit: 'create-outline', Write: 'document-outline',
  Bash: 'terminal-outline', Grep: 'search-outline', Glob: 'folder-open-outline',
  Agent: 'git-branch-outline', TodoWrite: 'list-outline',
  WebSearch: 'globe-outline', WebFetch: 'cloud-download-outline'
}
const TOOL_COLORS = {
  Read: 'blue', Edit: 'amber', Write: 'amber', Bash: 'gray', Grep: 'purple',
  Glob: 'green', Agent: 'blue', TodoWrite: 'gray', WebSearch: 'blue', WebFetch: 'blue'
}

function appendEvent(terminal, evt) {
  const c = evt.content || {}

  switch (evt.event_type) {
    case 'text': {
      const div = document.createElement('div')
      div.className = 'ce-text'
      div.innerHTML = `<div class="ce-text-body">${formatText(c.text || '')}</div>`
      terminal.appendChild(div)
      break
    }

    case 'thinking': {
      const text = c.text || ''
      const preview = text.length > 80 ? text.substring(0, 80) + '...' : text
      const block = document.createElement('div')
      block.className = 'ce-thinking'
      block.innerHTML = `
        <button class="ce-thinking-header">
          <span class="ce-thinking-asterisk">✳</span>
          <span class="ce-thinking-label">Thinking</span>
          <span class="ce-thinking-preview">${escapeHtml(preview)}</span>
          <ion-icon name="chevron-forward-outline" class="ce-thinking-chevron"></ion-icon>
        </button>
        <div class="ce-thinking-content" style="display:none">${escapeHtml(text)}</div>
      `
      block.querySelector('.ce-thinking-header').addEventListener('click', () => {
        const content = block.querySelector('.ce-thinking-content')
        const chevron = block.querySelector('.ce-thinking-chevron')
        const isOpen = content.style.display !== 'none'
        content.style.display = isOpen ? 'none' : 'block'
        chevron.name = isOpen ? 'chevron-forward-outline' : 'chevron-down-outline'
        block.classList.toggle('open', !isOpen)
      })
      terminal.appendChild(block)
      break
    }

    case 'tool_start': {
      const toolId = c.tool_use_id
      const icon = TOOL_ICONS[c.tool] || 'code-outline'
      const color = TOOL_COLORS[c.tool] || 'gray'
      const filePath = c.input?.file_path || c.input?.pattern || ''
      const shortPath = filePath ? filePath.split('/').slice(-2).join('/') : ''
      const cmd = c.input?.command || ''
      const query = c.input?.query || c.input?.prompt || ''
      const detail = shortPath || (cmd ? cmd.substring(0, 100) : '') || (query ? query.substring(0, 100) : '')

      const card = document.createElement('div')
      card.className = 'ce-tool'
      card.dataset.toolId = toolId
      card.innerHTML = `
        <div class="ce-tool-header">
          <div class="ce-tool-icon ce-tool-icon-${color}">
            <ion-icon name="${icon}"></ion-icon>
          </div>
          <span class="ce-tool-name">${escapeHtml(c.tool || 'Tool')}</span>
          <span class="ce-tool-detail">${escapeHtml(detail)}</span>
          <div class="ce-tool-dots"><span></span><span></span><span></span></div>
        </div>
      `
      terminal.appendChild(card)
      if (toolId) pendingToolCalls.set(toolId, card)
      break
    }

    case 'tool_result': {
      const toolId = c.tool_use_id
      const output = c.output || ''
      const card = toolId ? pendingToolCalls.get(toolId) : null

      if (card) {
        const spinner = card.querySelector('.ce-tool-dots')
        if (spinner) spinner.remove()
        if (c.is_error) card.classList.add('error')
        else card.classList.add('done')

        if (output.trim()) {
          const lines = output.split('\n')
          const resultDiv = document.createElement('div')
          resultDiv.className = 'ce-tool-result'
          resultDiv.innerHTML = `
            <button class="ce-tool-result-toggle">
              <ion-icon name="chevron-forward-outline"></ion-icon>
              <span>${lines.length} ${lines.length === 1 ? 'regel' : 'regels'}</span>
            </button>
            <pre class="ce-tool-result-output" style="display:none">${escapeHtml(output)}</pre>
          `
          resultDiv.querySelector('.ce-tool-result-toggle').addEventListener('click', function () {
            const pre = resultDiv.querySelector('.ce-tool-result-output')
            const chevron = this.querySelector('ion-icon')
            const isOpen = pre.style.display !== 'none'
            pre.style.display = isOpen ? 'none' : 'block'
            chevron.name = isOpen ? 'chevron-forward-outline' : 'chevron-down-outline'
          })
          card.appendChild(resultDiv)
        }
        pendingToolCalls.delete(toolId)
      } else if (output.trim()) {
        const div = document.createElement('div')
        div.className = 'ce-standalone-result'
        const lines = output.split('\n')
        div.innerHTML = `<pre class="ce-result-pre">${escapeHtml(lines.length > 4 ? lines.slice(0, 4).join('\n') : output)}</pre>`
        if (c.is_error) div.classList.add('ce-error')
        terminal.appendChild(div)
      }
      break
    }

    case 'error': {
      const div = document.createElement('div')
      div.className = 'ce-error'
      div.innerHTML = `
        <ion-icon name="alert-circle-outline" class="ce-error-icon"></ion-icon>
        <span>${escapeHtml(c.message || '')}</span>
      `
      terminal.appendChild(div)
      break
    }

    case 'system': {
      const div = document.createElement('div')
      div.className = 'ce-system'
      div.innerHTML = `
        <span class="ce-system-line"></span>
        <span class="ce-system-text">${escapeHtml(c.message || '')}</span>
        <span class="ce-system-line"></span>
      `
      terminal.appendChild(div)
      break
    }

    case 'preview': {
      try {
        const data = typeof c === 'string' ? JSON.parse(c) : c
        previewUrl = data.url || null
        const btn = document.getElementById('code-preview-btn')
        if (btn && previewUrl) btn.style.display = ''
      } catch { /* ignore */ }
      const pdiv = document.createElement('div')
      pdiv.className = 'ce-system'
      const urlText = previewUrl ? previewUrl.replace('http://', '') : 'Preview'
      pdiv.innerHTML = `
        <span class="ce-system-line"></span>
        <span class="ce-system-text">Preview: ${escapeHtml(urlText)}</span>
        <span class="ce-system-line"></span>
      `
      terminal.appendChild(pdiv)
      break
    }

    case 'user': {
      const div = document.createElement('div')
      div.className = 'ce-user'
      const attachHtml = (c.attachments || []).map(a => {
        if (a.type?.startsWith('image/')) {
          return `<img src="${escapeHtml(a.url)}" class="ce-user-image" alt="${escapeHtml(a.name)}" onclick="window.open('${escapeHtml(a.url)}','_blank')">`
        }
        return `<a href="${escapeHtml(a.url)}" target="_blank" class="ce-user-file"><ion-icon name="document-outline"></ion-icon> ${escapeHtml(a.name)}</a>`
      }).join('')
      div.innerHTML = `
        <div class="ce-user-bubble">
          ${c.message ? escapeHtml(c.message) : ''}
          ${attachHtml ? `<div class="ce-user-attachments">${attachHtml}</div>` : ''}
        </div>
        <div class="ce-user-avatar"><ion-icon name="person"></ion-icon></div>
      `
      terminal.appendChild(div)
      break
    }

    default: {
      const div = document.createElement('div')
      div.className = 'ce-text'
      div.innerHTML = `<span style="opacity:0.4">${escapeHtml(JSON.stringify(c))}</span>`
      terminal.appendChild(div)
    }
  }
}

/* ═══════════════════════════════════════════
   TEXT FORMATTING (markdown subset)
   ═══════════════════════════════════════════ */

function formatText(text) {
  let html = escapeHtml(text)
  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="ce-codeblock"><code>$2</code></pre>')
  // Tables
  html = html.replace(/((?:^\|.+\|$\n?)+)/gm, (tableBlock) => {
    const rows = tableBlock.trim().split('\n').filter(r => r.trim())
    if (rows.length < 2) return tableBlock
    const isSep = /^\|[\s\-:]+\|/.test(rows[1])
    if (!isSep) return tableBlock
    const parseRow = (row) => row.split('|').slice(1, -1).map(c => c.trim())
    const headerCells = parseRow(rows[0])
    const datRows = rows.slice(2)
    let t = '<div class="ce-table-wrap"><table class="ce-table"><thead><tr>'
    headerCells.forEach(c => { t += `<th>${c}</th>` })
    t += '</tr></thead><tbody>'
    datRows.forEach(row => {
      const cells = parseRow(row)
      t += '<tr>'
      cells.forEach(c => { t += `<td>${c}</td>` })
      t += '</tr>'
    })
    t += '</tbody></table></div>'
    return t
  })
  // Horizontal rules
  html = html.replace(/^---+$/gm, '<div class="ce-hr"></div>')
  // Headers
  html = html.replace(/^### (.+)$/gm, '<div class="ce-h3">$1</div>')
  html = html.replace(/^## (.+)$/gm, '<div class="ce-h2">$1</div>')
  html = html.replace(/^# (.+)$/gm, '<div class="ce-h1">$1</div>')
  // Bold + italic
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  // Bullet lists
  html = html.replace(/^[-*] (.+)$/gm, '<div class="ce-li">$1</div>')
  // Numbered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<div class="ce-li ce-ol">$1</div>')
  return html
}

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */

function updateElapsed() {
  const el = document.getElementById('code-term-time')
  if (!el || !execution?.started_at) return
  const start = new Date(execution.started_at)
  const end = execution.completed_at ? new Date(execution.completed_at) : new Date()
  const diff = Math.floor((end - start) / 1000)
  const mins = Math.floor(diff / 60)
  const secs = diff % 60
  el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`
}

function getStatusInfo(status) {
  const map = {
    queued: { label: 'Wachtrij' },
    running: { label: 'Actief' },
    waiting: { label: 'Wacht' },
    plan_ready: { label: 'Plan klaar' },
    pr_created: { label: 'PR klaar' },
    failed: { label: 'Mislukt' },
    cancelled: { label: 'Gestopt' }
  }
  return map[status] || { label: status }
}

function getTimeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'zojuist'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}u`
  return `${Math.floor(diff / 86400)}d`
}

function truncate(str, max) {
  if (!str || str.length <= max) return str
  return str.substring(0, max) + '...'
}

function escapeHtml(text) {
  const d = document.createElement('div')
  d.textContent = text
  return d.innerHTML
}
