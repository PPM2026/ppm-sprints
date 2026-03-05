/**
 * Sprints view — Sprint management with cards, detail panel, and report generation.
 */
import { fetchSprints, createSprint, updateSprint, generateSprintReport, fetchSprintTasksWithProgress } from '../services/sprints-service.js'
import { formatDate } from '../utils/format.js'

let sprintsData = []
let currentSort = 'newest'

export async function render(el) {
  el.innerHTML = `
    <div class="main-header">
      <div>
        <div class="view-title">Sprints</div>
        <div class="view-sub">Beheer sprints, voortgang en rapporten</div>
      </div>
      <button class="btn-primary" id="btn-new-sprint">
        <ion-icon name="add-outline"></ion-icon> Nieuwe sprint
      </button>
    </div>
    <div class="filter-bar">
      <select class="filter-select" id="sprints-sort">
        <option value="newest">Nieuwste eerst</option>
        <option value="oldest">Oudste eerst</option>
        <option value="id_asc">ID oplopend</option>
        <option value="id_desc">ID aflopend</option>
        <option value="alpha_asc">Naam A-Z</option>
        <option value="alpha_desc">Naam Z-A</option>
        <option value="status">Status</option>
      </select>
    </div>
    <div id="sprints-grid" class="sprints-grid">
      <div class="empty-state">Laden...</div>
    </div>
  `

  document.getElementById('btn-new-sprint').addEventListener('click', showNewSprintModal)
  el.querySelector('#sprints-sort')?.addEventListener('change', (e) => {
    currentSort = e.target.value
    renderSprintsGrid()
  })
  await renderSprintsGrid()
}

