/**
 * Team Context — Resolves the user's team automatically.
 * Shared across ALL PPM platforms via sync-shared.sh.
 *
 * Domain dashboards don't have a team selector, but kanban/meetings
 * are team-scoped. This utility auto-resolves (or creates) the team.
 */
import { supabase } from './supabase.js'

let _teamId = null
let _teamPromise = null

/**
 * Get or create the user's team. Caches result.
 * @returns {Promise<string>} teamId
 */
export async function resolveTeamId() {
  if (_teamId) return _teamId
  if (_teamPromise) return _teamPromise

  _teamPromise = _resolve()
  _teamId = await _teamPromise
  _teamPromise = null
  return _teamId
}

async function _resolve() {
  const cached = localStorage.getItem('ppm-active-team')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Niet ingelogd')

  // Fetch user's teams
  const { data: memberships, error } = await supabase
    .from('team_members')
    .select('team_id, teams(id, name)')
    .eq('user_id', user.id)

  if (error) throw error

  const teams = (memberships || []).map(m => m.teams).filter(Boolean)

  if (teams.length > 0) {
    // Use cached team if still valid, otherwise first team
    const match = teams.find(t => t.id === cached)
    const teamId = match ? match.id : teams[0].id
    localStorage.setItem('ppm-active-team', teamId)
    return teamId
  }

  // No teams yet — auto-create "PPM" team
  const { data: team, error: createErr } = await supabase
    .from('teams')
    .insert({ name: 'PPM', description: 'PPM Platform team', admin_user_id: user.id })
    .select()
    .single()

  if (createErr) throw createErr

  await supabase
    .from('team_members')
    .insert({ team_id: team.id, user_id: user.id, role: 'admin' })

  localStorage.setItem('ppm-active-team', team.id)
  return team.id
}

/** Reset cache (e.g., on team switch or logout). */
export function clearTeamCache() {
  _teamId = null
  _teamPromise = null
}
