/**
 * Sprint Dashboard — Home view met actieve sprint, code sessies, stats en activiteit.
 * EIGEN per app (niet synced met admin dashboard).
 */
import { supabase } from '../lib/supabase.js'
import { fetchSprints, fetchSprintTasksWithProgress } from '../services/sprints-service.js'
import { formatDate, formatDateTime } from '../utils/format.js'

export async function render(el) {
  el.innerHTML = `
    <div class="main-header">
      <div>
        <div class="view-title">Dashboard</div>
        <div class="view-sub">Sprint & Code overzicht</div>
      </div>
    </div>

    <div class="sd-kpis" id="dash-kpis">
      <div class="sd-kpi"><div class="kpi-val" id="kpi-total">-</div><div class="kpi-lbl">Sprints</div></div>
      <div class="sd-kpi"><div class="kpi-val" id="kpi-active">-</div><div class="kpi-lbl">Actief</div></div>
      <div class="sd-kpi"><div class="kpi-val" id="kpi-tasks">-</div><div class="kpi-lbl">Taken in uitvoering</div></div>
      <div class="sd-kpi"><div class="kpi-val" id="kpi-sessions">-</div><div class="kpi-lbl">Code sessies</div></div>
    </div>

    <div class="sd-grid">
      <div class="sd-col-main">
        <div class="sd-section" id="dash-active-sprint">
          <div class="sd-section-title">Actieve Sprint</div>
          <div class="empty-state">Laden...</div>
        </div>
        <div class="sd-section" id="dash-recent">
          <div class="sd-section-title">Recente Sprints</div>
          <div class="empty-state">Laden...</div>
        </div>
      </div>
      <div class="sd-col-side">
        <div class="sd-section" id="dash-sessions">
          <div class="sd-section-title">Code Sessies</div>
          <div class="empty-state">Laden...</div>
        </div>
        <div class="sd-section" id="dash-activity">
          <div class="sd-section-title">Recente Activiteit</div>
          <div class="empty-state">Laden...</div>
        </div>
      </div>
    </div>
  `

  // Fetch all data in parallel
  const [sprints, executions, recentTasks] = await Promise.all([
    fetchSprints(),
    fetchRecentExecutions(),
    fetchRecentTasks()
  ])

  const activeSprint = sprints.find(s => s.status === 'active')
  const activeSessions = executions.filter(e => ['queued', 'running'].includes(e.status))
  const inProgressTasks = recentTasks.filter(t => t.status === 'in_progress' || t.status === 'review')

  // --- KPIs ---
  setKpi('kpi-total', sprints.length)
  setKpi('kpi-active', sprints.filter(s => s.status === 'active').length)
  setKpi('kpi-tasks', inProgressTasks.length)
  setKpi('kpi-sessions', activeSessions.length)

  // --- Active Sprint ---
  const activeEl = document.getElementById('dash-active-sprint')
  if (activeSprint) {
    const tasks = await fetchSprintTasksWithProgress(activeSprint.id)
    renderActiveSprint(activeEl, activeSprint, tasks)
  } else {
    activeEl.innerHTML = `
      <div class="sd-section-title">Actieve Sprint</div>
      <div class="empty-state">Geen actieve sprint</div>
    `
  }

  // --- Code Sessions ---
  renderSessions(document.getElementById('dash-sessions'), executions)

  // --- Recent Sprints ---
  renderRecentSprints(document.getElementById('dash-recent'), sprints)

  // --- Recent Activity ---
  renderActivity(document.getElementById('dash-activity'), recentTasks, executions)

  // Click handlers
  el.addEventListener('click', handleDashClick)
}

// === DATA FETCHING ===

async function fetchRecentExecutions() {
  try {
    const { data, error } = await supabase
      .from('sprint_executions')
      .select('*, sprints(name, display_id)')
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('PPM: Could not fetch executions', e)
    return []
  }
}

async function fetchRecentTasks() {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, title, status, sprint_id, platform, updated_at')
      .not('sprint_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(20)
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('PPM: Could not fetch recent tasks', e)
    return []
  }
}

// === RENDER FUNCTIONS ===

function setKpi(id, value) {
  const el = document.getElementById(id)
  if (el) el.textContent = value
}

