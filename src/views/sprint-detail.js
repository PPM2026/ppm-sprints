/**
 * Sprint Detail view — Full page sprint plan with tasks, todos, and AI-generated context.
 * Follows the same pattern as idee-detail.js.
 */
import { fetchSprintTasksWithProgress, updateSprint, deleteSprint, generateSprintReport, executeSprint, planSprint, approvePlan, fetchSprintExecutions, subscribeToExecutions } from '../services/sprints-service.js'
import { formatDate } from '../utils/format.js'
import { subscribeToSprint } from '../lib/realtime.js'
import { supabase } from '../lib/supabase.js'

let sprint = null
let tasksData = []
let todosMap = {} // task_id -> [todos]
let executionsData = [] // sprint_executions rows
let currentTab = 'overzicht'
let unsubSprint = null
let unsubExec = null

export async function render(el, sprintId) {
  if (!sprintId) {
    el.innerHTML = '<div class="empty-state">Geen sprint ID opgegeven</div>'
    return
  }

  currentTab = 'overzicht'
  if (unsubSprint) { unsubSprint(); unsubSprint = null }
  if (unsubExec) { unsubExec(); unsubExec = null }
  el.innerHTML = '<div class="empty-state">Laden...</div>'

  // Load sprint
  const { data: sprintData, error } = await supabase
    .from('sprints')
    .select('*')
    .eq('id', sprintId)
    .single()

  if (error || !sprintData) {
    el.innerHTML = '<div class="empty-state">Sprint niet gevonden</div>'
    return
  }

  sprint = sprintData
  tasksData = await fetchSprintTasksWithProgress(sprintId)

  // Load all todos for tasks
  await loadTodos()

  // Load executions
  executionsData = await fetchSprintExecutions(sprintId)

  renderPage(el, sprintId)

  // Realtime execution updates
  unsubExec = subscribeToExecutions(sprintId, async () => {
    executionsData = await fetchSprintExecutions(sprintId)
    // Refresh sprint too (execution_status may have changed)
    const { data: fresh } = await supabase.from('sprints').select('*').eq('id', sprintId).single()
    if (fresh) Object.assign(sprint, fresh)
    renderPage(el, sprintId)
  })

  // Realtime sync
  unsubSprint = subscribeToSprint(sprintId, {
    onSprintUpdate: (updated) => {
      Object.assign(sprint, updated)
      renderPage(el, sprintId)
    },
    onTaskChange: async () => {
      tasksData = await fetchSprintTasksWithProgress(sprintId)
      await loadTodos()
      renderPage(el, sprintId)
    },
    onTodoChange: async () => {
      await loadTodos()
      tasksData = await fetchSprintTasksWithProgress(sprintId)
      if (currentTab === 'taken') {
        const content = el.querySelector('#sd-tab-content')
        if (content) {
          content.innerHTML = renderTabContent('taken')
          attachTabEvents(el, sprintId)
        }
      }
    }
  })
}

async function loadTodos() {
  const taskIds = tasksData.map(t => t.id)
  if (taskIds.length === 0) { todosMap = {}; return }

  const { data: todos } = await supabase
    .from('task_todos')
    .select('*')
    .in('task_id', taskIds)
    .order('sort_order', { ascending: true })

  todosMap = {}
  ;(todos || []).forEach(td => {
    if (!todosMap[td.task_id]) todosMap[td.task_id] = []
    todosMap[td.task_id].push(td)
  })
}

