# Claude CLI Web UI - Quick Reference

## 🎯 Goal
Build a web UI for Claude CLI at `http://localhost:5173`

## 🏗️ Architecture
```
React Frontend ←→ FastAPI Backend ←→ Claude CLI
     (UI)         (WebSocket)       (Subprocess)
```

## 🛠️ Tech Stack
- **Backend**: Python + FastAPI + WebSockets
- **Frontend**: React + TypeScript + Tailwind CSS
- **Build**: Vite
- **Testing**: Pytest + Jest

## 📋 Key Features
1. **Command Input**: Auto-complete, history, syntax highlighting
2. **Real-time Output**: WebSocket streaming, syntax highlighting
3. **Sessions**: Multiple sessions, persistence, export
4. **UI/UX**: Dark/light mode, responsive, < 100ms response

## 🚀 Implementation Phases
1. **Week 1**: Backend foundation + WebSocket
2. **Week 2**: Frontend core + basic UI
3. **Week 3**: Enhanced features + polish
4. **Week 4**: Testing + documentation

## 📊 Success Metrics
- Start time: < 2 seconds
- Response time: < 100ms
- Memory: < 100MB
- UI: 60 FPS
- Sessions: 10+ concurrent

## 🔧 Quick Start Commands
```bash
# Launch web UI
claude web

# With auto-open browser
claude web --open

# Custom port
claude web --port 8080
```

## 📁 Project Structure
```
claude-web-ui/
├── backend/
│   ├── main.py         # FastAPI app
│   ├── commands.py     # CLI execution
│   ├── websocket.py    # Real-time streaming
│   └── sessions.py     # Session management
├── frontend/
│   ├── src/
│   │   ├── components/ # React components
│   │   ├── hooks/      # Custom hooks
│   │   └── utils/      # Helpers
│   └── public/
└── tests/
```

## 🎨 UI Components
1. **CommandInput**: Main command entry
2. **OutputDisplay**: Streaming results
3. **SessionManager**: Tab management
4. **ThemeToggle**: Dark/light mode
5. **HistoryPanel**: Command history

## 🔐 Security
- Local-only by default (127.0.0.1)
- Command sanitization
- Optional auth token
- Rate limiting

## 📈 Performance Targets
- First paint: < 500ms
- Time to interactive: < 1s
- Command execution: < 100ms
- WebSocket latency: < 50ms

## 🧪 Testing Checklist
- [ ] Unit tests (backend/frontend)
- [ ] WebSocket connection tests
- [ ] E2E tests with Playwright
- [ ] Load testing (10+ sessions)
- [ ] Accessibility audit

## 🚦 Ready to Start?
1. Review full specification
2. Set up development environment
3. Begin with Phase 1 (Backend)
4. Test early, test often