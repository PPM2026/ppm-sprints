/**
 * PPM Ideeën — Router / Orchestrator
 * Standalone app for ideas, sprint management and Claude Code terminal.
 * Ideeën views synced with ppm-admin-dashboard via sync-shared.sh.
 */
import { initFeedbackButton } from './lib/feedback.js'
import { trackView } from './lib/analytics.js'
import { renderShell, initShellEvents, handleShellClick } from './lib/ui.js'
import { initIdeaCapture } from './components/idea-capture.js'

// === SIDEBAR CONFIG ===

const SIDEBAR_ITEMS = [
  { type: 'separator', label: 'Overzicht' },
  { key: 'dashboard', icon: 'grid-outline', label: 'Dashboard', active: true },
  { type: 'separator', label: 'Ideeën' },
  { key: 'ideeen', icon: 'bulb-outline', label: 'Alle Ideeën' },
  { type: 'separator', label: 'Sprints' },
  { key: 'sprints', icon: 'flag-outline', label: 'Alle Sprints' },
  { type: 'separator', label: 'Code' },
  { key: 'code', icon: 'terminal-outline', label: 'Sessies' }
]

// === VIEW MODULES (dynamic import for code splitting) ===

const viewModules = {
  dashboard:       () => import('./views/dashboard.js'),
  ideeen:          () => import('./views/ideeen.js'),
  'idee-detail':   () => import('./views/idee-detail.js'),
  sprints:         () => import('./views/sprints.js'),
  'sprint-detail': () => import('./views/sprint-detail.js'),
  code:            () => import('./views/code.js'),
}

// All possible view keys (for show/hide)
const ALL_VIEW_KEYS = ['dashboard', 'ideeen', 'idee-detail', 'sprints', 'sprint-detail', 'code']

let currentView = 'dashboard'
function getCurrentView() { return currentView }

// === INIT ===

export function initApp(session) {
  const app = document.getElementById('app')

  // Build mainContent with all view containers
  const viewDivs = ALL_VIEW_KEYS.map((key, i) =>
    `<div id="view-${key}" style="${i > 0 ? 'display:none;' : ''}"></div>`
  ).join('\n      ')

  app.innerHTML = renderShell({
    platformName: 'Ideeën',
    rootId: 'ideeen-db',
    rootClass: 'ideeen-dashboard',
    topbarClass: 'ideeen-topbar',
    sidebarId: 'ideeen-sidebar',
    sidebarClass: 'ideeen-sidebar',
    mainId: 'ideeen-main',
    mainClass: 'ideeen-main',
    sidebarItems: SIDEBAR_ITEMS,
    mainContent: viewDivs
  })

  initShellEvents({ rootId: 'ideeen-db', session })
  initFeedbackButton(document.body, getCurrentView)

  // Init idea capture widget (floating bulb button)
  initIdeaCapture(document.getElementById('ideeen-db'))

  // Render initial view
  loadView('dashboard')
  trackView('dashboard')

  document.getElementById('ideeen-db').addEventListener('click', handleClick)
}

// === NAVIGATION ===

async function loadView(view, param) {
  const loader = viewModules[view]
  if (!loader) return

  try {
    const mod = await loader()
    const el = document.getElementById(`view-${view}`)
    if (el && mod.render) {
      await mod.render(el, param)
    }
  } catch (err) {
    console.error(`PPM: Failed to load view "${view}"`, err)
  }
}

function switchView(view, param) {
  currentView = view

  // Hide all views
  ALL_VIEW_KEYS.forEach(key => {
    const el = document.getElementById(`view-${key}`)
    if (el) el.style.display = 'none'
  })

  // Show target view
  const targetEl = document.getElementById(`view-${view}`)
  if (targetEl) targetEl.style.display = 'block'

  // Load view content
  loadView(view, param)

  // Update sidebar active state (detail views highlight their parent)
  let sidebarKey = view
  if (view === 'sprint-detail') sidebarKey = 'sprints'
  if (view === 'idee-detail') sidebarKey = 'ideeen'

  document.querySelectorAll('#ideeen-sidebar .side-item').forEach(s => {
    s.classList.toggle('active', s.dataset.view === sidebarKey)
  })

  trackView(view)
}

// Public navigation for child views
window.__ppmSwitchView = switchView

// === EVENT HANDLER ===

function handleClick(e) {
  if (handleShellClick(e, 'ideeen-db')) return

  // Sidebar navigation
  const side = e.target.closest('#ideeen-sidebar .side-item')
  if (side && side.dataset.view) {
    switchView(side.dataset.view)
    return
  }
}
