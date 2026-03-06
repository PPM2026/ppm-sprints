/**
 * Idee Detail view — Refinement workspace with inline editing, journey stepper,
 * sidebar dropdowns, and sprint promotion.
 * Follows the same pattern as bug-detail.js.
 */
import { fetchIdeaWithSprints, fetchTasksForIdea, updateIdea, deleteIdea, uploadIdeaAttachment, deleteIdeaAttachment } from '../services/idea-service.js'
import { generateSprintPlan } from '../services/sprints-service.js'
import { fetchPlatforms } from '../services/data.js'
import { renderChatPanel } from '../components/chat-panel.js'
import { formatDate, platformLabel, priorityPill } from '../utils/format.js'
import { subscribeToIdea } from '../lib/realtime.js'

let currentTab = 'overzicht'
let idea = null
let sprintsData = []
let tasksData = []
let platformsList = []
let chatCleanup = null
let unsubIdea = null

const STATUSES = [
  { key: 'captured', label: 'Vastgelegd' },
  { key: 'parsed', label: 'Verwerkt' },
  { key: 'in_review', label: 'In review' },
  { key: 'ready', label: 'Klaar voor sprint' },
  { key: 'sprint_created', label: 'Sprint aangemaakt' },
  { key: 'task_created', label: 'Taak aangemaakt' },
  { key: 'dismissed', label: 'Verworpen' }
]

export async function render(el, ideaId) {
  if (!ideaId) {
    el.innerHTML = '<div class="empty-state">Geen idee ID opgegeven</div>'
    return
  }

  currentTab = 'overzicht'
  if (chatCleanup) { chatCleanup(); chatCleanup = null }
  if (unsubIdea) { unsubIdea(); unsubIdea = null }
  el.innerHTML = '<div class="empty-state">Laden...</div>'

  const [ideaData, tasks, platforms] = await Promise.all([
    fetchIdeaWithSprints(ideaId),
    fetchTasksForIdea(ideaId),
    fetchPlatforms()
  ])
  platformsList = platforms

  if (!ideaData) {
    el.innerHTML = '<div class="empty-state">Idee niet gevonden</div>'
    return
  }

  idea = ideaData
  sprintsData = ideaData.sprints || []
  tasksData = tasks || []

  renderPage(el, ideaId)

  // Real-time sync: listen for changes from other devices
  unsubIdea = subscribeToIdea(ideaId, {
    onIdeaUpdate: (updated) => {
      // Update description if changed and field is not focused
      if (updated.parsed_description && updated.parsed_description !== idea.parsed_description) {
        idea.parsed_description = updated.parsed_description
        const descEl = el.querySelector('#id-edit-desc')
        const previewEl = el.querySelector('#id-desc-preview')
        if (descEl && document.activeElement !== descEl) {
          descEl.value = updated.parsed_description
          if (previewEl && previewEl.style.display !== 'none') {
            previewEl.innerHTML = formatDescription(updated.parsed_description)
            previewEl.classList.add('field-updated-flash')
            setTimeout(() => previewEl.classList.remove('field-updated-flash'), 1500)
          }
        }
      }
      // Update title if changed and field is not focused
      if (updated.parsed_title && updated.parsed_title !== idea.parsed_title) {
        idea.parsed_title = updated.parsed_title
        const titleEl = el.querySelector('#id-edit-title')
        if (titleEl && document.activeElement !== titleEl) {
          titleEl.value = updated.parsed_title
          titleEl.classList.add('field-updated-flash')
          setTimeout(() => titleEl.classList.remove('field-updated-flash'), 1500)
        }
        // Update header title
        const headerTitle = el.querySelector('.bd-title')
        if (headerTitle) {
          headerTitle.innerHTML = `<ion-icon name="bulb-outline" style="font-size:16px;vertical-align:-2px;color:var(--accent);"></ion-icon> ${escapeHtml(updated.parsed_title)}`
        }
      }
      // Update status
      if (updated.status && updated.status !== idea.status) {
        idea.status = updated.status
        renderPage(el, ideaId)
      }
    },
    onSprintChange: async () => {
      const refreshed = await fetchIdeaWithSprints(ideaId)
      if (refreshed) {
        sprintsData = refreshed.sprints || []
        if (currentTab === 'sprints') {
          const content = el.querySelector('#id-tab-content')
          if (content) {
            content.innerHTML = renderTabContent('sprints')
            attachTabEvents(el, ideaId)
          }
        }
      }
    }
  })
}