function renderPage(el, sprintId) {
  const doneTasks = tasksData.filter(t => t.status === 'done').length
  const pct = tasksData.length > 0 ? Math.round((doneTasks / tasksData.length) * 100) : 0

  el.innerHTML = `
    <div class="bug-detail">
      <!-- Header -->
      <div class="bd-header">
        <div class="bd-header-left">
          <button class="btn-secondary bd-back" id="sd-back">
            <ion-icon name="arrow-back-outline"></ion-icon> Sprints
          </button>
          <div class="bd-title-row">
            <span class="bd-title">
              <ion-icon name="flag-outline" style="font-size:16px;vertical-align:-2px;color:var(--accent);"></ion-icon>
              ${escapeHtml(sprint.name)}
            </span>
            <span class="bd-display-id">${sprint.display_id ? `SPRINT-${String(sprint.display_id).padStart(3, '0')}` : ''}</span>
          </div>
        </div>
        <div class="bd-header-right">
          <div class="bd-status-select">
            <select id="sd-status">
              <option value="planning" ${sprint.status === 'planning' ? 'selected' : ''}>Planning</option>
              <option value="active" ${sprint.status === 'active' ? 'selected' : ''}>Actief</option>
              <option value="completed" ${sprint.status === 'completed' ? 'selected' : ''}>Afgerond</option>
              <option value="cancelled" ${sprint.status === 'cancelled' ? 'selected' : ''}>Geannuleerd</option>
            </select>
          </div>
          <button class="btn-secondary bd-btn-delete" id="sd-delete" title="Verwijderen">
            <ion-icon name="trash-outline"></ion-icon>
          </button>
        </div>
      </div>

      <!-- Journey stepper -->
      ${renderJourney(sprint.status)}

      <!-- 2-column layout -->
      <div class="bd-grid">
        <div class="bd-main">
          <div class="bd-tabs" id="sd-tabs">
            <div class="bd-tab active" data-tab="overzicht">Overzicht</div>
            <div class="bd-tab" data-tab="taken">Taken <span class="id-tab-count">${tasksData.length}</span></div>
            <div class="bd-tab" data-tab="claude-code"><ion-icon name="terminal-outline" style="font-size:12px;vertical-align:-1px;"></ion-icon> Claude Code</div>
          </div>
          <div class="bd-tab-content" id="sd-tab-content">
            ${renderTabContent('overzicht')}
          </div>
        </div>

        <div class="bd-sidebar">
          ${renderSidebarDetails(pct, doneTasks)}
          ${renderSidebarActions()}
        </div>
      </div>
    </div>
  `

  attachEvents(el, sprintId)
}

// === JOURNEY STEPPER ===

function renderJourney(status) {
  const steps = [
    { key: 'planning', label: 'Planning', icon: 'create-outline' },
    { key: 'active', label: 'Actief', icon: 'play-outline' },
    { key: 'completed', label: 'Afgerond', icon: 'checkmark-done-outline' }
  ]
  if (status === 'cancelled') return ''

  const currentIdx = steps.findIndex(s => s.key === status)

  return `
    <div class="id-journey">
      ${steps.map((step, i) => {
        const cls = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'pending'
        return `<div class="id-journey-step ${cls}">
          <ion-icon name="${step.icon}"></ion-icon>
          <span>${step.label}</span>
        </div>`
      }).join('<div class="id-journey-line"></div>')}
    </div>
  `
}

// === TAB CONTENT ===

function renderTabContent(tab) {
  switch (tab) {
    case 'overzicht': return renderOverzicht()
    case 'taken': return renderTaken()
    case 'claude-code': return renderClaudeCode()
    default: return ''
  }
}

function renderOverzicht() {
  let html = ''

  // Sprint goal
  if (sprint.goal) {
    html += `
      <div class="bd-section">
        <div class="bd-section-title">Doel</div>
        <div class="sd-content">${formatText(sprint.goal)}</div>
      </div>
    `
  }

  // Parse report_html — can be JSON (from AI sprint-plan) or HTML (from generateSprintReport)
  let reportData = null
  if (sprint.report_html && sprint.report_html.trim().startsWith('{')) {
    try { reportData = JSON.parse(sprint.report_html) } catch { /* not JSON */ }
  }

  if (reportData) {
    // Structured AI-generated data
    if (reportData.repos_involved?.length) {
      html += `
        <div class="bd-section">
          <div class="bd-section-title">Betrokken repositories</div>
          <div class="sd-content">${reportData.repos_involved.map(r => `<span class="sd-label">${escapeHtml(r)}</span>`).join(' ')}</div>
        </div>
      `
    }
    if (reportData.supabase_changes?.length) {
      html += `
        <div class="bd-section">
          <div class="bd-section-title">Supabase wijzigingen</div>
          <div class="sd-content">${reportData.supabase_changes.map(c => `<li style="margin-left:16px;margin-bottom:4px;">${escapeHtml(c)}</li>`).join('')}</div>
        </div>
      `
    }
    if (reportData.risks?.length) {
      html += `
        <div class="bd-section">
          <div class="bd-section-title">Risico's en aandachtspunten</div>
          <div class="sd-content">${reportData.risks.map(r => `<li style="margin-left:16px;margin-bottom:4px;">${escapeHtml(r)}</li>`).join('')}</div>
        </div>
      `
    }
    if (reportData.mvp_note) {
      html += `
        <div class="bd-section">
          <div class="bd-section-title">MVP scope</div>
          <div class="sd-content">${formatText(reportData.mvp_note)}</div>
        </div>
      `
    }
  } else if (sprint.report_html && sprint.report_html.trim().length > 0) {
    // Legacy HTML report (from generateSprintReport)
    html += `
      <div class="bd-section">
        <div class="bd-section-title">Sprint Rapport</div>
        <div class="sd-report-content">${sprint.report_html}</div>
      </div>
    `
  }

  if (!sprint.goal && !sprint.report_html) {
    html += `
      <div class="bd-analyse-empty">
        <ion-icon name="document-text-outline" style="font-size:28px;display:block;margin-bottom:8px;color:rgba(0,0,0,0.15);"></ion-icon>
        <div class="bd-analyse-empty-text">Geen sprint plan beschikbaar</div>
      </div>
    `
  }

  return html
}

