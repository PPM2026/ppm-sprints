/**
 * Microsoft 365 Data — Read-only service for Microsoft data stored in Supabase.
 * Shared across ALL PPM platforms via sync-shared.sh.
 *
 * No OAuth, no Edge Functions — only Supabase queries.
 * The actual OAuth + sync logic lives in microsoft.js (team-dashboard only).
 */
import { supabase } from './supabase.js'

// === Connection Status ===

export async function getMicrosoftStatus() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('microsoft_integration_status')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) { console.error('PPM: Microsoft status error', error); return null }
  return data
}

export function isMicrosoftConnected(status) {
  return status && status.status === 'active'
}

// === OneDrive Files ===

export async function getMyFiles(parentId = null) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  let query = supabase
    .from('onedrive_files')
    .select('*')
    .eq('user_id', user.id)
    .order('is_folder', { ascending: false })
    .order('name')

  if (parentId) {
    query = query.eq('parent_drive_item_id', parentId)
  } else {
    query = query.is('parent_drive_item_id', null)
  }

  const { data, error } = await query
  if (error) { console.error('PPM: OneDrive files error', error); return [] }
  return data || []
}

// === Outlook Emails ===

export async function getMyEmails({ limit = 50, unreadOnly = false } = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  let query = supabase
    .from('outlook_emails')
    .select('*')
    .eq('user_id', user.id)
    .order('received_at', { ascending: false })
    .limit(limit)

  if (unreadOnly) query = query.eq('is_read', false)

  const { data, error } = await query
  if (error) { console.error('PPM: Outlook emails error', error); return [] }
  return data || []
}

export async function getUnreadCount() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const { count, error } = await supabase
    .from('outlook_emails')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false)

  if (error) { console.error('PPM: Unread count error', error); return 0 }
  return count || 0
}

// === Outlook Calendar ===

export async function getMyEvents(startDate, endDate) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('outlook_events')
    .select('*')
    .eq('user_id', user.id)
    .gte('start_at', startDate)
    .lte('end_at', endDate)
    .order('start_at')

  if (error) { console.error('PPM: Outlook events error', error); return [] }
  return data || []
}

export async function getTodayEvents() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
  return getMyEvents(start, end)
}

export async function getUpcomingEvents(days = 7) {
  const now = new Date()
  const start = now.toISOString()
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
  return getMyEvents(start, end)
}
