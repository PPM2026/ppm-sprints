/**
 * Tasks service — CRUD for kanban board tasks and comments.
 */
import { supabase } from '../lib/supabase.js'

/**
 * Fetch tasks with optional filters.
 * @param {Object} filters - { platform, status, assignee_id, sprint_id }
 * @returns {Promise<Array>}
 */
export async function fetchTasks(filters = {}) {
  let query = supabase
    .from('tasks')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (filters.platform && filters.platform !== 'all') {
    query = query.eq('platform', filters.platform)
  }
  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.assignee_id) {
    query = query.eq('assignee_id', filters.assignee_id)
  }
  if (filters.sprint_id) {
    query = query.eq('sprint_id', filters.sprint_id)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

/**
 * Create a new task.
 * @param {Object} taskData
 * @returns {Promise<Object>} The created task
 */
export async function createTask(taskData) {
  const { data: { user } } = await supabase.auth.getUser()

  const row = {
    title: taskData.title,
    description: taskData.description || null,
    platform: taskData.platform,
    status: taskData.status || 'backlog',
    priority: taskData.priority || 'medium',
    assignee_id: taskData.assignee_id || null,
    labels: taskData.labels || [],
    due_date: taskData.due_date || null,
    sort_order: taskData.sort_order || 0,
    feedback_id: taskData.feedback_id || null,
    sprint_id: taskData.sprint_id || null,
    idea_id: taskData.idea_id || null,
    claude_chat_url: taskData.claude_chat_url || null,
    created_by: user?.id || null
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert(row)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Update any fields on a task.
 * @param {string} id - Task UUID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} The updated task
 */
export async function updateTask(id, updates) {
  // Auto-set completed_at when moving to done
  if (updates.status === 'done' && !updates.completed_at) {
    updates.completed_at = new Date().toISOString()
  }
  // Clear completed_at when moving out of done
  if (updates.status && updates.status !== 'done') {
    updates.completed_at = null
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Move a task to a new status/position (drag-drop).
 * @param {string} id - Task UUID
 * @param {string} newStatus - Target column status
 * @param {number} newSortOrder - New sort position
 * @returns {Promise<Object>}
 */
export async function moveTask(id, newStatus, newSortOrder) {
  const updates = {
    status: newStatus,
    sort_order: newSortOrder,
    updated_at: new Date().toISOString()
  }

  if (newStatus === 'done') {
    updates.completed_at = new Date().toISOString()
  } else {
    updates.completed_at = null
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Create a task pre-populated from a feedback item.
 * @param {string} feedbackId - Feedback UUID
 * @returns {Promise<Object>}
 */
export async function createTaskFromFeedback(feedbackId) {
  // Fetch the feedback item
  const { data: fb, error: fbErr } = await supabase
    .from('feedback')
    .select('*')
    .eq('id', feedbackId)
    .single()

  if (fbErr) throw fbErr

  const priorityMap = {
    low: 'low',
    medium: 'medium',
    high: 'high',
    critical: 'critical'
  }

  return createTask({
    title: `[${fb.type === 'bug' ? 'Bug' : 'Feature'}] ${fb.description?.substring(0, 80) || 'Feedback item'}`,
    description: fb.description || '',
    platform: fb.platform || 'meta',
    status: 'backlog',
    priority: priorityMap[fb.priority] || 'medium',
    feedback_id: feedbackId,
    labels: fb.type ? [fb.type] : []
  })
}

/**
 * Add a comment to a task.
 * @param {string} taskId - Task UUID
 * @param {string} content - Comment text
 * @returns {Promise<Object>}
 */
export async function addComment(taskId, content) {
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('task_comments')
    .insert({
      task_id: taskId,
      user_id: user?.id,
      content
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Fetch all comments for a task, newest first.
 * @param {string} taskId - Task UUID
 * @returns {Promise<Array>}
 */
export async function fetchComments(taskId) {
  const { data, error } = await supabase
    .from('task_comments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Delete a task (cascade deletes comments).
 * @param {string} id - Task UUID
 */
export async function deleteTask(id) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/**
 * Fetch todos for a task.
 */
export async function fetchTaskTodos(taskId) {
  const { data, error } = await supabase
    .from('task_todos')
    .select('*')
    .eq('task_id', taskId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * Add a todo to a task.
 */
export async function addTaskTodo(taskId, title, sortOrder = 0) {
  const { data, error } = await supabase
    .from('task_todos')
    .insert({ task_id: taskId, title, sort_order: sortOrder })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Toggle a todo's done status.
 */
export async function toggleTaskTodo(todoId, done) {
  const { data, error } = await supabase
    .from('task_todos')
    .update({ done })
    .eq('id', todoId)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Delete a todo.
 */
export async function deleteTaskTodo(todoId) {
  const { error } = await supabase
    .from('task_todos')
    .delete()
    .eq('id', todoId)
  if (error) throw error
}

/**
 * Batch-create todos for a task (used by idea omzetter).
 */
export async function batchCreateTaskTodos(taskId, titles) {
  const rows = titles.map((title, i) => ({
    task_id: taskId,
    title,
    sort_order: i
  }))
  const { data, error } = await supabase
    .from('task_todos')
    .insert(rows)
    .select()
  if (error) throw error
  return data || []
}

/**
 * Fetch tasks with todo progress counts.
 * Returns tasks with added `todo_total` and `todo_done` fields.
 */
export async function fetchTasksWithTodoProgress(filters = {}) {
  const tasks = await fetchTasks(filters)
  if (tasks.length === 0) return tasks

  // Fetch all todos for these tasks in one query
  const taskIds = tasks.map(t => t.id)
  const { data: todos, error } = await supabase
    .from('task_todos')
    .select('task_id, done')
    .in('task_id', taskIds)

  if (error) {
    console.warn('PPM: Could not fetch task todos', error)
    return tasks.map(t => ({ ...t, todo_total: 0, todo_done: 0 }))
  }

  // Count per task
  const counts = {}
  ;(todos || []).forEach(td => {
    if (!counts[td.task_id]) counts[td.task_id] = { total: 0, done: 0 }
    counts[td.task_id].total++
    if (td.done) counts[td.task_id].done++
  })

  return tasks.map(t => ({
    ...t,
    todo_total: counts[t.id]?.total || 0,
    todo_done: counts[t.id]?.done || 0
  }))
}
