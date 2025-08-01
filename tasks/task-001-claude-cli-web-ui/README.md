# Claude CLI Web UI

A beautiful, fast web interface for the Claude CLI with real-time command execution and modern design.

## 🚀 Quick Start

```bash
# One command to launch everything
./start.sh
```

Then open http://localhost:5173 in your browser.

## ✨ Features

- **Real-time Command Execution** - Execute Claude CLI commands with live output
- **WebSocket Communication** - Instant updates and streaming responses  
- **Command History** - Navigate previous commands with arrow keys
- **Session Management** - Persistent sessions across browser refreshes
- **Modern UI** - Dark/light themes with responsive mobile design
- **Type Safety** - Full TypeScript implementation
- **Production Ready** - Complete deployment automation

## 🛠️ System Requirements

- Python 3.8+
- Node.js 18+
- npm 8+

## 📋 Available Scripts

| Script | Purpose |
|--------|---------|
| `./start.sh` | Launch both backend and frontend servers |
| `./setup.sh` | Install dependencies and set up environment |
| `./test.sh` | Run comprehensive integration tests |

## 🏗️ Architecture

- **Backend**: FastAPI with WebSocket support (Port 8000)
- **Frontend**: React + TypeScript + Tailwind CSS (Port 5173)
- **Communication**: Real-time WebSocket connection
- **Build Tools**: Vite for frontend, Uvicorn for backend

## 📖 Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md) - Complete deployment guide
- [specification.md](specification.md) - Technical specification
- [task.md](task.md) - Development progress and notes

## 🔧 Development

```bash
# Setup dependencies
./setup.sh

# Start development servers
./start.sh

# Run tests
./test.sh
```

## 🌐 Access Points

- **Web UI**: http://localhost:5173
- **Backend API**: http://localhost:8000  
- **API Documentation**: http://localhost:8000/docs

---

**Status**: ✅ Production Ready  
**Version**: 1.0  
**Last Updated**: January 30, 2025