async function renderSprintsGrid() {
  sprintsData = await fetchSprints()
  const grid = document.getElementById('sprints-grid')
  if (!grid) return

  if (sprintsData.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;padding:60px 20px;">
        <ion-icon name="flag-outline" style="font-size:28px;display:block;margin-bottom:8px;"></ion-icon>
        Nog geen sprints aangemaakt
      </div>
    `
    return
  }

  // Fetch task counts for each sprint (in parallel)
  const taskCounts = await Promise.all(
    sprintsData.map(async (s) => {
      const tasks = await fetchSprintTasksWithProgress(s.id)
      const done = tasks.filter(t => t.status === 'done').length
      const todoTotal = tasks.reduce((sum, t) => sum + (t.todo_total || 0), 0)
      const todoDone = tasks.reduce((sum, t) => sum + (t.todo_done || 0), 0)
      return { total: tasks.length, done, tasks, todoTotal, todoDone }
    })
  )

  const sorted = sortSprints(sprintsData, currentSort)
  // Map task counts by sprint id for lookup after sorting
  const taskCountMap = {}
  sprintsData.forEach((s, i) => { taskCountMap[s.id] = taskCounts[i] })

  grid.innerHTML = sorted.map((sprint) => {
    const tasks = taskCountMap[sprint.id] || { total: 0, done: 0, todoTotal: 0, todoDone: 0 }
    const pct = tasks.total > 0 ? Math.round((tasks.done / tasks.total) * 100) : 0
    const statusCls = getStatusClass(sprint.status)
    const statusLabel = getStatusLabel(sprint.status)
    const displayId = sprint.display_id ? `SPRINT-${String(sprint.display_id).padStart(3, '0')}` : ''

    return `
      <div class="sprint-card" data-sprint-id="${sprint.id}">
        <div class="sc-header">
          <div class="sc-name">${sprint.name}</div>
          <div class="sc-header-right">
            ${displayId ? `<span class="sc-display-id">${displayId}</span>` : ''}
            ${sprint.execution_status && sprint.execution_status !== 'not_started' ? `<span class="sc-exec-dot ${sprint.execution_status}" title="${getExecLabel(sprint.execution_status)}"></span>` : ''}
            <span class="pill-sm ${statusCls}">${statusLabel}</span>
          </div>
        </div>
        <div class="sc-dates">
          <ion-icon name="calendar-outline"></ion-icon>
          ${formatDate(sprint.start_date)} - ${formatDate(sprint.end_date)}
        </div>
        ${sprint.idea_id ? `<div class="sc-idea-link" data-idea-id="${sprint.idea_id}"><ion-icon name="bulb-outline"></ion-icon> Vanuit idee</div>` : ''}
        ${sprint.goal ? `<div class="sc-goal">${truncateText(sprint.goal, 80)}</div>` : ''}
        <div class="sc-progress">
          <div class="sc-progress-bar">
            <div class="sc-progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="sc-progress-label">${tasks.done}/${tasks.total} taken (${pct}%)</div>
          ${tasks.todoTotal > 0 ? `<div class="sc-todo-label">${tasks.todoDone}/${tasks.todoTotal} todo's afgerond</div>` : ''}
        </div>
        <button class="btn-secondary sc-btn-detail" data-sprint-id="${sprint.id}">
          <ion-icon name="eye-outline"></ion-icon> Bekijk
        </button>
      </div>
    `
  }).join('')

  // Attach click handlers
  grid.querySelectorAll('.sc-btn-detail').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const id = btn.dataset.sprintId
      window.__ppmSwitchView?.('sprint-detail', id)
    })
  })

  // Idea link click → navigate to idee-detail
  grid.querySelectorAll('.sc-idea-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.stopPropagation()
      const ideaId = link.dataset.ideaId
      window.__ppmSwitchView?.('idee-detail', ideaId)
    })
  })
}

function getStatusClass(status) {
  const map = { planning: 'blue', active: 'green', completed: 'gray', cancelled: 'red' }
  return map[status] || 'gray'
}

function getStatusLabel(status) {
  const map = { planning: 'Planning', active: 'Actief', completed: 'Afgerond', cancelled: 'Geannuleerd' }
  return map[status] || status || '-'
}

function sortSprints(items, sort) {
  const arr = [...items]
  switch (sort) {
    case 'newest': return arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    case 'oldest': return arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    case 'id_asc': return arr.sort((a, b) => (a.display_id || 0) - (b.display_id || 0))
    case 'id_desc': return arr.sort((a, b) => (b.display_id || 0) - (a.display_id || 0))
    case 'alpha_asc': return arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    case 'alpha_desc': return arr.sort((a, b) => (b.name || '').localeCompare(a.name || ''))
    case 'status': {
      const order = { active: 0, planning: 1, completed: 2, cancelled: 3 }
      return arr.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9))
    }
    default: return arr
  }
}

function getExecLabel(status) {
  const map = { queued: 'Wachtrij', running: 'Wordt uitgevoerd', completed: 'Executie voltooid', partial: 'Gedeeltelijk', failed: 'Mislukt' }
  return map[status] || status || ''
}

function truncateText(str, len) {
  if (!str) return ''
  return str.length > len ? str.substring(0, len) + '...' : str
}

// === SPRINT DETAIL MODAL ===

async function showSprintDetail(sprintId) {
  const sprint = sprintsData.find(s => s.id === sprintId)
  if (!sprint) return

  const tasks = await fetchSprintTasksWithProgress(sprintId)
  const doneTasks = tasks.filter(t => t.status === 'done').length
  const pct = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0

  const overlay = document.createElement('div')
  overlay.className = 'detail-overlay'
  overlay.id = 'sprint-detail-overlay'
  overlay.innerHTML = `
    <div class="detail-panel" style="width:600px;">
      <div class="dp-header">
        <div class="dp-title">
          <span class="pill-sm ${getStatusClass(sprint.status)}" style="margin-right:6px;">${getStatusLabel(sprint.status)}</span>
          ${sprint.name}
        </div>
        <div class="dp-close" id="sprint-dp-close"><ion-icon name="close-outline"></ion-icon></div>
      </div>

      <div class="dp-row">
        <div class="dp-label">Periode</div>
        <div class="dp-value">${formatDate(sprint.start_date)} - ${formatDate(sprint.end_date)}</div>
      </div>

      ${sprint.goal ? `
        <div class="dp-row">
          <div class="dp-label">Doel</div>
          <div class="dp-value" style="max-width:380px;text-align:right;line-height:1.5;">${sprint.goal}</div>
        </div>
      ` : ''}

      <div class="dp-row">
        <div class="dp-label">Voortgang</div>
        <div class="dp-value">${doneTasks}/${tasks.length} taken (${pct}%)</div>
      </div>

      <!-- Status wijzigen -->
      <div class="dp-status-row">
        <label>Status wijzigen:</label>
        <select id="sprint-status-select">
          <option value="planning" ${sprint.status === 'planning' ? 'selected' : ''}>Planning</option>
          <option value="active" ${sprint.status === 'active' ? 'selected' : ''}>Actief</option>
          <option value="completed" ${sprint.status === 'completed' ? 'selected' : ''}>Afgerond</option>
          <option value="cancelled" ${sprint.status === 'cancelled' ? 'selected' : ''}>Geannuleerd</option>
        </select>
      </div>

      <!-- Tasks -->
      <div class="section-title" style="margin-top:16px;">Taken</div>
      ${tasks.length > 0 ? `
        <table class="admin-table" style="margin-bottom:16px;">
          <thead>
            <tr>
              <th>Titel</th>
              <th>Status</th>
              <th>Prioriteit</th>
            </tr>
          </thead>
          <tbody>
            ${tasks.map(t => {
              const statusMap = {
                backlog: { cls: 'gray', label: 'Backlog' },
                todo: { cls: 'orange', label: 'To do' },
                in_progress: { cls: 'blue', label: 'In uitvoering' },
                review: { cls: 'purple', label: 'Review' },
                done: { cls: 'green', label: 'Afgerond' }
              }
              const st = statusMap[t.status] || { cls: 'gray', label: t.status || '-' }
              const todoInfo = t.todo_total > 0 ? ` <span style="font-size:10px;color:rgba(0,0,0,0.35);">(${t.todo_done}/${t.todo_total})</span>` : ''
              return `
                <tr>
                  <td class="row-name">${truncateText(t.title || t.description || '-', 50)}${todoInfo}</td>
                  <td><span class="pill-sm ${st.cls}">${st.label}</span></td>
                  <td>${t.priority || '-'}</td>
                </tr>
              `
            }).join('')}
          </tbody>
        </table>
      ` : '<div class="empty-state" style="padding:20px;">Geen taken gekoppeld aan deze sprint</div>'}

      <!-- Report -->
      <div id="sprint-report-container"></div>

      <div class="form-actions" style="margin-top:16px;">
        <button class="btn-secondary" id="sprint-gen-report">
          <ion-icon name="document-text-outline"></ion-icon> Genereer rapport
        </button>
      </div>
    </div>
  `

  document.body.appendChild(overlay)

  // Close handler
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('#sprint-dp-close')) {
      overlay.remove()
    }
  })

  // Status change handler
  document.getElementById('sprint-status-select').addEventListener('change', async (e) => {
    const newStatus = e.target.value
    try {
      await updateSprint(sprint.id, { status: newStatus })
      sprint.status = newStatus
      await renderSprintsGrid()
    } catch (err) {
      console.warn('PPM: Could not update sprint status', err)
    }
  })

  // Generate report handler
  document.getElementById('sprint-gen-report').addEventListener('click', async () => {
    const btn = document.getElementById('sprint-gen-report')
    btn.disabled = true
    btn.innerHTML = '<ion-icon name="hourglass-outline"></ion-icon> Bezig...'

    try {
      const html = await generateSprintReport(sprint.id)
      const container = document.getElementById('sprint-report-container')
      if (container) {
        container.innerHTML = `
          <div class="section-title" style="margin-top:16px;">Rapport</div>
          <div class="sprint-report-content" style="padding:16px;background:rgba(0,0,0,0.02);border-radius:10px;border:1px solid rgba(0,0,0,0.06);">
            ${html}
          </div>
        `
      }
    } catch (err) {
      console.warn('PPM: Could not generate report', err)
    } finally {
      btn.disabled = false
      btn.innerHTML = '<ion-icon name="document-text-outline"></ion-icon> Genereer rapport'
    }
  })
}

// === NEW SPRINT MODAL ===

function showNewSprintModal() {
  const overlay = document.createElement('div')
  overlay.className = 'detail-overlay'
  overlay.id = 'new-sprint-overlay'

  // Default dates: today and +2 weeks
  const today = new Date()
  const twoWeeks = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
  const todayStr = today.toISOString().split('T')[0]
  const twoWeeksStr = twoWeeks.toISOString().split('T')[0]

  overlay.innerHTML = `
    <div class="detail-panel" style="width:440px;">
      <div class="dp-header">
        <div class="dp-title">Nieuwe sprint</div>
        <div class="dp-close" id="new-sprint-close"><ion-icon name="close-outline"></ion-icon></div>
      </div>
      <div class="form-group">
        <label class="form-label">Naam *</label>
        <input type="text" class="form-input" id="sprint-name" placeholder="Sprint 1 — MVP Features" />
      </div>
      <div class="form-group">
        <label class="form-label">Doel</label>
        <textarea class="form-input" id="sprint-goal" rows="3" placeholder="Wat wil je bereiken deze sprint?" style="resize:vertical;"></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group">
          <label class="form-label">Startdatum *</label>
          <input type="date" class="form-input" id="sprint-start" value="${todayStr}" />
        </div>
        <div class="form-group">
          <label class="form-label">Einddatum *</label>
          <input type="date" class="form-input" id="sprint-end" value="${twoWeeksStr}" />
        </div>
      </div>
      <div id="sprint-form-error" class="form-error" style="display:none;"></div>
      <div class="form-actions">
        <button class="btn-secondary" id="sprint-cancel">Annuleren</button>
        <button class="btn-primary" id="sprint-save">
          <ion-icon name="add-outline"></ion-icon> Aanmaken
        </button>
      </div>
    </div>
  `

  document.body.appendChild(overlay)

  // Close handlers
  const close = () => overlay.remove()
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('#new-sprint-close')) close()
  })
  document.getElementById('sprint-cancel').addEventListener('click', close)

  // Save handler
  document.getElementById('sprint-save').addEventListener('click', async () => {
    const name = document.getElementById('sprint-name').value.trim()
    const goal = document.getElementById('sprint-goal').value.trim()
    const startDate = document.getElementById('sprint-start').value
    const endDate = document.getElementById('sprint-end').value
    const errorEl = document.getElementById('sprint-form-error')

    if (!name) {
      errorEl.textContent = 'Naam is verplicht'
      errorEl.style.display = 'block'
      return
    }
    if (!startDate || !endDate) {
      errorEl.textContent = 'Start- en einddatum zijn verplicht'
      errorEl.style.display = 'block'
      return
    }
    if (new Date(endDate) <= new Date(startDate)) {
      errorEl.textContent = 'Einddatum moet na startdatum liggen'
      errorEl.style.display = 'block'
      return
    }

    const btn = document.getElementById('sprint-save')
    btn.disabled = true
    btn.innerHTML = '<ion-icon name="hourglass-outline"></ion-icon> Opslaan...'

    try {
      await createSprint({ name, goal, start_date: startDate, end_date: endDate })
      close()
      await renderSprintsGrid()
    } catch (err) {
      console.warn('PPM: Could not create sprint', err)
      errorEl.textContent = 'Fout bij aanmaken: ' + (err.message || 'Onbekende fout')
      errorEl.style.display = 'block'
      btn.disabled = false
      btn.innerHTML = '<ion-icon name="add-outline"></ion-icon> Aanmaken'
    }
  })
}
