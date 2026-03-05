import { signOut, getProfile } from './auth.js'

/**
 * Shared UI module — topbar, profile dropdown, dark mode, sidebar shell.
 * Used identically across all 4 PPM platforms.
 * Sync via: /Users/davidoudega/Documents/PPM-Platform/sync-shared.sh
 */

/**
 * Render the complete app shell: topbar + sidebar + main container.
 *
 * config: {
 *   platformName   - Display name (e.g. 'Assetmanagement')
 *   rootId         - Root element ID (e.g. 'asset-db')
 *   rootClass      - Root CSS class (e.g. 'asset-dashboard')
 *   topbarClass    - Topbar CSS class (e.g. 'asset-topbar')
 *   sidebarId      - Sidebar element ID (e.g. 'asset-sidebar')
 *   sidebarClass   - Sidebar CSS class (e.g. 'asset-sidebar')
 *   mainId         - Main content element ID (e.g. 'asset-main')
 *   mainClass      - Main content CSS class (e.g. 'asset-main')
 *   sidebarItems   - Array of { key, icon, label, active? }
 *   mainContent    - Inner HTML for main area
 *   showExport     - Show export button (default: false)
 *   topbarExtra    - Extra HTML inserted between brand and actions (e.g. breadcrumb)
 * }
 */
export function renderShell(config) {
  const {
    platformName,
    rootId,
    rootClass,
    topbarClass = 'ppm-topbar',
    sidebarId,
    sidebarClass = 'ppm-sidebar',
    mainId,
    mainClass = 'ppm-main',
    sidebarItems = [],
    mainContent = '',
    showExport = false,
    topbarExtra = ''
  } = config

  const sidebarHtml = sidebarItems.map(item => {
    if (item.type === 'separator') {
      return `<div class="side-separator">${item.label || ''}</div>`
    }
    const cls = 'side-item' + (item.active ? ' active' : '') + (item.isBack ? ' back' : '')
    return `<div class="${cls}" data-view="${item.key}"><ion-icon name="${item.icon}"></ion-icon>${item.label}</div>`
  }).join('')

  const exportBtn = showExport
    ? `<span class="topbar-btn" id="btn-export"><ion-icon name="download-outline"></ion-icon> Exporteer</span>`
    : ''

  return `
    <div class="${rootClass}" id="${rootId}">
      <div class="${topbarClass}">
        <div class="topbar-brand">
          <span class="topbar-ppm">PPM</span>
          <span class="topbar-product">${platformName}</span>
        </div>
        ${topbarExtra}
        <div class="topbar-actions">
          ${exportBtn}
          <span class="topbar-btn" id="btn-profile"><ion-icon name="person-outline"></ion-icon> <span id="btn-profile-name">...</span></span>
          <span class="topbar-btn" id="btn-darkmode"><ion-icon name="moon-outline"></ion-icon></span>
        </div>
        <div class="profile-dropdown" id="profile-dropdown">
          <div class="dd-item" id="dd-profile"><ion-icon name="person-circle-outline"></ion-icon> Profiel</div>
          <div class="dd-item" id="dd-settings"><ion-icon name="settings-outline"></ion-icon> Instellingen</div>
          <div class="dd-item danger" id="dd-logout"><ion-icon name="log-out-outline"></ion-icon> Uitloggen</div>
        </div>
      </div>
      <div class="${sidebarClass}" id="${sidebarId}">
        ${sidebarHtml}
      </div>
      <div class="${mainClass}" id="${mainId}">
        ${mainContent}
      </div>
    </div>
  `
}

/**
 * Initialize shared shell events: dark mode restore, profile name loading.
 * Call once after renderShell().
 */
export function initShellEvents(config) {
  const { rootId, session } = config

  loadProfileName(session)

  if (localStorage.getItem('ppm-darkmode') === '1') {
    const root = document.getElementById(rootId)
    if (root) root.classList.add('dark-mode')
    const icon = document.querySelector('#btn-darkmode ion-icon')
    if (icon) icon.setAttribute('name', 'sunny-outline')
  }
}

/**
 * Handle shared click events (dark mode, profile, logout).
 * Call from your app's click handler. Returns true if event was consumed.
 */
export function handleShellClick(e, rootId) {
  if (e.target.closest('#btn-darkmode')) {
    const db = document.getElementById(rootId)
    db.classList.toggle('dark-mode')
    const isDark = db.classList.contains('dark-mode')
    document.querySelector('#btn-darkmode ion-icon').setAttribute('name', isDark ? 'sunny-outline' : 'moon-outline')
    localStorage.setItem('ppm-darkmode', isDark ? '1' : '0')
    return true
  }

  if (e.target.closest('#btn-profile')) {
    document.getElementById('profile-dropdown').classList.toggle('active')
    return true
  }

  if (e.target.closest('#dd-logout')) {
    signOut().then(() => window.location.reload())
    return true
  }

  // Close dropdown on outside click
  const dd = document.getElementById('profile-dropdown')
  if (dd && dd.classList.contains('active') && !e.target.closest('.profile-dropdown') && !e.target.closest('#btn-profile')) {
    dd.classList.remove('active')
  }

  return false
}

/**
 * Update sidebar active state.
 */
export function updateSidebarActive(sidebarId, activeView, extraMappings = {}) {
  document.querySelectorAll(`#${sidebarId} .side-item`).forEach(s => {
    const sv = s.dataset.view
    const isActive = sv === activeView || extraMappings[activeView] === sv
    s.classList.toggle('active', isActive)
  })
}

async function loadProfileName(session) {
  const nameEl = document.getElementById('btn-profile-name')
  if (!nameEl) return
  nameEl.textContent = session.user.email.split('@')[0]
  try {
    const profile = await getProfile()
    if (profile?.full_name) nameEl.textContent = profile.full_name
  } catch { /* keep email prefix */ }
}
