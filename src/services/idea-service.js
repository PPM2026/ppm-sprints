/**
 * Idea service — CRUD for idea_captures.
 */
import { supabase } from '../lib/supabase.js'
import { createTask, batchCreateTaskTodos } from './tasks-service.js'

/**
 * Fetch all idea captures ordered by created_at descending.
 */
export async function fetchIdeas() {
  const { data, error } = await supabase
    .from('idea_captures')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    console.warn('PPM: Could not fetch ideas', error)
    return []
  }
  return data || []
}

/**
 * Save a new raw idea.
 * @param {{ raw_input: string, audio_url?: string }} data
 */
export async function saveIdea(data) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data: idea, error } = await supabase
    .from('idea_captures')
    .insert({
      raw_input: data.raw_input,
      audio_url: data.audio_url || null,
      status: 'captured',
      created_by: user?.id || null
    })
    .select()
    .single()
  if (error) throw error
  return idea
}

/**
 * Update an idea with parsed/generated fields.
 * @param {string} id
 * @param {object} updates — parsed_title, parsed_description, suggested_platform, etc.
 */
export async function updateIdea(id, updates) {
  const { data, error } = await supabase
    .from('idea_captures')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Dismiss an idea (set status to 'dismissed').
 * @param {string} id
 */
export async function dismissIdea(id) {
  const { data, error } = await supabase
    .from('idea_captures')
    .update({ status: 'dismissed' })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Create a task from a parsed idea, auto-linking to active sprint and generating todos.
 * @param {object} idea - The parsed idea object
 * @param {object} options - { sprintId, todos: string[] }
 * @returns {Promise<object>} - Created task
 */
export async function createTaskFromIdea(idea, options = {}) {
  const task = await createTask({
    title: idea.parsed_title || idea.raw_input?.substring(0, 80) || 'Nieuw idee',
    description: idea.parsed_description || idea.raw_input || '',
    platform: idea.suggested_platform || 'meta',
    status: 'backlog',
    priority: idea.suggested_priority || 'medium',
    sprint_id: options.sprintId || idea.suggested_sprint_id || null,
    labels: idea.suggested_type ? [idea.suggested_type] : []
  })

  // Create todos if provided
  if (options.todos && options.todos.length > 0) {
    await batchCreateTaskTodos(task.id, options.todos)
  }

  // Update idea with task link
  await updateIdea(idea.id, {
    generated_task_id: task.id,
    status: 'task_created'
  })

  return task
}

/**
 * Fetch ideas with optional filters, ordered by created_at desc.
 * @param {{ status?: string }} filters
 */
export async function fetchIdeasFiltered(filters = {}) {
  let query = supabase
    .from('idea_captures')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }

  const { data, error } = await query
  if (error) {
    console.warn('PPM: Could not fetch ideas', error)
    return []
  }
  return data || []
}

/**
 * Fetch idea counts per status.
 */
export async function fetchIdeaStats() {
  const { data, error } = await supabase
    .from('idea_captures')
    .select('status')

  if (error) {
    console.warn('PPM: Could not fetch idea stats', error)
    return { total: 0, captured: 0, parsed: 0, task_created: 0, dismissed: 0 }
  }

  const stats = { total: (data || []).length, captured: 0, parsed: 0, task_created: 0, dismissed: 0 }
  ;(data || []).forEach(d => {
    if (stats[d.status] !== undefined) stats[d.status]++
  })
  return stats
}

/**
 * Fetch a single idea with its linked sprints.
 */
export async function fetchIdeaWithSprints(ideaId) {
  const [ideaRes, sprintsRes] = await Promise.all([
    supabase.from('idea_captures').select('*').eq('id', ideaId).single(),
    supabase.from('sprints').select('*').eq('idea_id', ideaId).order('start_date', { ascending: false })
  ])

  if (ideaRes.error) {
    console.warn('PPM: Could not fetch idea', ideaRes.error)
    return null
  }

  return {
    ...ideaRes.data,
    sprints: sprintsRes.data || []
  }
}

/**
 * Fetch all sprints linked to an idea.
 */
export async function fetchSprintsForIdea(ideaId) {
  const { data, error } = await supabase
    .from('sprints')
    .select('*')
    .eq('idea_id', ideaId)
    .order('start_date', { ascending: false })

  if (error) {
    console.warn('PPM: Could not fetch sprints for idea', error)
    return []
  }
  return data || []
}

/**
 * Fetch all tasks linked to an idea (across all sprints).
 */
export async function fetchTasksForIdea(ideaId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('idea_id', ideaId)
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('PPM: Could not fetch tasks for idea', error)
    return []
  }
  return data || []
}

/**
 * Link an idea to a sprint by setting sprint.idea_id.
 */
export async function linkIdeaToSprint(ideaId, sprintId) {
  const { error } = await supabase
    .from('sprints')
    .update({ idea_id: ideaId })
    .eq('id', sprintId)

  if (error) throw error
}

/**
 * Upload an attachment (photo, sketch, PDF) for an idea.
 * Stores file in Supabase Storage and adds reference to idea.attachments jsonb.
 */
export async function uploadIdeaAttachment(ideaId, file) {
  const { data: { user } } = await supabase.auth.getUser()
  const ext = file.name.split('.').pop() || 'jpg'
  const fileName = `${user?.id || 'anon'}/${ideaId}/${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('idea-attachments')
    .upload(fileName, file, { contentType: file.type, upsert: false })

  if (uploadError) throw uploadError

  const { data: { publicUrl } } = supabase.storage
    .from('idea-attachments')
    .getPublicUrl(fileName)

  // Add to idea.attachments array
  const { data: idea } = await supabase.from('idea_captures').select('attachments').eq('id', ideaId).single()
  const attachments = idea?.attachments || []
  attachments.push({
    url: publicUrl,
    path: fileName,
    name: file.name,
    type: file.type,
    size: file.size,
    uploaded_at: new Date().toISOString()
  })

  await supabase.from('idea_captures').update({ attachments }).eq('id', ideaId)
  return { url: publicUrl, attachments }
}

/**
 * Delete an attachment from an idea.
 */
export async function deleteIdeaAttachment(ideaId, attachmentPath) {
  await supabase.storage.from('idea-attachments').remove([attachmentPath])

  const { data: idea } = await supabase.from('idea_captures').select('attachments').eq('id', ideaId).single()
  const attachments = (idea?.attachments || []).filter(a => a.path !== attachmentPath)
  await supabase.from('idea_captures').update({ attachments }).eq('id', ideaId)
  return attachments
}

/**
 * Delete an idea and its associations.
 */
export async function deleteIdea(ideaId) {
  // Unlink sprints first (don't delete them, just remove idea_id)
  await supabase.from('sprints').update({ idea_id: null }).eq('idea_id', ideaId)
  // Unlink tasks
  await supabase.from('tasks').update({ idea_id: null }).eq('idea_id', ideaId)
  // Delete the idea
  const { error } = await supabase.from('idea_captures').delete().eq('id', ideaId)
  if (error) throw error
}