function renderActiveSprint(container, sprint, tasks) {
  const totalTasks = tasks.length
  const doneTasks = tasks.filter(t => t.status === 'done').length
  const inProgress = tasks.filter(t => t.status === 'in_progress' || t.status === 'review').length
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  const execStatusMap = {
    queued: { label: 'In wachtrij', cls: 'orange' },
    running: { label: 'Wordt uitgevoerd', cls: 'blue' },
    completed: { label: 'Afgerond', cls: 'green' },
    failed: { label: 'Mislukt', cls: 'red' },
    plan_ready: { label: 'Plan klaar', cls: 'purple' }
  }
  const execInfo = execStatusMap[sprint.execution_status] || null

  container.innerHTML = `
    <div class="sd-section-title">Actieve Sprint</div>
    <div class="dash-sprint-card" data-action="open-sprint" data-id="${sprint.id}">
      <div class="dash-sprint-header">
        <div class="dash-sprint-name">
          <span class="pill-sm blue">S-${sprint.display_id}</span>
          ${sprint.name}
        </div>
        ${execInfo ? `<span class="pill-sm ${execInfo.cls}">${execInfo.label}</span>` : ''}
      </div>
      ${sprint.goal ? `<div class="dash-sprint-goal">${sprint.goal}</div>` : ''}
      <div class="dash-sprint-progress">
        <div class="dash-progress-bar">
          <div class="dash-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="dash-progress-stats">
          <span>${doneTasks}/${totalTasks} taken afgerond (${pct}%)</span>
          ${inProgress > 0 ? `<span>${inProgress} in uitvoering</span>` : ''}
        </div>
      </div>
      <div class="dash-sprint-meta">
        <span><ion-icon name="calendar-outline"></ion-icon> ${formatDate(sprint.start_date)} - ${formatDate(sprint.end_date)}</span>
        ${getDaysRemaining(sprint.end_date)}
      </div>
    </div>
  `
}

function getDaysRemaining(endDate) {
  if (!endDate) return ''
  const end = new Date(endDate)
  const now = new Date()
  const days = Math.ceil((end - now) / (1000 * 60 * 60 * 24))
  if (days < 0) return `<span class="dash-overdue">Verlopen</span>`
  if (days === 0) return `<span class="dash-today">Vandaag</span>`
  if (days === 1) return `<span class="dash-soon">Nog 1 dag</span>`
  return `<span class="dash-remaining">Nog ${days} dagen</span>`
}

function renderSessions(container, executions) {
  const active = executions.filter(e => ['queued', 'running'].includes(e.status))
  const recent = executions.filter(e => !['queued', 'running'].includes(e.status)).slice(0, 5)

  const statusMap = {
    queued: { icon: 'time-outline', cls: 'orange', label: 'Wachtrij' },
    running: { icon: 'pulse-outline', cls: 'blue', label: 'Actief' },
    completed: { icon: 'checkmark-circle-outline', cls: 'green', label: 'Afgerond' },
    failed: { icon: 'alert-circle-outline', cls: 'red', label: 'Mislukt' },
    cancelled: { icon: 'close-circle-outline', cls: 'gray', label: 'Geannuleerd' },
    plan_ready: { icon: 'document-text-outline', cls: 'purple', label: 'Plan klaar' }
  }

  if (active.length === 0 && recent.length === 0) {
    container.innerHTML = `
      <div class="sd-section-title">Code Sessies</div>
      <div class="empty-state">Geen code sessies</div>
    `
    return
  }

  container.innerHTML = `
    <div class="sd-section-title">Code Sessies</div>
    ${active.length > 0 ? `
      <div class="dash-session-group">
        ${active.map(e => {
          const s = statusMap[e.status] || statusMap.queued
          const sprintLabel = e.sprints ? `S-${e.sprints.display_id}` : ''
          return `
            <div class="dash-session-card active" data-action="open-terminal" data-id="${e.id}">
              <div class="dash-session-top">
                <ion-icon name="${s.icon}" class="${s.cls}"></ion-icon>
                <span class="dash-session-repo">${e.repo_name || 'Onbekend'}</span>
                <span class="pill-sm ${s.cls}">${s.label}</span>
              </div>
              <div class="dash-session-info">
                ${sprintLabel ? `<span class="pill-sm blue">${sprintLabel}</span>` : ''}
                ${e.mode ? `<span class="pill-sm gray">${e.mode}</span>` : ''}
                <span class="dash-session-time">${formatDateTime(e.created_at)}</span>
              </div>
            </div>
          `
        }).join('')}
      </div>
    ` : ''}
    ${recent.length > 0 ? `
      <div class="dash-session-group recent">
        <div class="dash-group-label">Recent</div>
        ${recent.map(e => {
          const s = statusMap[e.status] || statusMap.completed
          const sprintLabel = e.sprints ? `S-${e.sprints.display_id}` : ''
          return `
            <div class="dash-session-row" data-action="open-terminal" data-id="${e.id}">
              <ion-icon name="${s.icon}" class="${s.cls}"></ion-icon>
              <span class="dash-session-repo">${e.repo_name || 'Onbekend'}</span>
              ${sprintLabel ? `<span class="pill-sm blue sm">${sprintLabel}</span>` : ''}
              <span class="pill-sm ${s.cls} sm">${s.label}</span>
            </div>
          `
        }).join('')}
      </div>
    ` : ''}
    <div class="dash-view-all" data-action="view-all-sessions">
      Alle sessies bekijken <ion-icon name="arrow-forward-outline"></ion-icon>
    </div>
  `
}