function renderTaken() {
  if (tasksData.length === 0) {
    return `
      <div class="bd-analyse-empty">
        <ion-icon name="checkbox-outline" style="font-size:28px;display:block;margin-bottom:8px;color:rgba(0,0,0,0.15);"></ion-icon>
        <div class="bd-analyse-empty-text">Geen taken in deze sprint</div>
      </div>
    `
  }

  return `
    <div class="sd-tasks-list">
      ${tasksData.map((task, idx) => {
        const todos = todosMap[task.id] || []
        const doneTodos = todos.filter(t => t.done).length
        const statusInfo = getTaskStatusInfo(task.status)
        const prioInfo = getPriorityInfo(task.priority)

        return `
          <div class="sd-task-card" data-task-idx="${idx}">
            <div class="sd-task-header">
              <div class="sd-task-title">${escapeHtml(task.title)}</div>
              <div class="sd-task-pills">
                <span class="pill-sm ${statusInfo.cls}">${statusInfo.label}</span>
                <span class="pill-sm ${prioInfo.cls}">${prioInfo.label}</span>
              </div>
            </div>
            ${task.description ? `<div class="sd-task-desc">${formatText(task.description)}</div>` : ''}
            ${task.labels?.length ? `
              <div class="sd-task-labels">
                ${task.labels.map(l => `<span class="sd-label">${escapeHtml(l)}</span>`).join('')}
              </div>
            ` : ''}
            ${todos.length > 0 ? `
              <div class="sd-task-todos">
                <div class="sd-todos-header">
                  <span class="sd-todos-count">${doneTodos}/${todos.length} stappen</span>
                  <div class="sd-todos-progress">
                    <div class="sd-todos-progress-fill" style="width:${todos.length > 0 ? Math.round((doneTodos / todos.length) * 100) : 0}%"></div>
                  </div>
                </div>
                ${todos.map(todo => `
                  <label class="sd-todo-item ${todo.done ? 'done' : ''}" data-todo-id="${todo.id}">
                    <input type="checkbox" ${todo.done ? 'checked' : ''} data-todo-id="${todo.id}" />
                    <span>${escapeHtml(todo.title)}</span>
                  </label>
                `).join('')}
              </div>
            ` : ''}
            ${task.status !== 'done' ? `
              <div class="sd-task-actions">
                <select class="sd-task-status-select" data-task-id="${task.id}">
                  <option value="backlog" ${task.status === 'backlog' ? 'selected' : ''}>Backlog</option>
                  <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>To do</option>
                  <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>In uitvoering</option>
                  <option value="review" ${task.status === 'review' ? 'selected' : ''}>Review</option>
                  <option value="done" ${task.status === 'done' ? 'selected' : ''}>Afgerond</option>
                </select>
              </div>
            ` : ''}
          </div>
        `
      }).join('')}
    </div>
  `
}

