"""Vercel serverless function handler for FastAPI backend."""

import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vercel_backend import app

# Export the FastAPI app for Vercel
handler = app