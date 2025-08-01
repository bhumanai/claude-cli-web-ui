# Claude CLI Web UI Frontend

A modern React TypeScript frontend for the Claude CLI Web Interface.

## Features

- 🎨 **Modern UI**: Clean, responsive design with Tailwind CSS
- 🌓 **Theme Support**: Dark/light mode with system preference detection
- 💬 **Real-time Communication**: WebSocket integration for live command execution
- 📝 **Command History**: Persistent command history with navigation
- 🔍 **Auto-complete**: Smart suggestions for common commands
- ⌨️ **Keyboard Shortcuts**: Arrow keys for history, Tab for completion
- 📱 **Responsive**: Works on desktop, tablet, and mobile devices
- 🎯 **TypeScript**: Full type safety and excellent developer experience

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Backend server running at `localhost:8000`

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:5173`.

### Build for Production

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Architecture

### Components

- **App**: Main application component with theme and WebSocket management
- **Header**: Navigation bar with connection status and theme toggle
- **Terminal**: Main terminal interface combining input and output
- **CommandInput**: Command input with auto-complete and history
- **OutputDisplay**: Formatted output display with syntax highlighting

### Hooks

- **useWebSocket**: WebSocket connection and message handling
- **useTheme**: Theme management with localStorage persistence
- **useCommandHistory**: Command history with localStorage persistence

### Services

- **WebSocketService**: WebSocket client with reconnection logic

### Key Features

#### Real-time Communication
- WebSocket connection to `ws://localhost:8000/ws/{session_id}`
- Automatic reconnection on connection loss
- Ping/pong heartbeat for connection health

#### Command History
- Persistent history stored in localStorage
- Navigation with arrow keys
- Duplicate command filtering
- Maximum 100 commands stored

#### Auto-complete
- Common command suggestions
- Tab completion
- Keyboard navigation through suggestions

#### Theme Management
- System preference detection
- Manual toggle between light/dark
- Persistent preference storage

## Development

### Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

### Code Quality

- **TypeScript**: Full type safety
- **ESLint**: Code quality and consistency
- **Tailwind CSS**: Utility-first styling
- **Modern React**: Hooks-based architecture

### Browser Support

- Chrome/Edge 88+
- Firefox 85+
- Safari 14+

## Configuration

### Environment Variables

The application uses these default endpoints:
- WebSocket: `ws://localhost:8000/ws/{session_id}`
- API: `http://localhost:8000/api/`

### Customization

#### Themes
Themes are configured in `tailwind.config.js` with custom color schemes:
- Terminal colors for code/output display
- Dark/light mode variants
- Accessible contrast ratios

#### Commands
Auto-complete suggestions can be customized in `CommandInput.tsx`:
```typescript
const commonCommands = [
  'help', 'clear', 'ls', 'pwd', 'cd', 'cat', 'echo', 'grep'
]
```

## Troubleshooting

### Connection Issues

1. **WebSocket connection fails**:
   - Ensure backend is running at `localhost:8000`
   - Check browser console for errors
   - Verify no firewall blocking connections

2. **Commands not executing**:
   - Check WebSocket connection status in header
   - Verify backend WebSocket endpoint is accessible
   - Review browser network tab for failed requests

### Performance Issues

1. **Slow rendering with large output**:
   - Command history is automatically limited
   - Use "Clear" button to reset terminal
   - Large outputs are truncated for display

2. **Memory usage**:
   - Command history limited to 100 entries
   - LocalStorage automatically cleaned
   - WebSocket connections properly closed on unmount

## Integration

### Backend Requirements

The frontend expects the backend to provide:

1. **WebSocket Endpoint**: `ws://localhost:8000/ws/{session_id}`
2. **Message Format**:
   ```json
   {
     "type": "command|output|error|status|ping|pong",
     "data": {...},
     "timestamp": "ISO-8601",
     "session_id": "string"
   }
   ```

3. **API Endpoints** (future):
   - `GET /api/sessions` - List sessions
   - `POST /api/sessions` - Create session
   - `GET /api/sessions/{id}` - Get session details

### Deployment

For production deployment:

1. Build the application: `npm run build`
2. Serve the `dist` folder with any static file server
3. Ensure WebSocket proxy configuration for `/ws` routes
4. Configure HTTPS for secure WebSocket connections (wss://)

Example nginx configuration:
```nginx
location /ws {
    proxy_pass http://backend:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```