function renderClaudeCode() {
  if (!sprint.claude_code_prompt) {
    return `
      <div class="bd-analyse-empty">
        <ion-icon name="terminal-outline" style="font-size:28px;display:block;margin-bottom:8px;color:rgba(0,0,0,0.15);"></ion-icon>
        <div class="bd-analyse-empty-text">Geen Claude Code prompt beschikbaar</div>
        <div style="font-size:11px;color:rgba(0,0,0,0.3);margin-top:4px;">Genereer het sprint plan opnieuw om een Claude Code prompt te krijgen</div>
      </div>
    `
  }

  let html = ''

  // Execution status panel (if executions exist)
  if (executionsData.length > 0) {
    html += `
      <div class="bd-section">
        <div class="bd-section-title">Sprint Executie</div>
        <div class="sd-exec-panel">
          ${executionsData.map(exec => {
            const statusInfo = getExecStatusInfo(exec.status)
            return `
              <div class="sd-exec-repo" data-exec-id="${exec.id}" style="cursor:pointer;" title="Open code environment">
                <div class="sd-exec-dot ${exec.status}"></div>
                <div class="sd-exec-info">
                  <div class="sd-exec-repo-name">${escapeHtml(exec.repo_name)}</div>
                  <div class="sd-exec-status-row">
                    <span class="sd-exec-status-label">${statusInfo.label}</span>
                    ${exec.current_task ? `<span class="sd-exec-task">— ${escapeHtml(exec.current_task)}</span>` : ''}
                  </div>
                  ${exec.status === 'running' ? `
                    <div class="sd-exec-progress">
                      <div class="sd-exec-progress-bar" style="width:${exec.progress_pct || 0}%"></div>
                    </div>
                  ` : ''}
                  ${exec.pr_url ? `<a href="${escapeHtml(exec.pr_url)}" target="_blank" class="sd-exec-pr-link"><ion-icon name="git-pull-request-outline"></ion-icon> PR bekijken</a>` : ''}
                  ${exec.error_message ? `<div class="sd-exec-error">${escapeHtml(exec.error_message)}</div>` : ''}
                </div>
              </div>
            `
          }).join('')}
        </div>
        ${executionsData.some(e => e.log_output) ? `
          <details class="sd-exec-log-details">
            <summary style="font-size:11px;color:rgba(0,0,0,0.4);cursor:pointer;margin-top:8px;">Bekijk log output</summary>
            <pre class="sd-claude-prompt" style="margin-top:8px;font-size:10px;max-height:200px;overflow-y:auto;">${escapeHtml(executionsData.map(e => e.log_output ? `--- ${e.repo_name} ---\n${e.log_output}` : '').filter(Boolean).join('\n\n'))}</pre>
          </details>
        ` : ''}
      </div>
    `
  }

  // Plan output (if available)
  html += renderPlanOutput()

  // Prompt section
  html += `
    <div class="bd-section">
      <div class="bd-section-title" style="display:flex;justify-content:space-between;align-items:center;">
        Claude Code Briefing
        <button class="btn-primary" id="sd-copy-prompt" style="font-size:11px;padding:4px 12px;">
          <ion-icon name="copy-outline"></ion-icon> Kopieer prompt
        </button>
      </div>
      <pre class="sd-claude-prompt">${escapeHtml(sprint.claude_code_prompt)}</pre>
    </div>
  `

  return html
}

function getExecStatusInfo(status) {
  const map = {
    queued: { label: 'Wachtrij' },
    running: { label: 'Bezig' },
    plan_ready: { label: 'Plan klaar' },
    pr_created: { label: 'PR aangemaakt' },
    failed: { label: 'Mislukt' },
    cancelled: { label: 'Geannuleerd' }
  }
  return map[status] || { label: status || '-' }
}

function renderPlanOutput() {
  const planExecs = executionsData.filter(e => e.mode === 'plan' && e.plan_output)
  if (planExecs.length === 0) return ''

  return `
    <div class="bd-section">
      <div class="bd-section-title" style="display:flex;justify-content:space-between;align-items:center;">
        <span><ion-icon name="document-text-outline" style="vertical-align:-2px;"></ion-icon> Analyse Plan</span>
        ${sprint.execution_status === 'plan_ready' ? `
          <button class="btn-primary" id="sd-approve-plan-inline" style="font-size:11px;padding:4px 12px;background:#1B7D3A;">
            <ion-icon name="checkmark-outline"></ion-icon> Goedkeuren & uitvoeren
          </button>
        ` : ''}
      </div>
      ${planExecs.map(exec => `
        <div class="sd-plan-block">
          <div class="sd-plan-repo-name">${escapeHtml(exec.repo_name)}</div>
          <pre class="sd-plan-content">${escapeHtml(exec.plan_output)}</pre>
        </div>
      `).join('')}
    </div>
  `
}

// === SIDEBAR ===