function renderRecentSprints(container, sprints) {
  const nonActive = sprints.filter(s => s.status !== 'active').slice(0, 5)

  if (nonActive.length === 0) {
    container.innerHTML = `
      <div class="sd-section-title">Recente Sprints</div>
      <div class="empty-state">Geen andere sprints</div>
    `
    return
  }

  const statusMap = {
    planning: { label: 'Planning', cls: 'orange' },
    active: { label: 'Actief', cls: 'blue' },
    completed: { label: 'Afgerond', cls: 'green' },
    cancelled: { label: 'Geannuleerd', cls: 'gray' }
  }

  container.innerHTML = `
    <div class="sd-section-title">Recente Sprints</div>
    <div class="dash-sprint-list">
      ${nonActive.map(s => {
        const st = statusMap[s.status] || { label: s.status || '-', cls: 'gray' }
        return `
          <div class="dash-sprint-row" data-action="open-sprint" data-id="${s.id}">
            <div class="dash-sprint-row-main">
              <span class="pill-sm blue">S-${s.display_id}</span>
              <span class="dash-sprint-row-name">${s.name}</span>
            </div>
            <div class="dash-sprint-row-meta">
              <span class="pill-sm ${st.cls}">${st.label}</span>
              <span class="dash-sprint-row-date">${formatDate(s.start_date)}</span>
            </div>
          </div>
        `
      }).join('')}
    </div>
    <div class="dash-view-all" data-action="view-all-sprints">
      Alle sprints bekijken <ion-icon name="arrow-forward-outline"></ion-icon>
    </div>
  `
}

function renderActivity(container, tasks, executions) {
  // Merge tasks and executions into a single activity feed, sorted by date
  const items = []

  tasks.slice(0, 8).forEach(t => {
    items.push({
      type: 'task',
      icon: getTaskIcon(t.status),
      text: t.title || 'Taak',
      sub: taskStatusLabel(t.status),
      cls: taskStatusCls(t.status),
      date: t.updated_at,
      sprintId: t.sprint_id,
      platform: t.platform
    })
  })

  executions.slice(0, 5).forEach(e => {
    const label = e.sprints ? e.sprints.name : 'Sessie'
    items.push({
      type: 'execution',
      icon: 'terminal-outline',
      text: `${e.repo_name || 'Repo'} — ${label}`,
      sub: execStatusLabel(e.status),
      cls: execStatusCls(e.status),
      date: e.created_at
    })
  })

  // Sort by date descending
  items.sort((a, b) => new Date(b.date) - new Date(a.date))
  const display = items.slice(0, 8)

  if (display.length === 0) {
    container.innerHTML = `
      <div class="sd-section-title">Recente Activiteit</div>
      <div class="empty-state">Geen recente activiteit</div>
    `
    return
  }

  container.innerHTML = `
    <div class="sd-section-title">Recente Activiteit</div>
    <div class="dash-activity-feed">
      ${display.map(item => `
        <div class="dash-activity-item">
          <ion-icon name="${item.icon}" class="${item.cls}"></ion-icon>
          <div class="dash-activity-content">
            <div class="dash-activity-text">${item.text}</div>
            <div class="dash-activity-meta">
              <span class="${item.cls}">${item.sub}</span>
              <span>${timeAgo(item.date)}</span>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `
}

// === HELPERS ===

function taskStatusLabel(s) {
  const m = { backlog: 'Backlog', todo: 'To Do', in_progress: 'In uitvoering', review: 'Review', done: 'Afgerond' }
  return m[s] || s || '-'
}
function taskStatusCls(s) {
  const m = { backlog: 'gray', todo: 'orange', in_progress: 'blue', review: 'purple', done: 'green' }
  return m[s] || 'gray'
}
function getTaskIcon(s) {
  const m = { backlog: 'albums-outline', todo: 'list-outline', in_progress: 'code-working-outline', review: 'eye-outline', done: 'checkmark-circle-outline' }
  return m[s] || 'ellipse-outline'
}
function execStatusLabel(s) {
  const m = { queued: 'Wachtrij', running: 'Actief', completed: 'Afgerond', failed: 'Mislukt', cancelled: 'Geannuleerd', plan_ready: 'Plan klaar' }
  return m[s] || s || '-'
}
function execStatusCls(s) {
  const m = { queued: 'orange', running: 'blue', completed: 'green', failed: 'red', cancelled: 'gray', plan_ready: 'purple' }
  return m[s] || 'gray'
}

function timeAgo(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now - d
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Zojuist'
  if (mins < 60) return `${mins}m geleden`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}u geleden`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Gisteren'
  if (days < 7) return `${days}d geleden`
  return formatDate(dateStr)
}

// === CLICK HANDLER ===

function handleDashClick(e) {
  const action = e.target.closest('[data-action]')
  if (!action) return

  const act = action.dataset.action
  const id = action.dataset.id

  if (act === 'open-sprint' && id) {
    window.__ppmSwitchView('sprint-detail', id)
  } else if (act === 'open-terminal' && id) {
    window.__ppmSwitchView('code', id)
  } else if (act === 'view-all-sprints') {
    window.__ppmSwitchView('sprints')
  } else if (act === 'view-all-sessions') {
    window.__ppmSwitchView('code')
  }
}
