/**
 * Platform Switcher — navigatie tussen PPM dashboards.
 * Gedeeld via sync-shared.sh naar alle repos.
 *
 * Token relay: bij platform switch worden access_token + refresh_token
 * meegegeven als URL hash fragment. Het doel-dashboard pakt deze op
 * in auth.js → checkTokenRelay() en logt de gebruiker automatisch in.
 * Hash fragments worden NIET naar de server gestuurd (veilig).
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
    const btn = document.getElementById('btn-platform-switch')
    if (btn) btn.style.display = 'none'
    return
  }

  dropdown.innerHTML = platforms.map(p => {
    const cfg = PLATFORM_CONFIG[p]
    const isCurrent = p === currentPlatform
    return `
      <a class="platform-item${isCurrent ? ' current' : ''}" data-platform="${p}" data-url="${cfg.url}" href="${isCurrent ? '#' : cfg.url}">
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

  // Platform link click — intercept to add token relay
  const platformItem = e.target.closest('.platform-item[data-platform]')
  if (platformItem && !platformItem.classList.contains('current')) {
    e.preventDefault()
    navigateWithTokenRelay(platformItem.dataset.url)
    return true
  }

  // Close dropdown on outside click
  const dd = document.getElementById('platform-dropdown')
  if (dd && dd.classList.contains('active') && !e.target.closest('.platform-dropdown') && !e.target.closest('#btn-platform-switch')) {
    dd.classList.remove('active')
  }

  return false
}

/**
 * Navigate to another platform with auth tokens in URL hash.
 * Hash fragments are never sent to the server — safe for tokens.
 */
async function navigateWithTokenRelay(targetUrl) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const at = encodeURIComponent(session.access_token)
      const rt = encodeURIComponent(session.refresh_token)
      window.location.href = `${targetUrl}#ppm_at=${at}&ppm_rt=${rt}`
      return
    }
  } catch (err) {
    console.error('PPM: Token relay failed, navigating without auth', err)
  }
  // Fallback: navigate without tokens
  window.location.href = targetUrl
}
