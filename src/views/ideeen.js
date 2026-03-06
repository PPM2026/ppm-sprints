/**
 * Ideeën overzicht view — card grid met filters en stats.
 */
import { fetchIdeasFiltered, fetchIdeaStats, deleteIdea, dismissIdea } from '../services/idea-service.js'
import { formatDate, platformLabel, priorityPill } from '../utils/format.js'

let ideas = []
let stats = { total: 0, captured: 0, parsed: 0, task_created: 0, dismissed: 0 }
let currentFilter = 'all'
let currentSort = 'newest'

export async function render(el) {
  el.innerHTML = `
    <div class="main-header">
      <div>
        <div class="view-title">Ideeën</div>
        <div class="view-sub">Alle vastgelegde ideeën en hun voortgang</div>
      </div>
    </div>

    <!-- Stats -->
    <div class="ideeen-stats" id="ideeen-stats"></div>

    <!-- Filters -->
    <div class="filter-bar">
      <select class="filter-select" id="ideeen-filter-status">
        <option value="all">Alle statussen</option>
        <option value="captured">Vastgelegd</option>
        <option value="parsed">Verwerkt</option>
        <option value="in_review">In review</option>
        <option value="ready">Klaar voor sprint</option>
        <option value="sprint_created">Sprint aangemaakt</option>
        <option value="task_created">Taak aangemaakt</option>
        <option value="dismissed">Verworpen</option>
      </select>
      <select class="filter-select" id="ideeen-sort">
        <option value="newest">Nieuwste eerst</option>
        <option value="oldest">Oudste eerst</option>
        <option value="id_asc">ID oplopend</option>
        <option value="id_desc">ID aflopend</option>
        <option value="alpha_asc">Naam A-Z</option>
        <option value="alpha_desc">Naam Z-A</option>
      </select>
    </div>

    <!-- Card grid -->
    <div class="ideeen-grid" id="ideeen-grid">
      <div class="empty-state">Laden...</div>
    </div>
  `

  // Load data
  const [ideasData, statsData] = await Promise.all([
    fetchIdeasFiltered({ status: currentFilter }),
    fetchIdeaStats()
  ])
  ideas = ideasData
  stats = statsData

  renderStats(el)
  renderGrid(el)
  attachEvents(el)
}

function renderStats(el) {
  const container = el.querySelector('#ideeen-stats')
  if (!container) return

  container.innerHTML = `
    <div class="ideeen-stat-card">
      <div class="is-number">${stats.total}</div>
      <div class="is-label">Totaal</div>
    </div>
    <div class="ideeen-stat-card is-accent">
      <div class="is-number">${stats.captured + stats.parsed}</div>
      <div class="is-label">Open</div>
    </div>
    <div class="ideeen-stat-card is-green">
      <div class="is-number">${stats.task_created}</div>
      <div class="is-label">Taak aangemaakt</div>
    </div>
    <div class="ideeen-stat-card is-gray">
      <div class="is-number">${stats.dismissed}</div>
      <div class="is-label">Verworpen</div>
    </div>
  `
}

