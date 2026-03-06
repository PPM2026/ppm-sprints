/**
 * Chat Panel — reusable AI chat component with streaming support.
 * Used in idee-detail (idea refinement) and later sprint buddy.
 */
import { sendChatMessage, fetchConversations, fetchMessages, generateConversationSummary } from '../services/idea-ai-service.js'
import { createSpeechEngine } from './speech-engine.js'
import { subscribeToConversation } from '../lib/realtime.js'

/**
 * Render a chat panel into a container element.
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {string} opts.ideaId — the idea to chat about
 * @param {string} [opts.conversationId] — existing conversation to resume
 */
export async function renderChatPanel(container, opts = {}) {
  const { ideaId } = opts
  let conversationId = opts.conversationId || null
  let isStreaming = false
  let abortStream = null
  let speechEngine = null
  let unsubConversation = null
  const localMessages = new Set() // track messages sent by this client

  // Try to resume existing conversation
  if (!conversationId && ideaId) {
    const convs = await fetchConversations(ideaId)
    if (convs.length > 0) conversationId = convs[0].id
  }

  container.innerHTML = `
    <div class="chat-panel">
      <div class="chat-messages" id="chat-messages">
        <div class="chat-welcome">
          <ion-icon name="sparkles-outline"></ion-icon>
          <div class="chat-welcome-title">AI Denkpartner</div>
          <div class="chat-welcome-sub">Stel een vraag over dit idee. Ik help je het uitwerken, denk mee over scope, haalbaarheid en prioriteit.</div>
        </div>
      </div>
      <div class="chat-input-bar">
        <button class="chat-speech-btn" id="chat-speech-btn" title="Spraak invoer">
          <ion-icon name="mic-outline"></ion-icon>
        </button>
        <textarea class="chat-input" id="chat-input" rows="1" placeholder="Stel een vraag of beschrijf wat je wilt uitwerken..."></textarea>
        <button class="chat-send-btn" id="chat-send-btn" title="Verstuur" disabled>
          <ion-icon name="send-outline"></ion-icon>
        </button>
      </div>
    </div>
  `

  const messagesEl = container.querySelector('#chat-messages')
  const inputEl = container.querySelector('#chat-input')
  const sendBtn = container.querySelector('#chat-send-btn')
  const speechBtn = container.querySelector('#chat-speech-btn')

  // Load existing messages
  if (conversationId) {
    const messages = await fetchMessages(conversationId)
    if (messages.length > 0) {
      messagesEl.querySelector('.chat-welcome')?.remove()
      messages.forEach(m => {
        if (m.role === 'user' || m.role === 'assistant') {
          appendBubble(m.role, m.content)
          localMessages.add(m.content)
        }
      })
      scrollToBottom()
    }
    startConversationSync(conversationId)
  }

  function startConversationSync(convId) {
    if (unsubConversation) unsubConversation()
    unsubConversation = subscribeToConversation(convId, {
      onNewMessage: (msg) => {
        if (localMessages.has(msg.content) || isStreaming) return
        messagesEl.querySelector('.chat-welcome')?.remove()
        const bubble = appendBubble(msg.role, msg.content)
        bubble.classList.add('chat-bubble-remote')
        localMessages.add(msg.content)
        const atBottom = messagesEl.scrollTop + messagesEl.clientHeight >= messagesEl.scrollHeight - 60
        if (atBottom) scrollToBottom()
      }
    })
  }

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto'
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px'
    sendBtn.disabled = !inputEl.value.trim() || isStreaming
  })

  // Send on Enter (Shift+Enter for newline)
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!sendBtn.disabled) handleSend()
    }
  })

  sendBtn.addEventListener('click', handleSend)

  // Speech input
  speechBtn.addEventListener('click', () => {
    if (speechEngine && speechEngine.isActive()) {
      speechEngine.stop()
      speechBtn.classList.remove('recording')
      return
    }

    speechEngine = createSpeechEngine({
      lang: 'nl-NL',
      onResult: (text) => {
        inputEl.value = text
        inputEl.dispatchEvent(new Event('input'))
      },
      onInterim: () => {
        inputEl.value = speechEngine.getFullDisplay()
        inputEl.dispatchEvent(new Event('input'))
      },
      onStatusChange: (status) => {
        if (status === 'listening') {
          speechBtn.classList.add('recording')
        } else {
          speechBtn.classList.remove('recording')
        }
      },
      onError: () => { speechBtn.classList.remove('recording') }
    })
    speechEngine.start()
  })

  async function handleSend() {
    const text = inputEl.value.trim()
    if (!text || isStreaming) return

    // Stop speech if active
    if (speechEngine && speechEngine.isActive()) {
      speechEngine.stop()
      speechBtn.classList.remove('recording')
    }

    // Remove welcome message
    messagesEl.querySelector('.chat-welcome')?.remove()

    // Show user bubble
    localMessages.add(text)
    appendBubble('user', text)

    // Clear input
    inputEl.value = ''
    inputEl.style.height = 'auto'
    sendBtn.disabled = true
    isStreaming = true

    // Create assistant bubble (will be filled by stream)
    const assistantBubble = appendBubble('assistant', '')
    const contentEl = assistantBubble.querySelector('.chat-bubble-content')
    contentEl.innerHTML = '<span class="chat-typing"><span></span><span></span><span></span></span>'

    let fullText = ''
    let firstChunk = true

    scrollToBottom()

    abortStream = sendChatMessage({
      ideaId: conversationId ? undefined : ideaId,
      conversationId,
      message: text,
      onChunk: (chunk) => {
        if (firstChunk) {
          contentEl.innerHTML = ''
          firstChunk = false
        }
        fullText += chunk
        contentEl.textContent = fullText
        scrollToBottom()
      },
      onConversationId: (id) => {
        conversationId = id
        startConversationSync(id)
      },
      onComplete: ({ conversationId: convId }) => {
        isStreaming = false
        abortStream = null
        sendBtn.disabled = !inputEl.value.trim()
        localMessages.add(fullText)
        // Render markdown-like formatting
        contentEl.innerHTML = formatMessage(fullText)
        scrollToBottom()
        // Auto-save conversation summary for sprint context
        if (convId) generateConversationSummary(convId).catch(() => {})
      },
      onError: (err) => {
        isStreaming = false
        abortStream = null
        sendBtn.disabled = !inputEl.value.trim()
        if (!fullText) {
          contentEl.innerHTML = `<span style="color:#C4314B;">Fout: ${err.message || 'Kon niet verbinden'}</span>`
        }
      }
    })
  }

  function appendBubble(role, content) {
    const bubble = document.createElement('div')
    bubble.className = `chat-bubble chat-${role}`
    bubble.innerHTML = `
      <div class="chat-bubble-content">${content ? formatMessage(content) : ''}</div>
    `
    messagesEl.appendChild(bubble)
    return bubble
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight
    })
  }

  // Return cleanup function
  return () => {
    if (unsubConversation) unsubConversation()
    if (abortStream) abortStream()
    if (speechEngine) speechEngine.stop()
  }
}

/**
 * Simple markdown-like formatting for chat messages.
 */
function formatMessage(text) {
  if (!text) return ''
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
