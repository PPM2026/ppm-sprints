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
    currentPlatform: 'ideeen',
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

  initShellEvents({ rootId: 'ideeen-db', session, currentPlatform: 'ideeen' })
  initFeedbackButton(document.body, getCurrentView)

  // Init idea capture widget (floating bulb button)
  initIdeaCapture(document.getElementById('ideeen-db'))

  // === MOBILE: Hamburger menu ===
  initMobileMenu()

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

// === MOBILE MENU ===

function initMobileMenu() {
  const topbar = document.querySelector('.ideeen-topbar')
  if (!topbar) return

  // Insert hamburger button at the start of topbar
  const hamburger = document.createElement('button')
  hamburger.className = 'mobile-hamburger'
  hamburger.id = 'btn-hamburger'
  hamburger.innerHTML = '<ion-icon name="menu-outline"></ion-icon>'
  hamburger.setAttribute('aria-label', 'Menu')
  topbar.insertBefore(hamburger, topbar.firstChild)

  // Create backdrop overlay
  const root = document.getElementById('ideeen-db')
  const backdrop = document.createElement('div')
  backdrop.className = 'mobile-backdrop'
  backdrop.id = 'mobile-backdrop'
  root.appendChild(backdrop)

  // Backdrop click closes sidebar
  backdrop.addEventListener('click', closeMobileSidebar)

  // Swipe to close
  let touchStartX = 0
  const sidebar = document.getElementById('ideeen-sidebar')
  if (sidebar) {
    sidebar.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX
    }, { passive: true })
    sidebar.addEventListener('touchend', (e) => {
      const diff = touchStartX - e.changedTouches[0].clientX
      if (diff > 60) closeMobileSidebar() // swipe left = close
    }, { passive: true })
  }
}

function toggleMobileSidebar() {
  const sidebar = document.getElementById('ideeen-sidebar')
  const backdrop = document.getElementById('mobile-backdrop')
  const hamburger = document.getElementById('btn-hamburger')
  if (!sidebar) return

  const isOpen = sidebar.classList.contains('mobile-open')
  if (isOpen) {
    closeMobileSidebar()
  } else {
    sidebar.classList.add('mobile-open')
    if (backdrop) backdrop.classList.add('active')
    if (hamburger) {
      const icon = hamburger.querySelector('ion-icon')
      if (icon) icon.setAttribute('name', 'close-outline')
    }
  }
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('ideeen-sidebar')
  const backdrop = document.getElementById('mobile-backdrop')
  const hamburger = document.getElementById('btn-hamburger')
  if (sidebar) sidebar.classList.remove('mobile-open')
  if (backdrop) backdrop.classList.remove('active')
  if (hamburger) {
    const icon = hamburger.querySelector('ion-icon')
    if (icon) icon.setAttribute('name', 'menu-outline')
  }
}

// === EVENT HANDLER ===

function handleClick(e) {
  if (handleShellClick(e, 'ideeen-db')) return

  // Hamburger menu toggle
  if (e.target.closest('#btn-hamburger')) {
    toggleMobileSidebar()
    return
  }

  // Sidebar navigation
  const side = e.target.closest('#ideeen-sidebar .side-item')
  if (side && side.dataset.view) {
    switchView(side.dataset.view)
    closeMobileSidebar() // Close on mobile after selecting
    return
  }
}