function renderGrid(el) {
  const grid = el.querySelector('#ideeen-grid')
  if (!grid) return

  if (ideas.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <ion-icon name="bulb-outline" style="font-size:28px;display:block;margin-bottom:8px;color:rgba(0,0,0,0.15);"></ion-icon>
        Geen ideeën gevonden
      </div>
    `
    return
  }

  const sorted = sortItems(ideas, currentSort)

  grid.innerHTML = sorted.map(idea => {
    const title = idea.parsed_title || truncate(idea.raw_input, 60) || 'Geen titel'
    const desc = idea.parsed_description || idea.raw_input || ''
    const statusConfig = getStatusConfig(idea.status)
    const displayId = idea.display_id ? `IDEA-${String(idea.display_id).padStart(3, '0')}` : ''

    const tags = []
    if (idea.suggested_platform) {
      tags.push(`<span class="pill-sm blue">${platformLabel(idea.suggested_platform)}</span>`)
    }
    if (idea.suggested_type) {
      const typeCls = idea.suggested_type === 'bug' ? 'red' : idea.suggested_type === 'feature' ? 'purple' : 'orange'
      const typeLabel = idea.suggested_type === 'bug' ? 'Bug' : idea.suggested_type === 'feature' ? 'Feature' : 'Verbetering'
      tags.push(`<span class="pill-sm ${typeCls}">${typeLabel}</span>`)
    }
    if (idea.suggested_priority) {
      tags.push(priorityPill(idea.suggested_priority))
    }

    return `
      <div class="idea-card" data-idea-id="${idea.id}">
        <div class="ic-header">
          <div class="ic-title">${escapeHtml(title)}</div>
          <div class="ic-header-right">
            ${displayId ? `<span class="ic-display-id">${displayId}</span>` : ''}
            <span class="pill-sm ${statusConfig.cls}">${statusConfig.label}</span>
          </div>
        </div>
        ${tags.length > 0 ? `<div class="ic-tags">${tags.join('')}</div>` : ''}
        <div class="ic-desc">${escapeHtml(truncate(desc, 100))}</div>
        <div class="ic-footer">
          <span class="ic-date">${formatDate(idea.created_at)}</span>
          <div class="ic-actions">
            ${idea.status !== 'dismissed' && idea.status !== 'sprint_created' && idea.status !== 'task_created' ? `
            <button class="btn-icon-sm ic-dismiss-btn" data-dismiss-id="${idea.id}" title="Verwerpen">
              <ion-icon name="close-circle-outline"></ion-icon>
            </button>` : ''}
            <button class="btn-icon-sm ic-delete-btn" data-delete-id="${idea.id}" title="Verwijderen">
              <ion-icon name="trash-outline"></ion-icon>
            </button>
          </div>
        </div>
      </div>
    `
  }).join('')

  // Click on card → navigate to detail
  grid.querySelectorAll('.idea-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.ic-delete-btn')) return
      const ideaId = card.dataset.ideaId
      window.__ppmSwitchView?.('idee-detail', ideaId)
    })
  })

  // Dismiss buttons
  grid.querySelectorAll('.ic-dismiss-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const id = btn.dataset.dismissId
      try {
        await dismissIdea(id)
        const idea = ideas.find(i => i.id === id)
        if (idea) idea.status = 'dismissed'
        renderGrid(el)
      } catch (err) {
        console.warn('PPM: Could not dismiss idea', err)
      }
    })
  })

  // Delete buttons
  grid.querySelectorAll('.ic-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const id = btn.dataset.deleteId
      if (!confirm('Weet je zeker dat je dit idee wilt verwijderen?')) return
      try {
        await deleteIdea(id)
        ideas = ideas.filter(i => i.id !== id)
        stats.total--
        renderStats(el)
        renderGrid(el)
      } catch (err) {
        console.warn('PPM: Could not delete idea', err)
        alert('Verwijderen mislukt')
      }
    })
  })
}

function attachEvents(el) {
  // Filter change
  el.querySelector('#ideeen-filter-status')?.addEventListener('change', async (e) => {
    currentFilter = e.target.value
    ideas = await fetchIdeasFiltered({ status: currentFilter })
    renderGrid(el)
  })

  // Sort change
  el.querySelector('#ideeen-sort')?.addEventListener('change', (e) => {
    currentSort = e.target.value
    renderGrid(el)
  })
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

function sortItems(items, sort) {
  const arr = [...items]
  switch (sort) {
    case 'newest': return arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    case 'oldest': return arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    case 'id_asc': return arr.sort((a, b) => (a.display_id || 0) - (b.display_id || 0))
    case 'id_desc': return arr.sort((a, b) => (b.display_id || 0) - (a.display_id || 0))
    case 'alpha_asc': return arr.sort((a, b) => (a.parsed_title || a.raw_input || '').localeCompare(b.parsed_title || b.raw_input || ''))
    case 'alpha_desc': return arr.sort((a, b) => (b.parsed_title || b.raw_input || '').localeCompare(a.parsed_title || a.raw_input || ''))
    default: return arr
  }
}

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
