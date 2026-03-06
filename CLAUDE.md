# PPM Ideeën

Standalone app voor ideeën management, sprint planning, Claude Code terminal en development workflow.

## Tech Stack
- Vite + Vanilla JS (geen React)
- Supabase Auth + Realtime + REST
- Vercel auto-deploy via GitHub push

## Structuur
```
src/
  main.js           → authGuard → initApp
  app.js            → Router, sidebar, view switching
  lib/              → Shared libs (synced via sync-shared.sh)
  views/            → View modules (lazy loaded)
  services/         → Supabase data layer
  components/       → Reusable components (idea-capture, chat-panel, driving-mode)
  utils/            → Formatters
styles/
  tokens.css        → Shared design tokens
  feedback.css      → Shared feedback widget
  app.css           → App-specifieke styles
```

## Shared Files (NIET handmatig wijzigen)
Deze bestanden worden gesynchroniseerd met andere PPM repos via `sync-shared.sh`:
- `src/lib/ui.js` — topbar, sidebar, dark mode
- `src/lib/auth.js` — login/logout/sessie
- `src/lib/supabase.js` — Supabase client
- `src/lib/feedback.js` — feedback widget
- `src/lib/analytics.js` — page view tracking
- `styles/tokens.css` — CSS design tokens
- `styles/feedback.css` — feedback widget CSS

## Sprint-Synced Files (gesynchroniseerd met ppm-admin-dashboard)
- `src/views/sprints.js`, `sprint-detail.js`, `code.js`
- `src/services/sprints-service.js`, `tasks-service.js`
- `src/lib/realtime.js`
- `src/utils/format.js`

## Ideeën-Synced Files (gesynchroniseerd met ppm-admin-dashboard)
- `src/views/ideeen.js`, `idee-detail.js`
- `src/services/idea-service.js`, `idea-ai-service.js`
- `src/components/idea-capture.js`, `chat-panel.js`, `driving-mode.js`

## App-Eigen Files (NIET syncen)
- `src/app.js` — eigen router/sidebar
- `src/views/dashboard.js` — ideeën-specifiek dashboard
- `src/services/data.js` — subset van admin
- `styles/app.css` — eigen styling

## Supabase
- Project: `evtgzkdpixwugevchdii` (eu-central-1)
- Tabellen: idea_captures, idea_conversations, conversation_messages, sprints, tasks, task_todos, task_comments, sprint_executions, sprint_execution_events, sprint_execution_messages
- Storage: idea-attachments, feedback-attachments
- Edge functions: sprint-plan, idea-analyze, idea-chat

## Commands
```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run preview  # Preview build
```

## Design System
Volg Apple HIG principes. Gebruik tokens uit `styles/tokens.css`.
Dark mode via `.ideeen-dashboard.dark-mode` selectors.