function renderSidebarDetails(pct, doneTasks) {
  const totalTodos = Object.values(todosMap).flat().length
  const doneTodos = Object.values(todosMap).flat().filter(t => t.done).length

  return `
    <div class="bd-sidebar-card">
      <div class="bd-sidebar-card-title">Details</div>
      <div class="bd-sidebar-row">
        <span class="bd-sidebar-label">Periode</span>
        <span class="bd-sidebar-value">${formatDate(sprint.start_date)} — ${formatDate(sprint.end_date)}</span>
      </div>
      <div class="bd-sidebar-row">
        <span class="bd-sidebar-label">Taken</span>
        <span class="bd-sidebar-value">${doneTasks}/${tasksData.length} afgerond</span>
      </div>
      ${totalTodos > 0 ? `
        <div class="bd-sidebar-row">
          <span class="bd-sidebar-label">Stappen</span>
          <span class="bd-sidebar-value">${doneTodos}/${totalTodos} afgerond</span>
        </div>
      ` : ''}
      <div style="margin-top:8px;">
        <div style="height:6px;border-radius:3px;background:rgba(0,0,0,0.06);overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:#1B7D3A;border-radius:3px;transition:width 0.3s;"></div>
        </div>
        <div style="font-size:11px;color:rgba(0,0,0,0.4);margin-top:4px;">${pct}% afgerond</div>
      </div>
    </div>
  `
}

function renderSidebarActions() {
  const isRunning = sprint.execution_status === 'queued' || sprint.execution_status === 'running'
  const hasPrompt = !!sprint.claude_code_prompt

  return `
    <div class="bd-sidebar-card">
      <div class="bd-sidebar-card-title">Acties</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${isRunning ? `
          <div class="sd-exec-running-badge">
            <span class="sd-exec-dot running" style="width:8px;height:8px;display:inline-block;"></span>
            Sprint wordt uitgevoerd...
          </div>
        ` : `
          <button class="btn-primary bd-btn-full" id="sd-start-code" ${!hasPrompt ? 'disabled title="Geen Claude Code prompt beschikbaar"' : ''}>
            <ion-icon name="terminal-outline"></ion-icon> Start in Code
          </button>
        `}
      </div>
    </div>
  `
}

// === EVENTS ===

function attachEvents(el, sprintId) {
  // Back
  el.querySelector('#sd-back')?.addEventListener('click', () => {
    window.__ppmSwitchView?.('sprints')
  })

  // Delete
  el.querySelector('#sd-delete')?.addEventListener('click', async () => {
    if (!confirm('Weet je zeker dat je deze sprint wilt verwijderen? Alle gekoppelde taken worden losgekoppeld.')) return
    try {
      await deleteSprint(sprintId)
      if (unsubSprint) { unsubSprint(); unsubSprint = null }
      window.__ppmSwitchView?.('sprints')
    } catch (err) {
      console.warn('PPM: sprint delete failed', err)
      alert('Verwijderen mislukt')
    }
  })

  // Status change
  el.querySelector('#sd-status')?.addEventListener('change', async (e) => {
    try {
      await updateSprint(sprintId, { status: e.target.value })
      sprint.status = e.target.value
      renderPage(el, sprintId)
    } catch (err) {
      console.warn('PPM: sprint status update failed', err)
      e.target.value = sprint.status
    }
  })

  // Tab switching
  el.querySelector('#sd-tabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.bd-tab')
    if (!tab || !tab.dataset.tab) return

    currentTab = tab.dataset.tab
    el.querySelectorAll('#sd-tabs .bd-tab').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')
    const content = el.querySelector('#sd-tab-content')
    if (content) {
      content.innerHTML = renderTabContent(currentTab)
      attachTabEvents(el, sprintId)
    }
  })

  // Goto idea
  el.querySelector('#sd-goto-idea')?.addEventListener('click', () => {
    if (sprint.idea_id) window.__ppmSwitchView?.('idee-detail', sprint.idea_id)
  })

  // Start in Code (always plan mode)
  el.querySelector('#sd-start-code')?.addEventListener('click', async () => {
    const btn = el.querySelector('#sd-start-code')
    btn.disabled = true
    btn.innerHTML = '<ion-icon name="hourglass-outline"></ion-icon> Starten...'
    try {
      await planSprint(sprint.id)
      sprint.execution_status = 'queued'
      executionsData = await fetchSprintExecutions(sprint.id)
      if (executionsData.length > 0) {
        window.__ppmSwitchView('code', executionsData[0].id)
      } else {
        renderPage(el, sprintId)
      }
    } catch (err) {
      console.warn('PPM: start in code failed', err)
      alert('Starten mislukt: ' + (err.message || 'Onbekende fout'))
      btn.disabled = false
      btn.innerHTML = '<ion-icon name="terminal-outline"></ion-icon> Start in Code'
    }
  })

  attachTabEvents(el, sprintId)
}

