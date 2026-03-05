/**
 * Code view — Claude Code sessions overview + live terminal.
 * Sidebar item under "Werk". Shows all execution sessions with live terminal view.
 */
import { supabase } from '../lib/supabase.js'
import {
  fetchExecution,
  fetchExecutionEvents,
  subscribeToExecutionEvents,
  subscribeToExecution,
  sendExecutionMessage
} from '../services/sprints-service.js'

let unsubEvents = null
let unsubExec = null
let unsubList = null
let execution = null
let autoScroll = true
let elapsedInterval = null

function cleanup() {
  if (unsubEvents) { unsubEvents(); unsubEvents = null }
  if (unsubExec) { unsubExec(); unsubExec = null }
  if (unsubList) { unsubList(); unsubList = null }
  if (elapsedInterval) { clearInterval(elapsedInterval); elapsedInterval = null }
  execution = null
  autoScroll = true
}

export async function render(el, executionId) {
  cleanup()

  if (executionId) {
    await renderTerminal(el, executionId)
  } else {
    await renderOverview(el)
  }
}

// --- OVERVIEW ---

async function renderOverview(el) {
  const { data: executions } = await supabase
    .from('sprint_executions')
    .select('*, sprints(name, display_id)')
    .order('created_at', { ascending: false })
    .limit(30)

  const active = (executions || []).filter(e => ['queued', 'running'].includes(e.status))
  const recent = (executions || []).filter(e => !['queued', 'running'].includes(e.status))

  el.innerHTML = `
    <div class="main-header">
      <div>
        <div class="view-title">Code</div>
        <div class="view-sub">Claude Code sessies op Mac Mini</div>
      </div>
    </div>
    <div class="code-overview-body">
      ${active.length > 0 ? `
        <div class="code-section-title">Actieve sessies</div>
        <div class="code-sessions">
          ${active.map(e => renderSessionCard(e)).join('')}
        </div>
      ` : ''}

      ${recent.length > 0 ? `
        <div class="code-section-title" style="margin-top:${active.length ? 20 : 0}px;">Recente sessies</div>
        <div class="code-sessions">
          ${recent.map(e => renderSessionCard(e)).join('')}
        </div>
      ` : ''}

      ${(!executions || executions.length === 0) ? `
        <div class="empty-state" style="padding:60px 20px;">
          <ion-icon name="terminal-outline" style="font-size:32px;display:block;margin-bottom:8px;color:rgba(0,0,0,0.15);"></ion-icon>
          <div>Nog geen Claude Code sessies</div>
          <div style="font-size:11px;color:rgba(0,0,0,0.3);margin-top:4px;">Start een sprint in plan of execute modus</div>
        </div>
      ` : ''}
    </div>
  `

  // Click handlers for session cards
  el.querySelectorAll('.code-session-card').forEach(card => {
    card.addEventListener('click', () => {
      window.__ppmSwitchView('code', card.dataset.execId)
    })
  })

  // Subscribe to execution changes for live overview updates
  const channel = supabase
    .channel('code-overview')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'sprint_executions'
    }, () => {
      renderOverview(el)
    })
    .subscribe()

  unsubList = () => supabase.removeChannel(channel)
}

function renderSessionCard(exec) {
  const info = getStatusInfo(exec.status)
  const sprintName = exec.sprints?.name || 'Sprint'
  const sprintId = exec.sprints?.display_id ? `S-${exec.sprints.display_id}` : ''
  const modeLabel = exec.mode === 'plan' ? 'Plan' : 'Bypass'
  const modeClass = exec.mode === 'plan' ? 'code-mode-plan' : 'code-mode-exec'
  const timeAgo = getTimeAgo(exec.completed_at || exec.started_at || exec.created_at)
  const isActive = ['queued', 'running'].includes(exec.status)
  const pct = exec.progress_pct || 0

  return `
    <div class="code-session-card ${isActive ? 'code-card-active' : ''}" data-exec-id="${exec.id}">
      <div class="code-card-left">
        <div class="code-session-dot code-dot-${exec.status}"></div>
        <div class="code-session-info">
          <div class="code-session-name">${escapeHtml(exec.repo_name)}</div>
          <div class="code-session-meta">
            ${sprintId ? `<span class="code-session-sprint">${sprintId}</span>` : ''}
            <span>${truncate(sprintName, 40)}</span>
          </div>
          ${isActive && exec.current_task ? `<div class="code-session-task">${escapeHtml(exec.current_task)}</div>` : ''}
        </div>
      </div>
      <div class="code-card-right">
        <div class="code-card-tags">
          <span class="code-tag ${modeClass}">${modeLabel}</span>
          <span class="code-tag code-tag-status code-tag-${exec.status}">${info.label}</span>
        </div>
        ${isActive && pct > 0 ? `
          <div class="code-progress">
            <div class="code-progress-bar" style="width:${pct}%"></div>
          </div>
        ` : ''}
        <div class="code-session-time">${timeAgo}</div>
      </div>
    </div>
  `
}

