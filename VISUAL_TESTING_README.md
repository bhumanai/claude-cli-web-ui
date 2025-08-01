# Bulletproof LLM-Based Visual Software Testing Framework

A comprehensive visual testing framework using Claude Code CLI, Playwright, and intelligent subagents for human-like UI testing.

## Quick Start

### Prerequisites
- Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
- Python 3.8+
- Playwright: `pip install playwright && playwright install`
- FFmpeg (for video replay generation)

### Initialize Workspace
```bash
# Initialize Claude Code workspace
claude code init

# Verify agents and commands are available
claude code /help
```

### Run Your First Test
```bash
# Start a checkout flow test with power user persona
/test-start --flow=checkout_flow --persona=power_user --url=https://example.com/cart

# Audit the completed test path
/test-audit --path=checkout_flow_p1

# Generate video replay
/test-replay --path=checkout_flow_p1 --speed=2.0

# Get UX optimization recommendations
/test-optimize --path=checkout_flow_p1 --focus=forms
```

## Framework Architecture

### Agent Chain Flow
1. **flow-generator** → Enumerate all user paths
2. **dom-stabilizer** → Ensure page stability
3. **test-executor** → Execute human-like interactions (loops with dom-stabilizer)
4. **verifier** → Compare against expected checkpoints
5. **assertion-checker** → Run boolean assertions
6. **ux-reflector** → Analyze UX friction and generate recommendations
7. **infra-watchdog** → Handle errors and recovery

### Directory Structure
```
.claude/
├── commands/           # Slash commands (/test-start, /test-audit, etc.)
└── agents/            # Subagent definitions

scripts/
└── test_runner.py     # Orchestration script

artifacts/
├── paths/             # Test execution artifacts
│   └── {path_id}/
│       ├── screenshots/
│       ├── logs/
│       └── reports/
└── archive/           # Archived old artifacts
```

### Key Features

#### 🔍 **Evidence-Based Testing**
- All decisions based on screenshots and DOM snapshots
- No backend peeking or hallucination
- Complete visual audit trail

#### 🔄 **Bulletproof Error Handling** 
- Automatic retry with exponential backoff
- infra-watchdog monitors for failures
- Graceful degradation and recovery

#### 👥 **Persona-Driven Interactions**
- Configurable user personas (beginner, expert, business user)
- Human-like interaction patterns
- Realistic timing and behavior

#### 📊 **Comprehensive Reporting**
- UX friction analysis
- Performance metrics
- Video replay generation
- Actionable improvement recommendations

## Available Commands

| Command | Description | Arguments |
|---------|-------------|-----------|
| `/test-start` | Start bulletproof visual test flow | `--flow=<id> --persona=<id> --url=<url>` |
| `/test-audit` | Audit completed test path | `--path=<path_id>` |
| `/test-replay` | Generate video trace replay | `--path=<path_id> [--speed=<float>] [--format=<format>]` |
| `/test-optimize` | Analyze UX friction and optimize | `--path=<path_id> [--focus=<area>]` |
| `/test-regenerate` | Regenerate failed test path | `--path=<path_id> [--retry-count=<num>] [--debug]` |
| `/test-purge` | Clean up old artifacts | `--before=<YYYY-MM-DD> [--dry-run] [--archive]` |

## Configuration

### Personas
Edit `flow_catalog.json` to define custom personas:

```json
{
  "personas": {
    "custom_user": {
      "name": "Custom User",
      "goals": ["specific goals"],
      "technical_level": "beginner|intermediate|expert",
      "preferences": ["interaction preferences"],
      "pain_points": ["common frustrations"]
    }
  }
}
```

### Test Flows
Define expected checkpoints and assertions:

```json
{
  "flows": {
    "custom_flow": {
      "description": "Flow description",
      "expected_checkpoints": [
        {
          "step_index": 1,
          "type": "dom_element|text_content|url_pattern",
          "selector": "CSS selector",
          "expected_value": "expected content"
        }
      ],
      "assertions": [
        {
          "id": "unique_id",
          "type": "element_exists|text_contains|url_matches|element_count",
          "selector": "CSS selector",
          "expected": "expected value",
          "description": "What this assertion validates"
        }
      ]
    }
  }
}
```

## Troubleshooting

### Common Issues
- **Agent Chain Fails**: Check infra-watchdog logs for error details
- **Screenshots Missing**: Ensure Playwright is properly installed
- **Video Generation Fails**: Install FFmpeg

### Support
- Review execution logs in `artifacts/test_runner.log`
- Check individual agent output files
- Use `/test-audit` to verify test completion
- Enable debug mode for detailed tracing