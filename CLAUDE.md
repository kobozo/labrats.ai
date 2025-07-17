# LabRats.AI - Claude Developer Notes

## Quick Commands

```bash
# Development
npm run dev              # Start development server
npm run build           # Build for production
npm run lint            # Run ESLint with auto-fix
npm run lint:check      # Run ESLint without auto-fix
npm run typecheck       # Run TypeScript type checking

# Testing
npm test                # Run tests (not configured yet)
```

## Important Architecture Notes

### Agent Decision System
The agent decision system has been enhanced with:
- **Conversation ID tracking**: Each conversation has a unique ID (`conv_[timestamp]_[random]`)
- **Agent persona initialization**: Full agent prompts are sent to the backend when agents join
- **Decision history**: Backend tracks last 10 decisions per agent per conversation
- **Loop detection**: Uses agent's recent messages and decision history to prevent repetition

### Single-Agent Mode
When the LabRats backend is offline:
- System automatically switches to single-agent mode with Switchy
- Switchy uses the full prompt from prompt-manager
- POV mode now properly shows Switchy and includes system prompt debug info
- Token tracking shows session totals instead of per-agent totals

### POV Mode
The POV (Point of View) mode allows viewing conversations from an agent's perspective:

**Multi-Agent Mode:**
- Shows only messages the agent has seen (personalMessageHistory)
- Shows agent's own messages on the right side
- Includes debug information: session ID, token usage, current action

**Single-Agent Mode (LangChain Debug View):**
- Shows the raw communication flow as chat bubbles
- Purple bubbles: System prompt sent to LangChain
- Blue bubbles: Raw user input sent
- Green bubbles: Raw AI response received
- No parsing or processing - exact I/O at LangChain level

### Backend Service
The LabRats backend (Ollama) is required for multi-agent chat:
- Located at `src/services/labrats-backend-service.ts`
- Uses agent-decision.prompt template with variable substitution
- Maintains conversation state with agent personas
- Automatically cleans up conversations older than 24 hours

## Common Issues and Solutions

### TypeScript "excessively deep" error
- Solution: Add `as any` to complex generic types (e.g., line 1946 in agent-message-bus.ts)

### ESLint v9 configuration
- Uses new flat config format in `eslint.config.js`
- Old `.eslintrc.json` format no longer supported

### Git Explorer PromptManager import
- Use `getPromptManager()` instead of `new PromptManager()`

## Project Structure

```
src/
├── config/
│   └── agents.ts           # Agent definitions
├── prompts/
│   ├── *.prompt            # Agent role prompts (no persona)
│   ├── *-persona.prompt    # Agent persona descriptions
│   └── agent-decision.prompt # Decision template
├── services/
│   ├── agent-message-bus.ts # Multi-agent orchestration
│   ├── labrats-backend-service.ts # Ollama backend
│   ├── prompt-manager.ts    # Prompt composition
│   ├── code-vectorization-*  # Code vectorization services
│   └── mcp/
│       └── tools/          # MCP code search tools
├── main/
│   ├── code-vectorization-service.ts # Main process vectorization
│   ├── code-parser-service.ts # Multi-language AST parsing
│   ├── vector-storage-service.ts # LanceDB vector storage
│   └── mcp/
│       └── tools/          # Main process MCP handlers
└── renderer/
    └── components/
        └── Chat.tsx        # Main chat interface
```

## Recent Changes

1. **Conversation tracking**: Added unique conversation IDs for better agent context
2. **Persona initialization**: Backend now receives full agent prompts on initialization
3. **POV mode fixes**: Single-agent mode now properly shows in POV dropdown
4. **System prompt debugging**: POV mode shows system prompt in single-agent mode
5. **Development tools**: Added lint and typecheck npm scripts with ESLint setup
6. **Code Vectorization**: Added semantic code search and exploration tools
   - See `docs/CODE_VECTORIZATION_TOOLS.md` for AI agent usage
   - MCP tools: `search_code`, `find_similar_code`, `explore_codebase`, `code_vectorization_status`
   - Dashboard integration: New "Code Vectors" tab shows vectorization stats, progress, and file/element distributions

## Testing Checklist

- [ ] Multi-agent chat with backend online
- [ ] Single-agent fallback when backend offline
- [ ] POV mode shows correct agent perspective
- [ ] Token tracking per agent (multi) and session (single)
- [ ] Agent decisions are contextual, not random
- [ ] Loop detection prevents repetitive responses