// --- TERMINAL VIEW ---

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
      <div class="empty-state" style="padding:60px 20px;">
        <ion-icon name="alert-circle-outline" style="font-size:28px;display:block;margin-bottom:8px;color:rgba(0,0,0,0.15);"></ion-icon>
        Execution niet gevonden
        <button class="btn-primary" style="margin-top:12px;" onclick="window.__ppmSwitchView('code')">Terug naar overzicht</button>
      </div>
    `
    return
  }

  const info = getStatusInfo(execution.status)
  const modeLabel = execution.mode === 'plan' ? 'Plan' : 'Execute'
  const modeClass = execution.mode === 'plan' ? 'code-mode-plan' : 'code-mode-exec'
  const sprintName = execution.sprints?.name || ''
  const sprintId = execution.sprints?.display_id ? `S-${execution.sprints.display_id}` : ''
  const prompt = execution.sprints?.claude_code_prompt || ''
  let isFinished = ['plan_ready', 'pr_created', 'failed', 'cancelled'].includes(execution.status)

  el.innerHTML = `
    <div class="code-term-header">
      <button class="code-back" id="code-back">
        <ion-icon name="chevron-back-outline"></ion-icon> Overzicht
      </button>
      <div class="code-term-title">
        <span class="code-term-repo">${escapeHtml(execution.repo_name)}</span>
        ${sprintId ? `<span class="code-term-sprint">${sprintId}</span>` : ''}
      </div>
      <div class="code-term-badges">
        <span class="code-session-dot code-dot-${execution.status}"></span>
        <span class="code-term-status" id="code-term-status">${info.label}</span>
        <span class="code-tag ${modeClass}">${modeLabel}</span>
      </div>
      <span style="flex:1;"></span>
      <span class="code-term-time" id="code-term-time"></span>
    </div>

    ${prompt ? `
      <div class="code-prompt-section" id="code-prompt-section">
        <button class="code-prompt-toggle" id="code-prompt-toggle">
          <ion-icon name="document-text-outline"></ion-icon>
          <span>Prompt</span>
          <ion-icon name="chevron-down-outline" class="code-prompt-chevron" id="code-prompt-chevron"></ion-icon>
        </button>
        <div class="code-prompt-content" id="code-prompt-content" style="display:none;">
          <pre class="code-prompt-text">${escapeHtml(prompt)}</pre>
        </div>
      </div>
    ` : ''}

    <div class="code-term-body">
      <div class="code-terminal" id="code-terminal"></div>
      <div class="code-new-output" id="code-new-output" style="display:none;">↓ Nieuwe output</div>
      <div class="code-input-area">
        <div class="code-input">
          <textarea id="code-message" placeholder="Typ een bericht naar Claude Code..." rows="1"></textarea>
          <button id="code-send" title="Verstuur bericht">
            <ion-icon name="send-outline"></ion-icon>
          </button>
        </div>
        <div class="code-input-hint">Enter om te versturen, Shift+Enter voor nieuwe regel</div>
      </div>
    </div>

    <div class="code-bottom-bar">
      <div class="code-mode-toggle" id="code-mode-toggle">
        <button class="code-mode-btn ${execution.mode === 'plan' ? 'active' : ''}" data-mode="plan">
          <ion-icon name="eye-outline"></ion-icon> Plan
        </button>
        <button class="code-mode-btn ${execution.mode !== 'plan' ? 'active' : ''}" data-mode="execute">
          <ion-icon name="flash-outline"></ion-icon> Bypass
        </button>
      </div>
      <div class="code-bottom-info">
        ${sprintName ? `<span>${truncate(sprintName, 50)}</span>` : ''}
      </div>
    </div>
  `

  const terminal = document.getElementById('code-terminal')
  const textarea = document.getElementById('code-message')
  const sendBtn = document.getElementById('code-send')
  const newOutputBadge = document.getElementById('code-new-output')

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
  for (const evt of existingEvents) {
    appendEvent(terminal, evt)
  }
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
    appendEvent(terminal, payload.new)
    if (autoScroll) {
      terminal.scrollTop = terminal.scrollHeight
    } else {
      newOutputBadge.style.display = 'block'
    }
  })

  // Execution status updates
  unsubExec = subscribeToExecution(executionId, (payload) => {
    execution = payload.new
    isFinished = ['plan_ready', 'pr_created', 'failed', 'cancelled'].includes(execution.status)
    const newInfo = getStatusInfo(execution.status)
    const dot = el.querySelector('.code-session-dot')
    const label = document.getElementById('code-term-status')
    if (dot) dot.className = `code-session-dot code-dot-${execution.status}`
    if (label) label.textContent = newInfo.label
    // Update mode toggle state
    if (isFinished) {
      el.querySelectorAll('.code-mode-btn').forEach(b => b.classList.remove('disabled'))
    }
  })

  // Chat
  async function handleSend() {
    const content = textarea.value.trim()
    if (!content) return
    textarea.value = ''
    textarea.style.height = 'auto'

    appendEvent(terminal, {
      event_type: 'user',
      content: { message: content },
      created_at: new Date().toISOString()
    })
    if (autoScroll) terminal.scrollTop = terminal.scrollHeight

    try {
      await sendExecutionMessage(executionId, content)
    } catch (err) {
      appendEvent(terminal, {
        event_type: 'error',
        content: { message: `Versturen mislukt: ${err.message}` },
        created_at: new Date().toISOString()
      })
    }
  }

  sendBtn.addEventListener('click', handleSend)
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  })
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
  })

  // Mode toggle — creates new execution with different mode
  document.getElementById('code-mode-toggle').addEventListener('click', async (e) => {
    const btn = e.target.closest('.code-mode-btn')
    if (!btn || btn.classList.contains('active')) return
    const newMode = btn.dataset.mode

    // Only allow toggling if current session is finished
    if (!isFinished) {
      appendEvent(terminal, {
        event_type: 'system',
        content: { message: 'Kan niet wisselen terwijl sessie actief is. Wacht tot de sessie is afgerond.' },
        created_at: new Date().toISOString()
      })
      return
    }

    // Create new execution with different mode
    const { data: newExec, error } = await supabase
      .from('sprint_executions')
      .insert({
        sprint_id: execution.sprint_id,
        repo_name: execution.repo_name,
        status: 'queued',
        mode: newMode,
        branch_name: execution.branch_name
      })
      .select()
      .single()

    if (error) {
      appendEvent(terminal, {
        event_type: 'error',
        content: { message: `Kon nieuwe sessie niet starten: ${error.message}` },
        created_at: new Date().toISOString()
      })
      return
    }

    // Navigate to new execution
    window.__ppmSwitchView('code', newExec.id)
  })

  // Back
  document.getElementById('code-back').addEventListener('click', () => {
    window.__ppmSwitchView('code')
  })

  // Elapsed time
  updateElapsed()
  elapsedInterval = setInterval(() => {
    if (!document.getElementById('code-term-time')) {
      clearInterval(elapsedInterval)
      return
    }
    updateElapsed()
  }, 1000)
}

// --- EVENT RENDERING ---

const TOOL_ICONS = {
  Read: 'document-text-outline',
  Edit: 'create-outline',
  Write: 'document-outline',
  Bash: 'terminal-outline',
  Grep: 'search-outline',
  Glob: 'folder-open-outline',
  Agent: 'git-branch-outline',
  TodoWrite: 'list-outline',
  WebSearch: 'globe-outline',
  WebFetch: 'cloud-download-outline'
}

function appendEvent(terminal, evt) {
  const div = document.createElement('div')
  div.className = `code-event code-event-${evt.event_type}`
  const c = evt.content || {}

  switch (evt.event_type) {
    case 'text':
      div.innerHTML = `<div class="code-event-body">${formatText(c.text || '')}</div>`
      break

    case 'thinking': {
      const text = c.text || ''
      const short = text.length > 120 ? text.substring(0, 120) + '...' : text
      div.innerHTML = `
        <div class="code-thinking-row">
          <ion-icon name="bulb-outline"></ion-icon>
          <span class="code-thinking-short">${escapeHtml(short)}</span>
          ${text.length > 120 ? `<button class="code-thinking-expand" onclick="this.parentElement.nextElementSibling.style.display='block';this.parentElement.style.display='none'">meer</button>` : ''}
        </div>
        ${text.length > 120 ? `<div class="code-thinking-full" style="display:none">${escapeHtml(text)}</div>` : ''}
      `
      break
    }

    case 'tool_start': {
      const icon = TOOL_ICONS[c.tool] || 'code-outline'
      const filePath = c.input?.file_path || c.input?.pattern || ''
      const shortPath = filePath ? filePath.split('/').slice(-2).join('/') : ''
      const cmd = c.input?.command || ''
      const query = c.input?.query || c.input?.prompt || ''
      div.innerHTML = `
        <div class="code-event-icon"><ion-icon name="${icon}"></ion-icon></div>
        <div class="code-event-body">
          <span class="code-tool-name">${escapeHtml(c.tool || 'Tool')}</span>
          ${shortPath ? `<span class="code-filepath">${escapeHtml(shortPath.substring(0, 80))}</span>` : ''}
          ${cmd ? `<span class="code-cmd">${escapeHtml(cmd.substring(0, 120))}</span>` : ''}
          ${query && !shortPath && !cmd ? `<span class="code-cmd">${escapeHtml(query.substring(0, 120))}</span>` : ''}
        </div>
      `
      break
    }

    case 'tool_result': {
      const output = c.output || ''
      if (!output.trim()) break // skip empty results
      const lines = output.split('\n')
      const short = lines.length > 4
      const displayText = short ? lines.slice(0, 4).join('\n') : output
      div.innerHTML = `
        <div class="code-event-body">
          <pre class="code-result">${escapeHtml(displayText)}</pre>
          ${short ? `<button class="code-expand" onclick="this.previousElementSibling.textContent=decodeURIComponent('${encodeURIComponent(output)}');this.textContent='';this.style.display='none'">+${lines.length - 4} regels</button>` : ''}
        </div>
      `
      if (c.is_error) div.classList.add('code-event-error')
      break
    }

    case 'error':
      div.innerHTML = `
        <div class="code-event-icon"><ion-icon name="alert-circle-outline"></ion-icon></div>
        <div class="code-event-body">${escapeHtml(c.message || '')}</div>
      `
      break

    case 'system':
      div.innerHTML = `<div class="code-event-body">${escapeHtml(c.message || '')}</div>`
      break

    case 'user':
      div.innerHTML = `
        <div class="code-event-icon"><ion-icon name="person-outline"></ion-icon></div>
        <div class="code-event-body">${escapeHtml(c.message || '')}</div>
      `
      break

    default:
      div.innerHTML = `<div class="code-event-body">${escapeHtml(JSON.stringify(c))}</div>`
  }

  terminal.appendChild(div)
}

function formatText(text) {
  // Simple markdown-like formatting for Claude's text output
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^(#{1,3})\s+(.+)$/gm, (_, h, t) => `<strong>${t}</strong>`)
}

// --- HELPERS ---

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
    plan_ready: { label: 'Plan klaar' },
    pr_created: { label: 'PR aangemaakt' },
    failed: { label: 'Mislukt' },
    cancelled: { label: 'Geannuleerd' }
  }
  return map[status] || { label: status }
}

function getTimeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'zojuist'
  if (diff < 3600) return `${Math.floor(diff / 60)} min geleden`
  if (diff < 86400) return `${Math.floor(diff / 3600)}u geleden`
  return `${Math.floor(diff / 86400)}d geleden`
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
