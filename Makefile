# LabRats.ai Development Makefile

.PHONY: clean install dev build kill help

# Default target
help:
	@echo "Available commands:"
	@echo "  make clean     - Remove node_modules, package-lock.json, and dist"
	@echo "  make install   - Install npm dependencies and rebuild native modules"
	@echo "  make dev       - Start development server"
	@echo "  make kill      - Stop all running development processes"
	@echo "  make fresh     - Clean, install, and start dev (full reset)"
	@echo "  make build     - Build the application for production"
	@echo "  make rebuild   - Clean, install, and build (no dev server)"

# Clean all generated files and dependencies
clean:
	@echo "🧹 Cleaning up..."
	rm -rf node_modules
	rm -rf dist
	rm -rf .cache
	rm -f package-lock.json
	@echo "✅ Cleanup complete"

# Install dependencies
install:
	@echo "📦 Installing dependencies..."
	npm install
	@echo "🔨 Rebuilding native modules for Electron..."
	npx @electron/rebuild
	@echo "✅ Dependencies installed and native modules rebuilt"

# Start development server
dev:
	@echo "🔨 Building main process..."
	npm run build
	@echo "🚀 Starting development server..."
	npm run dev

# Build for production
build:
	@echo "🔨 Building for production..."
	npm run build

# Stop all running development processes
kill:
	@echo "🛑 Stopping all development processes..."
	@pkill -f "npm run dev" || true
	@pkill -f "electron" || true
	@pkill -f "webpack" || true
	@lsof -ti:3000 | xargs kill -9 2>/dev/null || true
	@echo "✅ All development processes stopped"

# Full reset: clean, install, and start dev
fresh: clean install dev

# Clean and rebuild
rebuild: clean install build