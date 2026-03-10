/**
 * Sprints service — CRUD for sprints + report generation + AI sprint planning.
 */
import { supabase } from '../lib/supabase.js'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'

/**
 * Generate a full sprint plan using AI (Claude Sonnet).
 * Creates sprint + tasks + todos in one call.
 * @param {string} ideaId
 * @returns {Promise<{success: boolean, sprint_id: string, sprint: object}>}
 */
export async function generateSprintPlan(ideaId) {
  const { data: { session } } = await supabase.auth.getSession()
  const response = await fetch(`${FUNCTIONS_URL}/sprint-plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ idea_id: ideaId })
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'Sprint plan generatie mislukt')
  }
  return response.json()
}

/**
 * Fetch all sprints ordered by start_date descending.
 */
export async function fetchSprints() {
  const { data, error } = await supabase
    .from('sprints')
    .select('*')
    .order('start_date', { ascending: false })
  if (error) {
    console.warn('PPM: Could not fetch sprints', error)
    return []
  }
  return data || []
}

/**
 * Create a new sprint.
 * @param {{ name: string, goal?: string, start_date: string, end_date: string }} data
 */
export async function createSprint(data) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data: sprint, error } = await supabase
    .from('sprints')
    .insert({
      name: data.name,
      goal: data.goal || null,
      start_date: data.start_date,
      end_date: data.end_date,
      status: 'planning',
      idea_id: data.idea_id || null,
      created_by: user?.id || null
    })
    .select()
    .single()
  if (error) throw error
  return sprint
}

/**
 * Update an existing sprint.
 * @param {string} id
 * @param {object} updates — any sprint fields to update
 */
export async function updateSprint(id, updates) {
  const { data, error } = await supabase
    .from('sprints')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Delete a sprint.
 * @param {string} id
 */
export async function deleteSprint(id) {
  const { error } = await supabase
    .from('sprints')
    .delete()
    .eq('id', id)
  if (error) throw error
}

/**
 * Fetch tasks linked to a sprint.
 */
export async function fetchSprintTasks(sprintId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('sprint_id', sprintId)
    .order('sort_order', { ascending: true })
  if (error) {
    console.warn('PPM: Could not fetch sprint tasks', error)
    return []
  }
  return data || []
}

/**
 * Fetch sprint tasks with todo progress.
 */
export async function fetchSprintTasksWithProgress(sprintId) {
  const tasks = await fetchSprintTasks(sprintId)
  if (tasks.length === 0) return tasks

  const taskIds = tasks.map(t => t.id)
  const { data: todos } = await supabase
    .from('task_todos')
    .select('task_id, done')
    .in('task_id', taskIds)

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

/**
 * Fetch the currently active sprint (status = 'active').
 */
export async function fetchActiveSprint() {
  const { data, error } = await supabase
    .from('sprints')
    .select('*')
    .eq('status', 'active')
    .limit(1)
    .single()
  if (error) return null
  return data
}

/**
 * Start sprint execution on Mac Mini.
 * Inserts execution rows per repo → triggers ppm-runner listener.
 */
export async function executeSprint(sprintId) {
  const { data: sprint, error } = await supabase
    .from('sprints')
    .select('*')
    .eq('id', sprintId)
    .single()
  if (error || !sprint) throw new Error('Sprint niet gevonden')
  if (!sprint.claude_code_prompt) throw new Error('Geen Claude Code prompt beschikbaar')

  // Parse repos from report_html
  let reportData = {}
  try { reportData = JSON.parse(sprint.report_html || '{}') } catch { /* ignore */ }
  const repos = reportData.repos_involved || []
  if (repos.length === 0) throw new Error('Geen repositories gevonden in sprint plan')

  const branchName = reportData.branch_name || `sprint/S-${sprint.display_id}`

  // Insert execution row per repo (triggers Mac Mini listener via Realtime)
  for (const repo of repos) {
    const { error: insertErr } = await supabase.from('sprint_executions').insert({
      sprint_id: sprintId,
      repo_name: repo,
      status: 'queued',
      branch_name: branchName
    })
    if (insertErr) console.warn('PPM: execution insert failed for', repo, insertErr)
  }

  // Update sprint status
  await updateSprint(sprintId, { execution_status: 'queued' })
  return repos
}

/**
 * Start sprint in PLAN mode — Claude Code analyses repos read-only.
 * Creates execution rows with mode='plan'.
 */
export async function planSprint(sprintId) {
  const { data: sprint, error } = await supabase
    .from('sprints')
    .select('*')
    .eq('id', sprintId)
    .single()
  if (error || !sprint) throw new Error('Sprint niet gevonden')
  if (!sprint.claude_code_prompt) throw new Error('Geen Claude Code prompt beschikbaar')

  let reportData = {}
  try { reportData = JSON.parse(sprint.report_html || '{}') } catch { /* ignore */ }
  const repos = reportData.repos_involved || []
  if (repos.length === 0) throw new Error('Geen repositories gevonden in sprint plan')

  for (const repo of repos) {
    const { error: insertErr } = await supabase.from('sprint_executions').insert({
      sprint_id: sprintId,
      repo_name: repo,
      status: 'queued',
      mode: 'plan'
    })
    if (insertErr) console.warn('PPM: plan insert failed for', repo, insertErr)
  }

  await updateSprint(sprintId, { execution_status: 'queued' })
  return repos
}

/**
 * Approve plan and start execution — creates new execution rows with mode='execute'.
 * Deletes old plan rows first.
 */
export async function approvePlan(sprintId) {
  const { data: sprint, error } = await supabase
    .from('sprints')
    .select('*')
    .eq('id', sprintId)
    .single()
  if (error || !sprint) throw new Error('Sprint niet gevonden')

  let reportData = {}
  try { reportData = JSON.parse(sprint.report_html || '{}') } catch { /* ignore */ }
  const repos = reportData.repos_involved || []
  const branchName = reportData.branch_name || `sprint/S-${sprint.display_id}`

  // Delete old plan rows
  await supabase.from('sprint_executions')
    .delete()
    .eq('sprint_id', sprintId)
    .eq('mode', 'plan')

  // Insert execute rows
  for (const repo of repos) {
    const { error: insertErr } = await supabase.from('sprint_executions').insert({
      sprint_id: sprintId,
      repo_name: repo,
      status: 'queued',
      mode: 'execute',
      branch_name: branchName
    })
    if (insertErr) console.warn('PPM: execute insert failed for', repo, insertErr)
  }

  await updateSprint(sprintId, { execution_status: 'queued' })
  return repos
}

/**
 * Fetch execution status rows for a sprint.
 */
export async function fetchSprintExecutions(sprintId) {
  const { data, error } = await supabase
    .from('sprint_executions')
    .select('*')
    .eq('sprint_id', sprintId)
    .order('created_at', { ascending: true })
  if (error) {
    console.warn('PPM: Could not fetch executions', error)
    return []
  }
  return data || []
}

/**
 * Subscribe to execution status changes for a sprint.
 * @returns {function} unsubscribe
 */
export function subscribeToExecutions(sprintId, callback) {
  const channel = supabase
    .channel(`exec-${sprintId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'sprint_executions',
      filter: `sprint_id=eq.${sprintId}`
    }, callback)
    .subscribe()

  return () => supabase.removeChannel(channel)
}

