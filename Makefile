# LabRats.ai Development Makefile

.PHONY: clean install dev build help

# Default target
help:
	@echo "Available commands:"
	@echo "  make clean     - Remove node_modules, package-lock.json, and dist"
	@echo "  make install   - Install npm dependencies"
	@echo "  make dev       - Start development server"
	@echo "  make fresh     - Clean, install, and start dev (full reset)"
	@echo "  make build     - Build the application for production"

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
	@echo "✅ Dependencies installed"

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

# Full reset: clean, install, and start dev
fresh: clean install dev

# Clean and rebuild
rebuild: clean install build