function renderPage(el, ideaId) {
  const title = idea.parsed_title || truncate(idea.raw_input, 60) || 'Geen titel'
  const displayId = idea.display_id ? `IDEA-${String(idea.display_id).padStart(3, '0')}` : `#${idea.id.substring(0, 8)}`

  el.innerHTML = `
    <div class="bug-detail">
      <!-- Header -->
      <div class="bd-header">
        <div class="bd-header-left">
          <button class="btn-secondary bd-back" id="id-back">
            <ion-icon name="arrow-back-outline"></ion-icon> Idee\u00ebn
          </button>
          <div class="bd-title-row">
            <span class="bd-title">
              <ion-icon name="bulb-outline" style="font-size:16px;vertical-align:-2px;color:var(--accent);"></ion-icon>
              ${escapeHtml(title)}
            </span>
            <span class="bd-display-id">${displayId}</span>
          </div>
        </div>
        <div class="bd-header-right">
          <div class="bd-status-select">
            <select id="id-status">
              ${STATUSES.map(s => `<option value="${s.key}" ${idea.status === s.key ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </div>
          <button class="btn-secondary bd-btn-delete" id="id-delete" title="Verwijderen">
            <ion-icon name="trash-outline"></ion-icon>
          </button>
        </div>
      </div>

      <!-- Journey stepper -->
      ${renderJourney(idea.status)}

      <!-- 2-column layout -->
      <div class="bd-grid">
        <div class="bd-main">
          <div class="bd-tabs" id="id-tabs">
            <div class="bd-tab active" data-tab="overzicht">Overzicht</div>
            <div class="bd-tab" data-tab="chat"><ion-icon name="sparkles-outline" style="font-size:12px;vertical-align:-1px;"></ion-icon> AI Chat</div>
            <div class="bd-tab" data-tab="sprints">Sprints <span class="id-tab-count">${sprintsData.length}</span></div>
            <div class="bd-tab" data-tab="taken">Taken <span class="id-tab-count">${tasksData.length}</span></div>
          </div>
          <div class="bd-tab-content" id="id-tab-content">
            ${renderTabContent('overzicht')}
          </div>
        </div>

        <div class="bd-sidebar">
          ${renderSidebarDetails()}
          ${renderSidebarProgress()}
          ${renderSidebarActions(ideaId)}
        </div>
      </div>
    </div>
  `

  attachEvents(el, ideaId)
}

// === JOURNEY STEPPER ===

function renderJourney(status) {
  const steps = [
    { key: 'captured', label: 'Vastgelegd', icon: 'mic-outline' },
    { key: 'parsed', label: 'Verwerkt', icon: 'flash-outline' },
    { key: 'in_review', label: 'In review', icon: 'eye-outline' },
    { key: 'ready', label: 'Klaar', icon: 'checkmark-outline' },
    { key: 'sprint_created', label: 'Sprint', icon: 'flag-outline' }
  ]
  if (status === 'dismissed') return ''

  // Map task_created to sprint_created for journey display
  const displayStatus = status === 'task_created' ? 'sprint_created' : status
  const currentIdx = steps.findIndex(s => s.key === displayStatus)

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
    case 'chat': return '<div id="id-chat-container" class="id-chat-container"></div>'
    case 'sprints': return renderSprints()
    case 'taken': return renderTaken()
    default: return ''
  }
}

function renderOverzicht() {
  const title = idea.parsed_title || ''
  const desc = idea.parsed_description || idea.raw_input || ''
  const notes = idea.notes || ''

  return `
    <div class="bd-section">
      <div class="bd-section-title">Titel</div>
      <input type="text" class="id-inline-edit id-edit-title" id="id-edit-title"
        value="${escapeAttr(title)}" placeholder="Idee titel..." />
    </div>
    <div class="bd-section id-desc-section">
      <div class="bd-section-title">Beschrijving</div>
      <div class="id-desc-preview" id="id-desc-preview">${desc ? formatDescription(desc) : '<span class="id-desc-placeholder">Klik om beschrijving te bewerken...</span>'}</div>
      <textarea class="id-inline-edit id-edit-desc" id="id-edit-desc"
        rows="8" placeholder="Beschrijving..." style="display:none;">${escapeHtml(desc)}</textarea>
    </div>
    <div class="bd-section">
      <div class="bd-section-title">Notities & context</div>
      <textarea class="id-inline-edit id-edit-notes" id="id-edit-notes"
        rows="3" placeholder="Voeg notities, context of links toe...">${escapeHtml(notes)}</textarea>
    </div>
    <div class="bd-section">
      <div class="bd-section-title" style="display:flex;align-items:center;justify-content:space-between;">
        Bijlagen
        <label class="btn-secondary id-upload-btn" style="font-size:11px;padding:4px 10px;cursor:pointer;">
          <ion-icon name="camera-outline" style="font-size:13px;vertical-align:-2px;"></ion-icon> Foto toevoegen
          <input type="file" id="id-file-input" accept="image/*,application/pdf" multiple style="display:none;" />
        </label>
      </div>
      ${renderAttachments(idea.attachments)}
    </div>
    ${idea.raw_input && idea.parsed_description && idea.raw_input !== idea.parsed_description ? `
    <div class="bd-section">
      <div class="bd-section-title">Originele invoer</div>
      <div class="bd-text" style="font-style:italic;color:rgba(0,0,0,0.4);">${escapeHtml(idea.raw_input)}</div>
    </div>` : ''}
  `
}

function renderSprints() {
  if (sprintsData.length === 0) {
    return `
      <div class="bd-analyse-empty">
        <ion-icon name="flag-outline" style="font-size:28px;display:block;margin-bottom:8px;color:rgba(0,0,0,0.15);"></ion-icon>
        <div class="bd-analyse-empty-text">Nog geen sprints gekoppeld aan dit idee</div>
        <button class="btn-primary" id="id-create-sprint-tab">
          <ion-icon name="add-outline"></ion-icon> Sprint aanmaken
        </button>
      </div>
    `
  }

  return `
    <div class="id-sprints-list">
      ${sprintsData.map(s => {
        const statusMap = {
          planning: { cls: 'gray', label: 'Planning' },
          active: { cls: 'blue', label: 'Actief' },
          completed: { cls: 'green', label: 'Afgerond' },
          cancelled: { cls: 'red', label: 'Geannuleerd' }
        }
        const st = statusMap[s.status] || { cls: 'gray', label: s.status }
        const startDate = s.start_date ? formatDate(s.start_date) : '-'
        const endDate = s.end_date ? formatDate(s.end_date) : '-'

        return `
          <div class="id-sprint-card" data-sprint-id="${s.id}">
            <div class="id-sprint-header">
              <div class="id-sprint-name">${escapeHtml(s.name)}</div>
              <span class="pill-sm ${st.cls}">${st.label}</span>
            </div>
            ${s.goal ? `<div class="id-sprint-goal">${escapeHtml(truncate(s.goal, 100))}</div>` : ''}
            <div class="id-sprint-dates">
              <ion-icon name="calendar-outline"></ion-icon> ${startDate} — ${endDate}
            </div>
          </div>
        `
      }).join('')}
      <button class="btn-secondary id-add-sprint-btn" id="id-create-sprint-tab" style="width:100%;justify-content:center;margin-top:8px;">
        <ion-icon name="add-outline"></ion-icon> Sprint toevoegen
      </button>
    </div>
  `
}

function renderTaken() {
  if (tasksData.length === 0) {
    return `
      <div class="bd-analyse-empty">
        <ion-icon name="checkbox-outline" style="font-size:28px;display:block;margin-bottom:8px;color:rgba(0,0,0,0.15);"></ion-icon>
        <div class="bd-analyse-empty-text">Nog geen taken aangemaakt vanuit dit idee</div>
      </div>
    `
  }

  const grouped = {}
  const noSprint = []
  tasksData.forEach(t => {
    if (t.sprint_id) {
      if (!grouped[t.sprint_id]) grouped[t.sprint_id] = []
      grouped[t.sprint_id].push(t)
    } else {
      noSprint.push(t)
    }
  })

  let html = ''
  for (const [sprintId, tasks] of Object.entries(grouped)) {
    const sprint = sprintsData.find(s => s.id === sprintId)
    const sprintName = sprint ? sprint.name : 'Sprint'
    html += `
      <div class="id-task-group">
        <div class="id-task-group-title">
          <ion-icon name="flag-outline"></ion-icon> ${escapeHtml(sprintName)}
        </div>
        ${tasks.map(t => renderTaskRow(t)).join('')}
      </div>
    `
  }

  if (noSprint.length > 0) {
    html += `
      <div class="id-task-group">
        <div class="id-task-group-title" style="color:rgba(0,0,0,0.3);">
          <ion-icon name="remove-circle-outline"></ion-icon> Zonder sprint
        </div>
        ${noSprint.map(t => renderTaskRow(t)).join('')}
      </div>
    `
  }

  return `<div class="id-tasks-list">${html}</div>`
}

function renderTaskRow(task) {
  const statusMap = {
    backlog: { cls: 'gray', label: 'Backlog' },
    todo: { cls: 'orange', label: 'To do' },
    in_progress: { cls: 'blue', label: 'In uitvoering' },
    review: { cls: 'purple', label: 'Review' },
    done: { cls: 'green', label: 'Afgerond' }
  }
  const st = statusMap[task.status] || { cls: 'gray', label: task.status }
  return `
    <div class="id-task-row">
      <div class="id-task-title">${escapeHtml(task.title || task.description || '-')}</div>
      <span class="pill-sm ${st.cls}">${st.label}</span>
    </div>
  `
}

// === SIDEBAR ===

function renderSidebarDetails() {
  const platforms = [
    { key: '', label: 'Niet ingesteld' },
    ...platformsList
  ]
  const types = [
    { key: '', label: '-' },
    { key: 'bug', label: 'Bug' },
    { key: 'feature', label: 'Feature' },
    { key: 'improvement', label: 'Verbetering' }
  ]
  const priorities = [
    { key: '', label: '-' },
    { key: 'low', label: 'Laag' },
    { key: 'medium', label: 'Medium' },
    { key: 'high', label: 'Hoog' },
    { key: 'critical', label: 'Kritiek' }
  ]

  return `
    <div class="bd-sidebar-card">
      <div class="bd-sidebar-card-title">Details</div>
      <div class="bd-sidebar-row">
        <span class="bd-sidebar-label">Platform</span>
        <select class="id-sidebar-select" id="id-edit-platform">
          ${platforms.map(p => `<option value="${p.key}" ${idea.suggested_platform === p.key ? 'selected' : ''}>${p.label}</option>`).join('')}
        </select>
      </div>
      <div class="bd-sidebar-row">
        <span class="bd-sidebar-label">Type</span>
        <select class="id-sidebar-select" id="id-edit-type">
          ${types.map(t => `<option value="${t.key}" ${idea.suggested_type === t.key ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>
      </div>
      <div class="bd-sidebar-row">
        <span class="bd-sidebar-label">Prioriteit</span>
        <select class="id-sidebar-select" id="id-edit-priority">
          ${priorities.map(p => `<option value="${p.key}" ${idea.suggested_priority === p.key ? 'selected' : ''}>${p.label}</option>`).join('')}
        </select>
      </div>
      <div class="bd-sidebar-row">
        <span class="bd-sidebar-label">Bron</span>
        <span class="bd-sidebar-value">${idea.audio_url ? 'Spraak' : 'Tekst'}</span>
      </div>
      <div class="bd-sidebar-row">
        <span class="bd-sidebar-label">Bijlagen</span>
        <span class="bd-sidebar-value">${(idea.attachments || []).length || '-'}</span>
      </div>
      <div class="bd-sidebar-row">
        <span class="bd-sidebar-label">AI</span>
        <span class="bd-sidebar-value">${idea.ai_analysis ? '<span class="pill-sm green" style="font-size:9px;">Geanalyseerd</span>' : '<span style="color:rgba(0,0,0,0.3);">-</span>'}</span>
      </div>
      <div class="bd-sidebar-row">
        <span class="bd-sidebar-label">Datum</span>
        <span class="bd-sidebar-value">${formatDate(idea.created_at)}</span>
      </div>
    </div>
  `
}

function renderSidebarProgress() {
  const totalTasks = tasksData.length
  const doneTasks = tasksData.filter(t => t.status === 'done').length
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
  const activeSprints = sprintsData.filter(s => s.status === 'active' || s.status === 'planning').length

  return `
    <div class="bd-sidebar-card">
      <div class="bd-sidebar-card-title">Voortgang</div>
      ${totalTasks > 0 ? `
        <div style="margin-bottom:8px;">
          <div style="height:6px;border-radius:3px;background:rgba(0,0,0,0.06);overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:#1B7D3A;border-radius:3px;transition:width 0.3s;"></div>
          </div>
          <div style="font-size:11px;color:rgba(0,0,0,0.4);margin-top:4px;">${doneTasks}/${totalTasks} taken afgerond (${pct}%)</div>
        </div>
      ` : '<div style="font-size:11px;color:rgba(0,0,0,0.35);">Nog geen taken</div>'}
      <div class="bd-sidebar-row">
        <span class="bd-sidebar-label">Sprints</span>
        <span class="bd-sidebar-value">${sprintsData.length}</span>
      </div>
      <div class="bd-sidebar-row">
        <span class="bd-sidebar-label">Actief</span>
        <span class="bd-sidebar-value">${activeSprints}</span>
      </div>
    </div>
  `
}

function renderSidebarActions(ideaId) {
  const canPromote = idea.status !== 'sprint_created' && idea.status !== 'task_created' && idea.status !== 'dismissed'
  const hasSprintAlready = sprintsData.length > 0

  return `
    <div class="bd-sidebar-card">
      <div class="bd-sidebar-card-title">Acties</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${canPromote ? `
        <button class="btn-primary bd-btn-full" id="id-promote-sprint">
          <ion-icon name="rocket-outline"></ion-icon> Promoveer naar Sprint
        </button>` : ''}
        ${hasSprintAlready ? `
        <button class="btn-secondary bd-btn-full" id="id-regenerate-sprint">
          <ion-icon name="refresh-outline"></ion-icon> Sprint opnieuw genereren
        </button>` : ''}
        <button class="btn-secondary bd-btn-full" id="id-create-task">
          <ion-icon name="checkbox-outline"></ion-icon> Taak aanmaken
        </button>
      </div>
    </div>
  `
}

// === EVENTS ===

function attachEvents(el, ideaId) {
  // Back
  el.querySelector('#id-back')?.addEventListener('click', () => {
    window.__ppmSwitchView?.('ideeen')
  })

  // Delete
  el.querySelector('#id-delete')?.addEventListener('click', async () => {
    if (!confirm('Weet je zeker dat je dit idee wilt verwijderen?')) return
    try {
      await deleteIdea(ideaId)
      window.__ppmSwitchView?.('ideeen')
    } catch (err) {
      alert('Verwijderen mislukt')
    }
  })

  // Status change
  el.querySelector('#id-status')?.addEventListener('change', async (e) => {
    const newStatus = e.target.value
    try {
      await updateIdea(ideaId, { status: newStatus })
      idea.status = newStatus
      renderPage(el, ideaId)
    } catch (err) {
      console.warn('PPM: status update failed', err)
      e.target.value = idea.status
    }
  })

  // Tab switching
  el.querySelector('#id-tabs')?.addEventListener('click', async (e) => {
    const tab = e.target.closest('.bd-tab')
    if (!tab || !tab.dataset.tab) return

    // Cleanup chat on tab switch
    if (chatCleanup) { chatCleanup(); chatCleanup = null }

    currentTab = tab.dataset.tab
    el.querySelectorAll('#id-tabs .bd-tab').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')
    const content = el.querySelector('#id-tab-content')
    if (content) {
      content.innerHTML = renderTabContent(currentTab)
      attachTabEvents(el, ideaId)

      // Init chat panel when chat tab is selected
      if (currentTab === 'chat') {
        const chatContainer = content.querySelector('#id-chat-container')
        if (chatContainer) {
          chatCleanup = await renderChatPanel(chatContainer, { ideaId })
        }
      }
    }
  })

  // Sidebar dropdowns
  ;['platform', 'type', 'priority'].forEach(field => {
    el.querySelector(`#id-edit-${field}`)?.addEventListener('change', async (e) => {
      const val = e.target.value || null
      const updateKey = `suggested_${field}`
      try {
        await updateIdea(ideaId, { [updateKey]: val })
        idea[updateKey] = val
      } catch (err) {
        console.warn(`PPM: ${field} update failed`, err)
      }
    })
  })

  // Sidebar actions
  attachActionEvents(el, ideaId)
  attachTabEvents(el, ideaId)
}

function attachTabEvents(el, ideaId) {
  // Inline edit: title
  el.querySelector('#id-edit-title')?.addEventListener('blur', async (e) => {
    const val = e.target.value.trim()
    if (val !== (idea.parsed_title || '')) {
      try {
        await updateIdea(ideaId, { parsed_title: val })
        idea.parsed_title = val
      } catch (err) { console.warn('PPM: title update failed', err) }
    }
  })

  // Description: preview/edit toggle
  const descPreview = el.querySelector('#id-desc-preview')
  const descTextarea = el.querySelector('#id-edit-desc')
  descPreview?.addEventListener('click', () => {
    descPreview.style.display = 'none'
    descTextarea.style.display = ''
    descTextarea.style.height = 'auto'
    descTextarea.style.height = Math.max(120, descTextarea.scrollHeight) + 'px'
    descTextarea.focus()
  })
  descTextarea?.addEventListener('blur', async (e) => {
    const val = e.target.value.trim()
    descTextarea.style.display = 'none'
    descPreview.style.display = ''
    descPreview.innerHTML = val ? formatDescription(val) : '<span class="id-desc-placeholder">Klik om beschrijving te bewerken...</span>'
    if (val !== (idea.parsed_description || '')) {
      try {
        await updateIdea(ideaId, { parsed_description: val })
        idea.parsed_description = val
      } catch (err) { console.warn('PPM: desc update failed', err) }
    }
  })
  descTextarea?.addEventListener('input', (e) => {
    e.target.style.height = 'auto'
    e.target.style.height = Math.max(120, e.target.scrollHeight) + 'px'
  })

  // Inline edit: notes
  el.querySelector('#id-edit-notes')?.addEventListener('blur', async (e) => {
    const val = e.target.value.trim()
    if (val !== (idea.notes || '')) {
      try {
        await updateIdea(ideaId, { notes: val })
        idea.notes = val
      } catch (err) { console.warn('PPM: notes update failed', err) }
    }
  })

  // File upload
  el.querySelector('#id-file-input')?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    for (const file of files) {
      try {
        const result = await uploadIdeaAttachment(ideaId, file)
        idea.attachments = result.attachments
      } catch (err) {
        console.warn('PPM: upload failed', err)
        alert(`Upload mislukt: ${file.name}`)
      }
    }
    // Re-render overzicht tab to show new attachments
    const content = el.querySelector('#id-tab-content')
    if (content && currentTab === 'overzicht') {
      content.innerHTML = renderTabContent('overzicht')
      attachTabEvents(el, ideaId)
    }
  })

  // Attachment delete
  el.querySelectorAll('.id-attachment-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const card = btn.closest('.id-attachment')
      const path = card?.dataset.path
      if (!path || !confirm('Bijlage verwijderen?')) return

      try {
        idea.attachments = await deleteIdeaAttachment(ideaId, path)
        const content = el.querySelector('#id-tab-content')
        if (content && currentTab === 'overzicht') {
          content.innerHTML = renderTabContent('overzicht')
          attachTabEvents(el, ideaId)
        }
      } catch (err) {
        console.warn('PPM: delete attachment failed', err)
      }
    })
  })

  // Attachment click → open in new tab
  el.querySelectorAll('.id-attachment img').forEach(img => {
    img.style.cursor = 'pointer'
    img.addEventListener('click', () => window.open(img.src, '_blank'))
  })

  // Sprint create button in tab
  el.querySelector('#id-create-sprint-tab')?.addEventListener('click', () => runSprintGeneration(el, ideaId, '#id-create-sprint-tab'))

  // Sprint cards click
  el.querySelectorAll('.id-sprint-card').forEach(card => {
    card.style.cursor = 'pointer'
    card.addEventListener('click', () => window.__ppmSwitchView?.('sprints'))
  })
}