// --- Code Environment service functions ---

/**
 * Fetch a single execution row.
 */
export async function fetchExecution(executionId) {
  const { data, error } = await supabase
    .from('sprint_executions')
    .select('*, sprints(name, display_id, claude_code_prompt)')
    .eq('id', executionId)
    .single()
  if (error) throw error
  return data
}

/**
 * Fetch all events for an execution (for initial load).
 */
export async function fetchExecutionEvents(executionId) {
  const { data, error } = await supabase
    .from('sprint_execution_events')
    .select('*')
    .eq('execution_id', executionId)
    .order('id', { ascending: true })
  if (error) {
    console.warn('PPM: Could not fetch execution events', error)
    return []
  }
  return data || []
}

/**
 * Subscribe to new execution events (realtime).
 * @returns {function} unsubscribe
 */
export function subscribeToExecutionEvents(executionId, callback) {
  const channel = supabase
    .channel(`events-${executionId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'sprint_execution_events',
      filter: `execution_id=eq.${executionId}`
    }, callback)
    .subscribe()

  return () => supabase.removeChannel(channel)
}

/**
 * Send a chat message to an execution (user → Mac Mini).
 */
export async function sendExecutionMessage(executionId, content) {
  const { error } = await supabase
    .from('sprint_execution_messages')
    .insert({
      execution_id: executionId,
      role: 'user',
      content
    })
  if (error) throw error
}

/**
 * Delete an execution and its events/messages.
 */
export async function deleteExecution(executionId) {
  // Delete events and messages first (foreign key)
  await supabase.from('sprint_execution_events').delete().eq('execution_id', executionId)
  await supabase.from('sprint_execution_messages').delete().eq('execution_id', executionId)
  const { error } = await supabase.from('sprint_executions').delete().eq('id', executionId)
  if (error) throw error
}

/**
 * Subscribe to execution status changes (for header updates).
 * @returns {function} unsubscribe
 */
export function subscribeToExecution(executionId, callback) {
  const channel = supabase
    .channel(`exec-status-${executionId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'sprint_executions',
      filter: `id=eq.${executionId}`
    }, callback)
    .subscribe()

  return () => supabase.removeChannel(channel)
}

