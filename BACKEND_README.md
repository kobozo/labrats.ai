# LabRats.ai Backend Setup

This document explains how to set up and use the LabRats.ai backend for efficient agent decision-making.

## Overview

The LabRats.ai backend uses a two-tier AI system:
1. **Local Decision Layer**: Ollama with Mistral for fast yes/no decisions about agent responses
2. **External AI Layer**: OpenAI/Anthropic for actual agent responses (only when local AI says "yes")

This approach reduces external API calls by 60-80% while maintaining intelligent conversation flow.

## Quick Start

### 1. Start the Backend

```bash
# Start Ollama backend with Mistral model
docker-compose up -d

# Check if everything is running
docker-compose ps

# View logs
docker-compose logs -f labrats-backend
```

### 2. Verify Setup

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Test the Mistral model
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mistral",
    "prompt": "Should I respond to this message? Answer only YES or NO.",
    "stream": false
  }'
```

### 3. Configuration

The backend is configured in your LabRats config file (`~/.labrats/config.yaml`):

```yaml
backend:
  enabled: true
  labrats_llm:
    endpoint: "http://localhost:11434"
    model: "mistral"
    timeout: 30000
```

## How It Works

1. **Agent Decision Process**:
   - User sends message to agent bus
   - Each agent checks if they should respond
   - **First**: Query local Ollama backend (fast, cheap)
   - **If YES**: Make external API call for actual response
   - **If NO**: Skip external API call entirely

2. **Fallback Behavior**:
   - If local backend is unavailable → Falls back to external AI for decisions
   - If external AI fails → Agent doesn't respond
   - System is designed to be resilient

## Performance Benefits

- **Reduced API Costs**: 60-80% fewer external API calls
- **Faster Decisions**: Local AI responds in ~100ms vs ~1000ms external
- **Better Rate Limiting**: Fewer 429 errors from external providers
- **Maintained Quality**: Complex responses still use high-quality external AI

## Troubleshooting

### Backend Not Starting
```bash
# Check Docker status
docker-compose ps

# View detailed logs
docker-compose logs labrats-backend

# Restart services
docker-compose restart
```

### Model Not Found
```bash
# Manually pull Mistral model
docker-compose exec labrats-backend ollama pull mistral

# List available models
docker-compose exec labrats-backend ollama list
```

### Connection Issues
```bash
# Test connection
curl -f http://localhost:11434/api/tags

# Check if port is blocked
netstat -an | grep 11434
```

## Alternative Models

You can use different models by updating the config:

```yaml
backend:
  labrats_llm:
    model: "llama2"  # or "codellama", "phi", etc.
```

Then pull the new model:
```bash
docker-compose exec labrats-backend ollama pull llama2
```

## Development

### Manual Setup (without Docker)

1. Install Ollama: https://ollama.ai/download
2. Pull Mistral: `ollama pull mistral`
3. Start server: `ollama serve`
4. Configure endpoint in LabRats config

### Logs and Debugging

The LabRats application logs show decision-making:
```
[AGENT-BUS] Using local LabRats backend for cortex decision
[AGENT-BUS] Agent cortex local decision: true (YES)
[AGENT-BUS] Using external AI for cortex decision (local backend not available)
```

## System Requirements

- **CPU**: 2+ cores recommended
- **RAM**: 4GB minimum for Mistral model
- **Storage**: 4GB for model files
- **Network**: Internet for initial model download

## Production Considerations

- Use Docker volumes for persistent model storage
- Monitor resource usage with `docker stats`
- Consider using GPU-enabled Ollama for faster inference
- Set up proper logging and monitoring
- Use environment variables for configuration