function attachActionEvents(el, ideaId) {
  // Promote to sprint (AI-powered)
  el.querySelector('#id-promote-sprint')?.addEventListener('click', () => runSprintGeneration(el, ideaId, '#id-promote-sprint'))

  // Regenerate sprint (AI-powered)
  el.querySelector('#id-regenerate-sprint')?.addEventListener('click', () => {
    if (!confirm('Wil je het sprint plan opnieuw laten genereren door AI? Dit maakt een nieuwe sprint aan.')) return
    runSprintGeneration(el, ideaId, '#id-regenerate-sprint')
  })

  // Create task
  el.querySelector('#id-create-task')?.addEventListener('click', async () => {
    const title = idea.parsed_title || 'Taak vanuit idee'
    try {
      const { createTask } = await import('../services/tasks-service.js')
      await createTask({
        title,
        description: idea.parsed_description || idea.raw_input || '',
        platform: idea.suggested_platform || 'meta',
        status: 'backlog',
        priority: idea.suggested_priority || 'medium',
        idea_id: ideaId,
        sprint_id: sprintsData.find(s => s.status === 'active')?.id || null
      })
      await updateIdea(ideaId, { status: 'task_created' })
      idea.status = 'task_created'
      tasksData = await fetchTasksForIdea(ideaId)
      renderPage(el, ideaId)
    } catch (err) {
      console.warn('PPM: Could not create task', err)
      alert('Taak aanmaken mislukt')
    }
  })
}

