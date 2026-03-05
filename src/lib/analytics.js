import { supabase } from './supabase.js'

const PLATFORM = import.meta.env.VITE_PLATFORM_NAME || 'unknown'

const SESSION_ID = 'ppm_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36)

export function trackView(viewPath) {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) return
    supabase.from('page_views').insert({
      user_id: session.user.id,
      platform: PLATFORM,
      view_path: viewPath,
      session_id: SESSION_ID
    }).then(() => {}) // fire and forget
  })
}