function attachTabEvents(el, sprintId) {
  // Todo checkboxes
  el.querySelectorAll('.sd-todo-item input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      const todoId = e.target.dataset.todoId
      const done = e.target.checked
      const label = e.target.closest('.sd-todo-item')
      if (label) label.classList.toggle('done', done)

      try {
        await supabase.from('task_todos').update({ done }).eq('id', todoId)
      } catch (err) {
        console.warn('PPM: todo update failed', err)
        e.target.checked = !done
      }
    })
  })

  // Copy Claude Code prompt (tab)
  el.querySelector('#sd-copy-prompt')?.addEventListener('click', () => copyPromptToClipboard(el))

  // Execution repo rows → open code environment
  el.querySelectorAll('.sd-exec-repo[data-exec-id]').forEach(row => {
    row.addEventListener('click', () => {
      window.__ppmSwitchView('code', row.dataset.execId)
    })
  })

  // Approve plan (inline button in Claude Code tab)
  el.querySelector('#sd-approve-plan-inline')?.addEventListener('click', () => handleApprovePlan(el, sprintId))

  // Task status selects
  el.querySelectorAll('.sd-task-status-select').forEach(select => {
    select.addEventListener('change', async (e) => {
      const taskId = e.target.dataset.taskId
      const newStatus = e.target.value
      try {
        const updates = { status: newStatus }
        if (newStatus === 'done') updates.completed_at = new Date().toISOString()
        await supabase.from('tasks').update(updates).eq('id', taskId)
      } catch (err) {
        console.warn('PPM: task status update failed', err)
      }
    })
  })
}

async function handleApprovePlan(el, sprintId) {
  if (!confirm('Plan goedkeuren en uitvoeren?\n\nClaude Code start nu in bypass modus met volledige schrijfrechten.')) return

  // Disable both approve buttons
  ;['#sd-approve-plan', '#sd-approve-plan-inline'].forEach(sel => {
    const btn = el.querySelector(sel)
    if (btn) { btn.disabled = true; btn.innerHTML = '<ion-icon name="hourglass-outline"></ion-icon> Starten...' }
  })

  try {
    await approvePlan(sprint.id)
    sprint.execution_status = 'queued'
    executionsData = await fetchSprintExecutions(sprint.id)
    renderPage(el, sprintId)
  } catch (err) {
    console.warn('PPM: approve plan failed', err)
    alert('Goedkeuren mislukt: ' + (err.message || 'Onbekende fout'))
    renderPage(el, sprintId)
  }
}

async function copyPromptToClipboard(el) {
  if (!sprint.claude_code_prompt) return
  try {
    await navigator.clipboard.writeText(sprint.claude_code_prompt)
    // Flash both possible copy buttons
    ;['#sd-copy-prompt', '#sd-copy-prompt-sidebar'].forEach(sel => {
      const btn = el.querySelector(sel)
      if (!btn) return
      const orig = btn.innerHTML
      btn.innerHTML = '<ion-icon name="checkmark-outline"></ion-icon> Gekopieerd!'
      setTimeout(() => { btn.innerHTML = orig }, 2000)
    })
  } catch (err) {
    console.warn('PPM: Could not copy to clipboard', err)
  }
}

// === HELPERS ===

function getTaskStatusInfo(status) {
  const map = {
    backlog: { cls: 'gray', label: 'Backlog' },
    todo: { cls: 'orange', label: 'To do' },
    in_progress: { cls: 'blue', label: 'In uitvoering' },
    review: { cls: 'purple', label: 'Review' },
    done: { cls: 'green', label: 'Afgerond' }
  }
  return map[status] || { cls: 'gray', label: status || '-' }
}

function getPriorityInfo(priority) {
  const map = {
    low: { cls: 'gray', label: 'Laag' },
    medium: { cls: 'blue', label: 'Medium' },
    high: { cls: 'orange', label: 'Hoog' },
    critical: { cls: 'red', label: 'Kritiek' }
  }
  return map[priority] || { cls: 'gray', label: priority || '-' }
}

function formatText(text) {
  if (!text) return ''
  let html = escapeHtml(text)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/^[•\-] (.+)$/gm, '<li style="margin-left:16px;margin-bottom:2px;">$1</li>')
  html = html.replace(/\n/g, '<br>')
  return html
}

function escapeHtml(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
