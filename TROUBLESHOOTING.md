# Troubleshooting Guide

## Python 3.13 Compatibility Issues

### Problem
If you see errors like "pydantic-core build failed" or "ForwardRef._evaluate() missing argument", this is due to Python 3.13 compatibility issues with some packages.

### Solutions

#### Option 1: Use Pyenv to install Python 3.11
```bash
# Install pyenv (macOS)
brew install pyenv

# Install Python 3.11
pyenv install 3.11.9
pyenv local 3.11.9

# Verify version
python3 --version  # Should show 3.11.9

# Now run setup
./setup.sh
```

#### Option 2: Manual Backend Setup
If the automatic setup fails, try manual installation:

```bash
cd backend/

# Create virtual environment with specific Python version
python3.11 -m venv venv  # or python3 if 3.11 is default

# Activate environment
source venv/bin/activate

# Install compatible versions manually
pip install --upgrade pip
pip install "pydantic==2.5.3"
pip install "fastapi==0.104.1"
pip install "uvicorn[standard]==0.24.0"
pip install -r requirements.txt
```

#### Option 3: Use Docker (Alternative)
If Python issues persist, you can run the backend in Docker:

```bash
# Build Docker image
docker build -t claude-cli-backend backend/

# Run backend
docker run -p 8000:8000 claude-cli-backend
```

### Verification
After fixing Python issues, test that everything works:

```bash
cd backend/
source venv/bin/activate
python -c "import fastapi, pydantic; print('✅ Dependencies working')"
```

## Other Common Issues

### Port Already in Use
If you get "port already in use" errors:
```bash
# Kill processes on ports 8000 and 5173
lsof -ti:8000 | xargs kill -9
lsof -ti:5173 | xargs kill -9
```

### Node.js Issues
Make sure you have Node.js 18+ installed:
```bash
node --version  # Should be 18.0.0 or higher
npm --version   # Should be 8.0.0 or higher
```

### Permission Issues
If you get permission errors:
```bash
# Make scripts executable
chmod +x *.sh
chmod +x frontend/start.sh
chmod +x backend/start_server.py
```

## Getting Help

If issues persist:
1. Check the error logs in `logs/` directory
2. Verify your Python version with `python3 --version`
3. Try the manual setup steps above
4. Check that ports 8000 and 5173 are available