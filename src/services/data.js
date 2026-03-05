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

// === HELPERS ===

export function getUserName(userId, profiles) {
  const p = profiles.find(pr => pr.id === userId)
  if (p && p.full_name) return p.full_name
  if (p && p.email) return p.email.split('@')[0]
  return userId ? userId.substring(0, 8) + '...' : '-'
}
