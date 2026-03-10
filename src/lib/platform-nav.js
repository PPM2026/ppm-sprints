/**
 * Platform Switcher — navigatie tussen PPM dashboards.
 * Gedeeld via sync-shared.sh naar alle repos.
 */
import { supabase } from './supabase.js'

const PLATFORM_CONFIG = {
  assetmanagement:     { label: 'Asset Management',     icon: 'business-outline',   url: 'https://ppm-assetmanagement.vercel.app' },
  projectontwikkeling: { label: 'Projectontwikkeling',  icon: 'construct-outline',  url: 'https://ppm-projectontwikkeling.vercel.app' },
  acquisitie:          { label: 'Acquisitie',            icon: 'trending-up-outline', url: 'https://ppm-acquisitie.vercel.app' },
  team:                { label: 'Team Dashboard',        icon: 'people-outline',     url: 'https://ppm-team-dashboard.vercel.app' },
  meta:                { label: 'Admin Dashboard',       icon: 'shield-outline',     url: 'https://ppm-admin-dashboard.vercel.app' },
  ideeen:              { label: 'Ideeën',                icon: 'bulb-outline',       url: 'https://ppm-ideeen.vercel.app' }
}

let _cachedAccess = null

export async function getPlatformAccess() {
  if (_cachedAccess) return _cachedAccess

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
      .from('user_platform_access')
      .select('platform')
      .eq('user_id', user.id)

    if (error) throw error

    _cachedAccess = (data || [])
      .map(row => row.platform)
      .filter(p => PLATFORM_CONFIG[p])

    return _cachedAccess
  } catch (err) {
    console.error('PPM: Failed to load platform access', err)
    return []
  }
}

export function renderPlatformSwitcher(currentPlatform) {
  return `
    <span class="topbar-btn" id="btn-platform-switch">
      <ion-icon name="apps-outline"></ion-icon>
    </span>
    <div class="platform-dropdown" id="platform-dropdown"></div>
  `
}

export async function initPlatformSwitcher(currentPlatform) {
  const dropdown = document.getElementById('platform-dropdown')
  if (!dropdown) return

  const platforms = await getPlatformAccess()
  if (platforms.length <= 1) {
    // Hide switcher if user only has access to current platform
    const btn = document.getElementById('btn-platform-switch')
    if (btn) btn.style.display = 'none'
    return
  }

  dropdown.innerHTML = platforms.map(p => {
    const cfg = PLATFORM_CONFIG[p]
    const isCurrent = p === currentPlatform
    return `
      <a class="platform-item${isCurrent ? ' current' : ''}" href="${cfg.url}" ${isCurrent ? '' : ''}>
        <ion-icon name="${cfg.icon}"></ion-icon>
        <span>${cfg.label}</span>
        ${isCurrent ? '<ion-icon name="checkmark-outline" class="platform-check"></ion-icon>' : ''}
      </a>
    `
  }).join('')
}

export function handlePlatformSwitcherClick(e) {
  if (e.target.closest('#btn-platform-switch')) {
    const dd = document.getElementById('platform-dropdown')
    if (dd) dd.classList.toggle('active')
    return true
  }

  // Close dropdown on outside click
  const dd = document.getElementById('platform-dropdown')
  if (dd && dd.classList.contains('active') && !e.target.closest('.platform-dropdown') && !e.target.closest('#btn-platform-switch')) {
    dd.classList.remove('active')
  }

  return false
}
