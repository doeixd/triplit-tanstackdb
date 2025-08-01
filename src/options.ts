import type {
  CollectionConfig,
  
  SyncConfig,
  InsertMutationFn,
  UpdateMutationFn,
  DeleteMutationFn,
} from '@tanstack/db';
import {
  TriplitClient,
  SchemaQuery,
  TriplitError,
  FetchResult,
  Models,
} from '@triplit/client';

/**
 * The internal configuration required by the low-level Triplit collection adapter.
 * @internal
 */
export interface TriplitCollectionOptions<
  M extends Models<M>,
  TQuery extends SchemaQuery<M>,
  TItem extends object = TQuery extends { _output: infer O extends object } ? O : never
> {
  client: TriplitClient<M>;
  query: TQuery;
  getKey: (item: TItem) => string | number;
  onError?: (error: TriplitError | Error) => void;
}

/**
 * Creates the core `CollectionConfig` object with sync and mutation handlers
 * for a Triplit-powered collection. This is the low-level primitive.
 * @internal
 */
export function createTriplitCollectionOptions<
  M extends Models<M>,
  TQuery extends SchemaQuery<M>,
  TItem extends object = TQuery extends { _output: infer O extends object } ? O : never
>(
  options: TriplitCollectionOptions<M, TQuery, TItem>
): CollectionConfig<TItem> {
  const { client, query, getKey, onError } = options;
  const collectionName = query.collectionName as string & keyof M;

  // Note: Triplit handles optimistic mutations internally via its outbox system
  // We don't need to manually track pending mutations

  const syncFn: SyncConfig<TItem>['sync'] = (params) => {
    const { begin, write, commit, markReady, collection } = params;

    let isReady = false;
    let unsubscribeFromTriplit: (() => void) | undefined;

    const reconcileSnapshot = (results: FetchResult<M, TQuery, 'many'>) => {
      begin();
      const localItems = Array.from(collection.state.values());
      const localKeys = new Set(localItems.map(getKey));
      const remoteItems = results ? Array.from(results.values()) as TItem[] : [];
      const remoteKeys = new Set(remoteItems.map(getKey));

      // Handle Deletes:
      // Triplit's outbox system automatically handles optimistic mutations and race conditions
      // We can safely delete items that exist locally but not in the remote snapshot
      for (const key of localKeys) {
        if (!remoteKeys.has(key)) {
          // Find the original item being deleted
          const originalItem = localItems.find((item: TItem) => getKey(item) === key);
          if (originalItem) {
            write({ type: 'delete', value: originalItem });
          }
        }
      }

      // Handle Inserts & Updates:
      for (const typedItem of remoteItems) {
        const key = getKey(typedItem);
        if (localKeys.has(key)) {
          write({ type: 'update', value: typedItem });
        } else {
          write({ type: 'insert', value: typedItem });
        }
      }
      commit();
    };
    
    // To improve initial load speed, we perform a one-time fetch.
    // This populates the UI quickly while the real-time subscription connects.
    client.fetch(query)
      .then((initialResults) => {
        if (isReady) return; // The subscription already delivered data faster.
        reconcileSnapshot(initialResults);
        markReady();
        isReady = true;
      })
      .catch((err) => {
        // If the initial fetch fails, log the error and rely on the
        // subscription to eventually connect and provide data.
        console.error('[Triplit Adapter] Initial fetch failed, waiting for subscription.', err);
        onError?.(err as Error);
      });

    // Subscribe to the Triplit query for long-term, real-time updates.
    unsubscribeFromTriplit = client.subscribe(
      query,
      (results) => {
        // This reconciliation logic assumes Triplit's subscribe callback provides a full snapshot.
        reconcileSnapshot(results as FetchResult<M, TQuery, 'many'>);
        if (!isReady) {
          markReady();
          isReady = true;
        }
      },
      (error) => {
        console.error('[Triplit Adapter] Subscription error:', error);
        onError?.(error as Error);
      }
    );

    // Return the cleanup function.
    return () => {
      unsubscribeFromTriplit?.();
    };
  };

  const onInsert: InsertMutationFn<TItem> = async ({ transaction }) => {
    // Triplit handles optimistic mutations automatically via its outbox system
    try {
      for (const mutation of transaction.mutations) {
        await client.insert(collectionName, mutation.modified as any);
      }
    } catch (error) {
      onError?.(error as Error);
      // Re-throwing the error is critical for TanStack DB's automatic optimistic rollback.
      throw error;
    }
  };

  const onUpdate: UpdateMutationFn<TItem> = async ({ transaction }) => {
    // Triplit handles optimistic mutations automatically via its outbox system
    try {
      for (const mutation of transaction.mutations) {
        await client.update(
          collectionName,
          String(mutation.key),
          mutation.changes as any
        );
      }
    } catch (error) {
      onError?.(error as Error);
      throw error;
    }
  };

  const onDelete: DeleteMutationFn<TItem> = async ({ transaction }) => {
    // Triplit handles optimistic mutations automatically via its outbox system
    try {
      for (const mutation of transaction.mutations) {
        await client.delete(collectionName, String(mutation.key));
      }
    } catch (error) {
      onError?.(error as Error);
      throw error;
    }
  };

  return {
    getKey,
    sync: { sync: syncFn },
    onInsert,
    onUpdate,
    onDelete,
  };
}