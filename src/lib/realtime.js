/**
 * Realtime sync — Supabase Realtime subscriptions for cross-device sync.
 * Subscribe to idea, conversation, and sprint changes.
 */
import { supabase } from './supabase.js'

/**
 * Subscribe to all changes related to an idea.
 * @param {string} ideaId
 * @param {object} callbacks
 * @param {function} [callbacks.onIdeaUpdate] — called with updated row
 * @param {function} [callbacks.onSprintChange] — called with payload
 * @returns {function} unsubscribe
 */
export function subscribeToIdea(ideaId, callbacks = {}) {
  const channel = supabase
    .channel(`idea-sync-${ideaId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'idea_captures',
      filter: `id=eq.${ideaId}`
    }, (payload) => callbacks.onIdeaUpdate?.(payload.new))
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'sprints',
      filter: `idea_id=eq.${ideaId}`
    }, (payload) => callbacks.onSprintChange?.(payload))
    .subscribe()

  return () => supabase.removeChannel(channel)
}

/**
 * Subscribe to new messages in a conversation.
 * @param {string} conversationId
 * @param {object} callbacks
 * @param {function} [callbacks.onNewMessage] — called with new message row
 * @returns {function} unsubscribe
 */
/**
 * Subscribe to sprint changes (tasks + todos).
 * @param {string} sprintId
 * @param {object} callbacks
 * @param {function} [callbacks.onSprintUpdate] — sprint row changed
 * @param {function} [callbacks.onTaskChange] — task inserted/updated/deleted
 * @param {function} [callbacks.onTodoChange] — todo inserted/updated
 * @returns {function} unsubscribe
 */
export function subscribeToSprint(sprintId, callbacks = {}) {
  const channel = supabase
    .channel(`sprint-sync-${sprintId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'sprints',
      filter: `id=eq.${sprintId}`
    }, (payload) => callbacks.onSprintUpdate?.(payload.new))
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'tasks',
      filter: `sprint_id=eq.${sprintId}`
    }, (payload) => callbacks.onTaskChange?.(payload))
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'task_todos'
    }, (payload) => callbacks.onTodoChange?.(payload))
    .subscribe()

  return () => supabase.removeChannel(channel)
}

export function subscribeToConversation(conversationId, callbacks = {}) {
  const channel = supabase
    .channel(`conv-sync-${conversationId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'conversation_messages',
      filter: `conversation_id=eq.${conversationId}`
    }, (payload) => callbacks.onNewMessage?.(payload.new))
    .subscribe()

  return () => supabase.removeChannel(channel)
}
