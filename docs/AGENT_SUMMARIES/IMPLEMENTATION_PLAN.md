# TanStack DB Integration Fix Plan

## Analysis Summary

Based on source code analysis of TanStack DB v0.1.0, we've identified several critical issues in our current implementation that are causing TypeScript errors and API mismatches.

### Key Findings from TanStack DB Source

1. **Write Function Interface**: The `write()` function expects `{ type: OperationType, value: T }` - it does NOT include keys
2. **Collection State**: Collections use `.state` property (returns `Map<TKey, T>`) instead of `.getSnapshot()`
3. **Collection API**: Methods like `.getPendingMutations()` don't exist in this version
4. **Delete Operations**: For deletes, we still pass the item `.value` (the original item being deleted)
5. **Type Resolution**: TanStack DB uses `ResolveType<TExplicit, TSchema, TFallback>` pattern

### Current Issues

1. **Wrong sync interface**: We're trying to pass `key` to `write()` function but it only accepts `{ type, value }`
2. **Missing Collection methods**: `.getSnapshot()` and `.getPendingMutations()` don't exist in v0.1.0
3. **Complex generics**: Type constraints are causing circular reference issues
4. **Type assertions**: Using `as any` to mask real API incompatibilities
5. **DOM types**: Missing DOM lib in tsconfig causing StorageEvent errors

## Implementation Plan

### Phase 1: Fix Sync Interface ✅ (Priority: High)

- [x] Add DOM lib to tsconfig.json for StorageEvent types
- [ ] Remove `key` from write calls - TanStack DB manages keys internally via `getKey`
- [ ] Use `collection.state` instead of `.getSnapshot()` - returns `Map<TKey, T>`  
- [ ] Remove `.getPendingMutations()` calls - not available in this version
- [ ] Fix delete handling - pass the original item being deleted as `value`
- [ ] Ensure write function only receives `{ type: OperationType, value: T }`

### Phase 2: Simplify Type System (Priority: High)

- [ ] Use TanStack DB's type resolution pattern - `ResolveType<TExplicit, TSchema, TFallback>`
- [ ] Simplify generic constraints - avoid complex `extends` chains
- [ ] Remove all type assertions (`as any`) - fix root causes instead
- [ ] Align with createCollection API - use same type parameters as TanStack DB
- [ ] Fix PassthroughCollectionConfig type constraint

### Phase 3: Collection Interface Fixes (Priority: Medium)

- [ ] Remove usage of non-existent methods
- [ ] Use proper Collection API - `.state`, `.toArray`, etc.
- [ ] Handle optimistic updates correctly or disable temporarily
- [ ] Ensure mutation handlers use correct types

### Phase 4: Simplify Optimistic Handling (Priority: High)

- [ ] Remove manual pending mutation tracking - rely on Triplit's outbox
- [ ] Simplify sync reconciliation - let Triplit handle race conditions  
- [ ] Use Triplit's built-in optimistic state management
- [ ] Consider using client.onEntitySyncSuccess/Error for fine-grained control

### Phase 5: Build and Test (Priority: Medium)

- [ ] Run type check - ensure no TypeScript errors
- [ ] Run build - verify compilation works  
- [ ] Test with simple integration example
- [ ] Verify all mutation operations work correctly

## Technical Details

### TanStack DB Sync Function Signature
```typescript
sync: (params: {
  collection: Collection<T, TKey, any, any, any>;
  begin: () => void;
  write: (message: Omit<ChangeMessage<T>, 'key'>) => void; // NO KEY!
  commit: () => void;
  markReady: () => void;
}) => void;
```

### ChangeMessage Type  
```typescript
interface ChangeMessage<T extends object = Record<string, unknown>, TKey extends string | number = string | number> {
  key: TKey;           // Managed by Collection internally
  value: T;            // What we pass to write()
  previousValue?: T;
  type: OperationType; // 'insert' | 'update' | 'delete' 
  metadata?: Record<string, unknown>;
}
```

### Correct Write Usage
```typescript
// For inserts/updates
write({ type: 'insert', value: item });
write({ type: 'update', value: item });

// For deletes - still pass the item being deleted
write({ type: 'delete', value: originalItem });
```

### Collection State Access
```typescript
// WRONG (doesn't exist)
const items = collection.getSnapshot();

// CORRECT  
const items = Array.from(collection.state.values());
const itemsMap = collection.state;
```

### Triplit Built-in Optimistic Handling

Triplit has its own sophisticated outbox system for handling optimistic mutations:

```typescript
// Triplit Client API for pending changes
client.clearPendingChangesForEntity(collection, id) // Clear specific entity
client.clearPendingChangesAll()                     // Clear all pending  
client.syncWrites()                                  // Manually sync pending

// Triplit handles optimistic state internally via:
// - EntityStoreWithOutbox for buffering mutations
// - SyncEngine for managing outbox sync  
// - CRDT-based conflict resolution
```

**Key Finding**: Instead of manually tracking pending mutations, we should leverage Triplit's built-in optimistic handling. Triplit's outbox automatically handles race conditions and optimistic state.

## Risk Assessment

- **Low Risk**: DOM types, write function interface fixes
- **Medium Risk**: Type system simplification  
- **High Risk**: Optimistic mutation handling (may need to disable temporarily)

## Success Criteria

1. ✅ No TypeScript compilation errors
2. ✅ Successful build with `npm run build`
3. ✅ All mutation operations (insert/update/delete) work correctly
4. ✅ Real-time sync between Triplit and TanStack DB
5. ✅ Proper type inference for collection items