async function runSprintGeneration(el, ideaId, btnSelector) {
  const btn = el.querySelector(btnSelector)
  if (!btn) return
  const originalHtml = btn.innerHTML

  // Show AI thinking animation
  btn.disabled = true
  btn.classList.add('ai-generating')
  btn.innerHTML = `
    <div class="ai-thinking-indicator">
      <div class="ai-thinking-dots"><span></span><span></span><span></span></div>
      <span>AI genereert sprint plan...</span>
    </div>
  `

  try {
    const result = await generateSprintPlan(ideaId)
    idea.status = 'sprint_created'
    const { fetchIdeaWithSprints: refresh } = await import('../services/idea-service.js')
    const updated = await refresh(ideaId)
    if (updated) {
      idea = updated
      sprintsData = updated.sprints || []
    }
    tasksData = await fetchTasksForIdea(ideaId)
    renderPage(el, ideaId)
  } catch (err) {
    console.warn('PPM: AI sprint generation failed', err)
    btn.disabled = false
    btn.classList.remove('ai-generating')
    btn.innerHTML = originalHtml
    alert('Sprint generatie mislukt: ' + (err.message || 'Onbekende fout'))
  }
}


// === ATTACHMENTS ===

function renderAttachments(attachments) {
  const items = attachments || []
  if (items.length === 0) {
    return '<div class="id-attachments-empty">Geen bijlagen — voeg foto\'s, schetsen of screenshots toe</div>'
  }

  return `
    <div class="id-attachments-grid">
      ${items.map(a => {
        const isImage = a.type?.startsWith('image/')
        return `
          <div class="id-attachment" data-path="${escapeAttr(a.path)}">
            ${isImage
              ? `<img src="${a.url}" alt="${escapeAttr(a.name)}" loading="lazy" />`
              : `<div class="id-attachment-file"><ion-icon name="document-outline"></ion-icon><span>${escapeHtml(a.name)}</span></div>`
            }
            <button class="id-attachment-delete" title="Verwijderen"><ion-icon name="close-circle"></ion-icon></button>
          </div>
        `
      }).join('')}
    </div>
  `
}

