import {
  createCollection,
  Collection,
  StandardSchema,
  CollectionConfig,
} from '@tanstack/db';
import {
  TriplitClient,
  SchemaQuery,
  Models,
  TriplitError,
} from '@triplit/client';
import { createTriplitCollectionOptions } from './options';

/**
 * A utility type to allow passthrough of any standard `CollectionConfig` properties
 * that are not handled by our adapter. This provides maximum flexibility.
 * @internal
 */
type PassthroughCollectionConfig<TItem> = Omit<
  CollectionConfig<TItem>,
  'getKey' | 'sync' | 'onInsert' | 'onUpdate' | 'onDelete'
>;

/**
 * Configuration options for the `createTriplitCollection` factory function.
 * This combines the essential Triplit configuration with all standard, passthrough
 * options from TanStack DB's `CollectionConfig`.
 */
export interface TriplitCollectionFactoryOptions<
  M extends Models<M>,
  TQuery extends SchemaQuery<M>,
  TItem extends TQuery['_output'] = TQuery['_output']
> extends PassthroughCollectionConfig<TItem> {
  /**
   * An instance of the configured TriplitClient. This client should be
   * initialized and managed at a higher level in your application.
   */
  client: TriplitClient<M>;

  /**
   * The Triplit query that defines the set of data to be synced into this collection.
   * This acts as the "source of truth" for the collection's contents.
   *
   * @example client.query('todos').where('completed', '=', false)
   */
  query: TQuery;

  /**
   * A function that returns a unique, stable key (ID) for a given item. This is
   * mandatory for TanStack DB to track individual entities for updates and deletes.
   */
  getKey: (item: TItem) => string | number;

  /**
   * An optional, but highly recommended, unique identifier for this collection.
   * This ID is used in developer tools and for debugging, making it an essential
   * part of a scalable application.
   */
  id?: string;

  /**
   * An optional schema (e.g., from Zod or TypeBox). This is a powerhouse feature.
   * Providing a schema enables full, end-to-end type safety for all mutations.
   * For example, `collection.update(id, data)` will type-check the `data` payload
   * against your schema, preventing runtime errors.
   */
  schema?: StandardSchema<TItem>;

  /**
   * An optional callback to handle errors that occur during the real-time subscription
   * or during mutation operations. Useful for global error logging or displaying toasts.
   * @param error - The error received from the Triplit client.
   */
  onError?: (error: TriplitError | Error) => void;
}

/**
 * Creates a new TanStack DB Collection that is kept in sync with a Triplit real-time query.
 *
 * This factory function is the primary, high-level API for integrating Triplit with TanStack DB.
 * It provides a streamlined, one-step process for creating fully reactive, offline-first,
 * and optimistically updated collections powered by a Triplit backend.
 *
 * @param options - The configuration options for the Triplit-powered collection.
 * @returns An instance of a TanStack DB `Collection`, ready to be used with `useLiveQuery`.
 *
 * @example
 * // In your collections file:
 * import { createTriplitCollection } from '@tanstack/triplit-collection';
 * import { client } from './my-triplit-client';
 * import { zodTodoSchema } from './schemas';
 *
 * export const activeTodosCollection = createTriplitCollection({
 *   // --- Triplit-specific options ---
 *   client,
 *   query: client.query('todos').where('completed', '=', false),
 *
 *   // --- Mandatory TanStack DB option ---
 *   getKey: (todo) => todo.id,
 *
 *   // --- Recommended TanStack DB options for a great DX ---
 *   id: 'activeTodos',
 *   schema: zodTodoSchema,
 *
 *   // --- Adapter-specific options ---
 *   onError: (err) => showToast(`Sync Error: ${err.message}`),
 *
 *   // --- Passthrough standard CollectionConfig options ---
 *   rowUpdateMode: 'full',
 * });
 */
export function createTriplitCollection<
  M extends Models<M>,
  TQuery extends SchemaQuery<M>,
  TItem extends TQuery['_output'] = TQuery['_output']
>(
  options: TriplitCollectionFactoryOptions<M, TQuery, TItem>
): Collection<TItem> {
  const {
    client,
    query,
    getKey,
    onError,
    // Capture all other standard options into a 'rest' object.
    ...restConfig
  } = options;

  // 1. Generate the core sync and mutation handlers using our lower-level adapter.
  const triplitAdapterOptions = createTriplitCollectionOptions<M, TQuery, TItem>(
    {
      client,
      query,
      getKey,
      onError,
    }
  );

  // 2. Create and return the final TanStack DB Collection, combining the adapter's
  //    logic with all the standard configuration properties passed in by the user.
  return createCollection<TItem>({
    ...restConfig, // Spread passthrough options first (id, schema, rowUpdateMode, etc.)
    ...triplitAdapterOptions, // Then spread our adapter's core logic.
  });
}