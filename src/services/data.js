/**
 * Data service — subset for ppm-sprints.
 * Only fetchProfiles + getUserName (needed by sprint views).
 */
import { supabase } from '../lib/supabase.js'

// === CACHE ===
let cachedProfiles = null

export function invalidateProfilesCache() { cachedProfiles = null }
export function invalidateAllCaches() { cachedProfiles = null }

// === FETCH FUNCTIONS ===

export async function fetchProfiles() {
  if (cachedProfiles) return cachedProfiles
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
    if (error) throw error
    cachedProfiles = data || []
  } catch (e) {
    console.warn('PPM: Could not fetch profiles', e)
    cachedProfiles = []
  }
  return cachedProfiles
}

export async function fetchPlatforms() {
  try {
    const { data, error } = await supabase
      .from('page_views')
      .select('platform')
    if (error) throw error
    const unique = [...new Set((data || []).map(d => d.platform?.trim()).filter(Boolean))]
    unique.sort()
    const labelMap = {
      assetmanagement: 'Assetmanagement',
      projectontwikkeling: 'Projectontwikkeling',
      acquisitie: 'Acquisitie',
      meta: 'Meta Dashboard'
    }
    return unique.map(p => ({
      key: p,
      label: labelMap[p] || p.charAt(0).toUpperCase() + p.slice(1)
    }))
  } catch (e) {
    console.warn('PPM: Could not fetch platforms', e)
    return [
      { key: 'assetmanagement', label: 'Assetmanagement' },
      { key: 'projectontwikkeling', label: 'Projectontwikkeling' },
      { key: 'acquisitie', label: 'Acquisitie' }
    ]
  }
}

// === HELPERS ===

export function getUserName(userId, profiles) {
  const p = profiles.find(pr => pr.id === userId)
  if (p && p.full_name) return p.full_name
  if (p && p.email) return p.email.split('@')[0]
  return userId ? userId.substring(0, 8) + '...' : '-'
}