// === HELPERS ===

function getStatusConfig(status) {
  const map = {
    captured: { cls: 'orange', label: 'Vastgelegd' },
    parsed: { cls: 'blue', label: 'Verwerkt' },
    in_review: { cls: 'purple', label: 'In review' },
    ready: { cls: 'accent', label: 'Klaar voor sprint' },
    sprint_created: { cls: 'green', label: 'Sprint aangemaakt' },
    task_created: { cls: 'green', label: 'Taak aangemaakt' },
    dismissed: { cls: 'gray', label: 'Verworpen' }
  }
  return map[status] || { cls: 'gray', label: status || '-' }
}

function truncate(str, len) {
  if (!str) return ''
  return str.length > len ? str.substring(0, len) + '...' : str
}

function formatDescription(text) {
  if (!text) return ''
  let html = escapeHtml(text)
  html = html.replace(/^# (.+)$/gm, '<h3 style="font-size:15px;font-weight:700;margin:0 0 8px;">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h4 style="font-size:13px;font-weight:600;margin:12px 0 6px;color:rgba(0,0,0,0.7);">$1</h4>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/^[•\-] (.+)$/gm, '<li style="margin-left:16px;margin-bottom:2px;">$1</li>')
  html = html.replace(/\n/g, '<br>')
  html = html.replace(/<br>(<h[34])/g, '$1')
  html = html.replace(/(<\/h[34]>)<br>/g, '$1')
  return html
}

function escapeHtml(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeAttr(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
