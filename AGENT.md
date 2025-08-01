# AGENT.md - Development Guide

## Commands
- **Build**: `npm run build` (uses pridepack)
- **Type Check**: `npm run type-check` (uses pridepack)
- **Test**: `npm test` (uses vitest)
- **Dev/Watch**: `npm run dev` or `npm run watch`
- **Clean**: `npm run clean`

## Architecture
- **Main Library**: TanStack DB collection adapter for Triplit real-time sync engine
- **Core Files**: `src/index.ts` (factory function), `src/options.ts` (adapter logic)
- **Dependencies**: `@tanstack/db`, `@triplit/client` 
- **Build System**: Pridepack (TypeScript library bundler)
- **Test Framework**: Vitest

## Code Style
- **Imports**: Use type-only imports for types (`import type { ... }`)
- **Exports**: Export interfaces and factory functions with full JSDoc documentation
- **Types**: Strict TypeScript with generics for Models, Queries, and Items
- **Naming**: PascalCase for types/interfaces, camelCase for variables/functions
- **Error Handling**: Always re-throw errors in mutation handlers for automatic rollback
- **Comments**: Comprehensive JSDoc with examples and parameter descriptions
- **Target**: ES2018 with ESNext modules, strict mode enabled