/**
 * Generate an HTML sprint report from sprint data + tasks.
 * @param {string} sprintId
 */
export async function generateSprintReport(sprintId) {
  const { data: sprint, error } = await supabase
    .from('sprints')
    .select('*')
    .eq('id', sprintId)
    .single()
  if (error) throw error

  const tasks = await fetchSprintTasks(sprintId)

  const totalTasks = tasks.length
  const doneTasks = tasks.filter(t => t.status === 'done').length
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress' || t.status === 'review').length
  const openTasks = tasks.filter(t => t.status === 'backlog' || t.status === 'todo').length
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  const startDate = new Date(sprint.start_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
  const endDate = new Date(sprint.end_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })

  const html = `
    <div class="sprint-report">
      <h3 style="margin:0 0 4px;font-size:15px;font-weight:700;">Sprint Rapport: ${sprint.name}</h3>
      <p style="margin:0 0 16px;font-size:11px;color:rgba(0,0,0,0.4);">${startDate} - ${endDate}</p>

      ${sprint.goal ? `<div style="margin-bottom:16px;">
        <div style="font-size:10px;font-weight:600;color:rgba(0,0,0,0.35);text-transform:uppercase;margin-bottom:4px;">Doel</div>
        <div style="font-size:12px;color:rgba(0,0,0,0.7);line-height:1.5;">${sprint.goal}</div>
      </div>` : ''}

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;">
        <div style="text-align:center;padding:10px;background:rgba(0,0,0,0.02);border-radius:8px;">
          <div style="font-size:18px;font-weight:700;">${totalTasks}</div>
          <div style="font-size:10px;color:rgba(0,0,0,0.4);">Totaal</div>
        </div>
        <div style="text-align:center;padding:10px;background:rgba(52,199,89,0.06);border-radius:8px;">
          <div style="font-size:18px;font-weight:700;color:#1B7D3A;">${doneTasks}</div>
          <div style="font-size:10px;color:rgba(0,0,0,0.4);">Afgerond</div>
        </div>
        <div style="text-align:center;padding:10px;background:rgba(59,130,246,0.06);border-radius:8px;">
          <div style="font-size:18px;font-weight:700;color:#2563EB;">${inProgressTasks}</div>
          <div style="font-size:10px;color:rgba(0,0,0,0.4);">In uitvoering</div>
        </div>
        <div style="text-align:center;padding:10px;background:rgba(255,149,0,0.06);border-radius:8px;">
          <div style="font-size:18px;font-weight:700;color:#B36B00;">${openTasks}</div>
          <div style="font-size:10px;color:rgba(0,0,0,0.4);">Open</div>
        </div>
      </div>

      <div style="margin-bottom:16px;">
        <div style="font-size:10px;font-weight:600;color:rgba(0,0,0,0.35);text-transform:uppercase;margin-bottom:6px;">Voortgang</div>
        <div style="height:8px;border-radius:4px;background:rgba(0,0,0,0.06);overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:#1B7D3A;border-radius:4px;transition:width 0.3s;"></div>
        </div>
        <div style="font-size:11px;color:rgba(0,0,0,0.4);margin-top:4px;">${pct}% afgerond</div>
      </div>

      ${tasks.length > 0 ? `
        <div style="font-size:10px;font-weight:600;color:rgba(0,0,0,0.35);text-transform:uppercase;margin-bottom:6px;">Taken</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="border-bottom:1px solid rgba(0,0,0,0.08);">
              <th style="text-align:left;padding:6px 8px;font-weight:600;color:rgba(0,0,0,0.35);font-size:10px;">Beschrijving</th>
              <th style="text-align:left;padding:6px 8px;font-weight:600;color:rgba(0,0,0,0.35);font-size:10px;">Status</th>
              <th style="text-align:left;padding:6px 8px;font-weight:600;color:rgba(0,0,0,0.35);font-size:10px;">Type</th>
            </tr>
          </thead>
          <tbody>
            ${tasks.map(t => `
              <tr style="border-bottom:1px solid rgba(0,0,0,0.03);">
                <td style="padding:6px 8px;">${t.description ? t.description.substring(0, 60) : '-'}</td>
                <td style="padding:6px 8px;">${t.status || '-'}</td>
                <td style="padding:6px 8px;">${t.type || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<div style="font-size:12px;color:rgba(0,0,0,0.3);text-align:center;padding:20px;">Geen taken gekoppeld aan deze sprint</div>'}
    </div>
  `

  // Save report to sprint
  await supabase
    .from('sprints')
    .update({ report_html: html, updated_at: new Date().toISOString() })
    .eq('id', sprintId)

  return html
}
