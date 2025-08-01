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
  TItem extends TQuery['_output']
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
  TItem extends TQuery['_output']
>(
  options: TriplitCollectionOptions<M, TQuery, TItem>
): CollectionConfig<TItem> {
  const { client, query, getKey, onError } = options;
  const collectionName = query.collectionName as string & keyof M;

  const syncFn: SyncConfig<TItem>['sync'] = (params) => {
    const { begin, write, commit, markReady, collection } = params;

    let isReady = false;
    let unsubscribeFromTriplit: (() => void) | undefined;

    const reconcileSnapshot = (results: FetchResult<M, TQuery, 'many'>) => {
      begin();
      const localItems = collection.getSnapshot();
      const localKeys = new Set(localItems.map(getKey));
      const remoteItems = Array.from(results.values()) as TItem[];
      const remoteKeys = new Set(remoteItems.map(getKey));

      // This is the critical fix for the optimistic update race condition.
      // We get the keys of all items that are currently part of a pending,
      // optimistic mutation that hasn't been confirmed by the server yet.
      const pendingMutationKeys = new Set(
        collection.getPendingMutations().flatMap((tx) => tx.mutations.map((m) => m.key))
      );

      // Handle Deletes:
      // An item should be deleted if it exists locally but not in the new remote snapshot,
      // UNLESS that item is part of a pending optimistic mutation. This prevents the UI
      // from flickering when a subscription snapshot arrives before the mutation is fully synced.
      for (const key of localKeys) {
        if (!remoteKeys.has(key) && !pendingMutationKeys.has(key)) {
          write({ type: 'delete', key });
        }
      }

      // Handle Inserts & Updates:
      for (const typedItem of remoteItems) {
        const key = getKey(typedItem);
        if (localKeys.has(key)) {
          write({ type: 'update', key, value: typedItem });
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
    try {
      for (const mutation of transaction.mutations) {
        await client.insert(collectionName, mutation.modified);
      }
    } catch (error) {
      onError?.(error as Error);
      // Re-throwing the error is critical for TanStack DB's automatic optimistic rollback.
      throw error;
    }
  };

  const onUpdate: UpdateMutationFn<TItem> = async ({ transaction }) => {
    try {
      for (const mutation of transaction.mutations) {
        await client.update(
          collectionName,
          String(mutation.key),
          mutation.changes
        );
      }
    } catch (error) {
      onError?.(error as Error);
      throw error;
    }
  };

  const onDelete: DeleteMutationFn<TItem> = async ({ transaction }) => {
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