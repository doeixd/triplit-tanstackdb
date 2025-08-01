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

## Core Implementation Details

### TanStack DB Collection API
- **Collection State**: Use `collection.state` (returns `Map<TKey, T>`) to access current items
- **State Access**: `Array.from(collection.state.values())` to get items array
- **Write Operations**: 
  - Delete: `write({ type: 'delete', value: originalItem })`
  - Update: `write({ type: 'update', value: updatedItem })`
  - Insert: `write({ type: 'insert', value: newItem })`

### Sync Flow Architecture
1. **Initial Fetch**: `client.fetch(query)` for fast initial load
2. **Real-time Subscription**: `client.subscribe(query, callback, errorCallback)`
3. **Reconciliation Logic**: Compare local vs remote items using `getKey()` function
4. **Conflict Resolution**: Triplit handles optimistic mutations via outbox system

### Error Handling Patterns
- **Network Failures**: Graceful fallback from fetch to subscription-only
- **Mutation Errors**: Always re-throw to trigger TanStack DB rollback
- **Subscription Errors**: Log and call `onError` callback, continue operation
- **Malformed Data**: Handle null/undefined gracefully with safe defaults

## Dependencies & Compatibility

### Core Dependencies
```json
"@tanstack/db": "^0.1.0"     // Collection and query engine
"@triplit/client": "^1.0.50" // Real-time sync client
```

### Known Dependency Issues
- **@triplit/db type errors**: External dependency has missing type modules (`@triplit/types/*`)
- **Impact**: None on functionality, only shows warnings during build
- **Status**: Upstream issue, can be ignored safely

### Version Compatibility
- **Node.js**: >=16 (specified in package.json engines)
- **TypeScript**: ^5.7.2 (development dependency)
- **TanStack DB**: Currently targets v0.1.0 API

## Testing Patterns

### Mock Structure for TanStack DB Collections
```javascript
// Correct mock pattern
collection: {
  state: new Map(), // For empty collections  
  state: new Map(items.map(item => [getKey(item), item])) // With data
}

// ❌ Don't use (legacy pattern):
collection: {
  getSnapshot: vi.fn(() => []),
  getPendingMutations: vi.fn(() => [])
}
```

### Test Categories
- **Unit Tests**: `test/options.test.ts`, `test/index.test.ts` 
- **Integration Tests**: `test/integration.test.ts`
- **Edge Cases**: `test/edge-cases.test.ts` (null data, race conditions, large datasets)
- **Type Safety**: `test/types.test.ts` (compile-time type checking)

### Test Utilities
- **Vitest**: Primary test runner with mocking capabilities
- **Mock Patterns**: Consistent client mocking across all test files
- **Async Testing**: Proper `await` patterns for subscription callbacks

## Code Style
- **Imports**: Use type-only imports for types (`import type { ... }`)
- **Exports**: Export interfaces and factory functions with full JSDoc documentation
- **Types**: Strict TypeScript with generics for Models, Queries, and Items
- **Naming**: PascalCase for types/interfaces, camelCase for variables/functions
- **Error Handling**: Always re-throw errors in mutation handlers for automatic rollback
- **Comments**: Comprehensive JSDoc with examples and parameter descriptions
- **Target**: ES2018 with ESNext modules, strict mode enabled

## Build & Distribution

### Pridepack Configuration
- **Outputs**: ESM + CommonJS, Development + Production builds
- **Type Declarations**: Generated in `dist/types/`
- **Source Maps**: Included for development builds
- **Bundle Sizes**: ~1.4KB production ESM, ~1.8KB production CJS

### Package Configuration  
- **Main**: `./dist/cjs/production/index.js`
- **Module**: `./dist/esm/production/index.js`
- **Types**: `./dist/types/index.d.ts`
- **Exports**: Conditional exports for dev/prod and ESM/CJS

## Performance Considerations

### Memory Management
- **Large Datasets**: Tested with 10k+ items, handles efficiently
- **Subscription Cleanup**: Always return cleanup function from sync handlers
- **Map Operations**: Use Set for key lookups, avoid O(n) array operations

### Real-time Performance
- **Differential Updates**: Only reconcile changed items
- **Optimistic Updates**: Immediate UI updates, server confirmation async
- **Offline Capability**: Full offline support via Triplit's IndexedDB storage

## Development Workflow

### Adding New Features
1. Add types to interfaces in `src/index.ts` or `src/options.ts`
2. Update factory function and adapter logic
3. Add comprehensive tests covering happy path + edge cases
4. Update JSDoc documentation with examples
5. Run full test suite and build verification

### Debugging Common Issues
- **State Access Errors**: Ensure using `collection.state.values()` not `getSnapshot()`
- **Test Failures**: Check mock structure matches actual TanStack DB API
- **Type Errors**: May be external dependency warnings (can ignore if build succeeds)
- **Subscription Issues**: Verify cleanup functions are properly returned

### Documentation Updates
- **README.md**: User-facing documentation with installation and examples
- **AGENT.md**: This file - technical implementation details
- **JSDoc**: Inline code documentation for API reference
- **AGENT_SUMMARIES**: After any big change / or adventure / thread etc. they should create a doc in the docs/AGENT_SUMMARIES folder
