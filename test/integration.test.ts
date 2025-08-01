import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTriplitCollection } from '../src/index';
import { createTriplitCollectionOptions } from '../src/options';
import type { TriplitClient, SchemaQuery, Models } from '@triplit/client';

// Mock TanStack DB's createCollection
vi.mock('@tanstack/db', () => ({
  createCollection: vi.fn(),
}));

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  userId: string;
}

type TodoModels = {
  todos: TodoItem;
};

describe('Integration Tests', () => {
  let mockClient: any;
  let mockQuery: SchemaQuery<TodoModels>;
  let getKey: (item: TodoItem) => string;
  let onError: ReturnType<typeof vi.fn>;
  let mockCreateCollection: any;

  beforeEach(async () => {
    const { createCollection } = await import('@tanstack/db');
    mockCreateCollection = createCollection as any;
    
    mockClient = {
      fetch: vi.fn(),
      subscribe: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    
    mockQuery = {
      collectionName: 'todos',
      _output: {} as TodoItem,
    } as SchemaQuery<TodoModels>;
    
    getKey = (item: TodoItem) => item.id;
    onError = vi.fn();

    mockCreateCollection.mockReturnValue({
      _type: 'MockCollection',
      id: 'test-todos',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Full factory integration', () => {
    it('should create a fully functional collection with real-world configuration', () => {
      const schema = {
        parse: vi.fn((data) => data),
        safeParse: vi.fn((data) => ({ success: true, data })),
      };

      const collection = createTriplitCollection({
        client: mockClient as TriplitClient<TodoModels>,
        query: mockQuery,
        getKey,
        id: 'active-todos',
        schema,
        onError,
        rowUpdateMode: 'full' as const,
        maxAge: 5 * 60 * 1000, // 5 minutes
      });

      expect(mockCreateCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'active-todos',
          schema,
          rowUpdateMode: 'full',
          maxAge: 300000,
          getKey,
          sync: expect.objectContaining({
            sync: expect.any(Function),
          }),
          onInsert: expect.any(Function),
          onUpdate: expect.any(Function),
          onDelete: expect.any(Function),
        })
      );

      expect(collection).toEqual({
        _type: 'MockCollection',
        id: 'test-todos',
      });
    });

    it('should handle complex todo workflow end-to-end', async () => {
      // Setup realistic data flow
      const initialTodos = new Map([
        ['1', { id: '1', text: 'Learn Triplit', completed: false, userId: 'user1' }],
        ['2', { id: '2', text: 'Build app', completed: false, userId: 'user1' }],
      ]);

      const updatedTodos = new Map([
        ['1', { id: '1', text: 'Learn Triplit', completed: true, userId: 'user1' }],
        ['2', { id: '2', text: 'Build app', completed: false, userId: 'user1' }],
        ['3', { id: '3', text: 'Deploy app', completed: false, userId: 'user1' }],
      ]);

      let subscriptionCallback: (results: any) => void;
      
      mockClient.fetch.mockResolvedValue(initialTodos);
      mockClient.subscribe.mockImplementation((query, callback) => {
        subscriptionCallback = callback;
        return () => {};
      });
      mockClient.insert.mockResolvedValue(undefined);
      mockClient.update.mockResolvedValue(undefined);
      mockClient.delete.mockResolvedValue(undefined);

      const collection = createTriplitCollection({
        client: mockClient as TriplitClient<TodoModels>,
        query: mockQuery,
        getKey,
        id: 'todo-list',
        onError,
      });

      const collectionConfig = mockCreateCollection.mock.calls[0][0];

      // Simulate sync initialization
      const mockSyncParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          getSnapshot: vi.fn(() => []),
          getPendingMutations: vi.fn(() => []),
        },
      };

      const cleanup = collectionConfig.sync.sync(mockSyncParams);

      // Wait for initial fetch
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockClient.fetch).toHaveBeenCalledWith(mockQuery);
      expect(mockSyncParams.markReady).toHaveBeenCalled();

      // Simulate subscription update
      subscriptionCallback!(updatedTodos);

      expect(mockSyncParams.write).toHaveBeenCalledWith({
        type: 'update',
        key: '1',
        value: { id: '1', text: 'Learn Triplit', completed: true, userId: 'user1' },
      });

      expect(mockSyncParams.write).toHaveBeenCalledWith({
        type: 'insert',
        value: { id: '3', text: 'Deploy app', completed: false, userId: 'user1' },
      });

      // Test mutation handlers
      await collectionConfig.onInsert({
        transaction: {
          mutations: [
            { modified: { id: '4', text: 'Test app', completed: false, userId: 'user1' } },
          ],
        },
      });

      await collectionConfig.onUpdate({
        transaction: {
          mutations: [
            { key: '2', changes: { completed: true } },
          ],
        },
      });

      await collectionConfig.onDelete({
        transaction: {
          mutations: [
            { key: '4' },
          ],
        },
      });

      expect(mockClient.insert).toHaveBeenCalledWith('todos', {
        id: '4',
        text: 'Test app',
        completed: false,
        userId: 'user1',
      });
      expect(mockClient.update).toHaveBeenCalledWith('todos', '2', { completed: true });
      expect(mockClient.delete).toHaveBeenCalledWith('todos', '4');

      cleanup();
    });
  });

  describe('Error handling integration', () => {
    it('should handle cascading errors across the entire system', async () => {
      const networkError = new Error('Network unavailable');
      
      mockClient.fetch.mockRejectedValue(networkError);
      mockClient.subscribe.mockImplementation((query, callback, errorCallback) => {
        setTimeout(() => errorCallback(networkError), 10);
        return () => {};
      });
      mockClient.insert.mockRejectedValue(networkError);

      const collection = createTriplitCollection({
        client: mockClient as TriplitClient<TodoModels>,
        query: mockQuery,
        getKey,
        onError,
      });

      const collectionConfig = mockCreateCollection.mock.calls[0][0];

      // Test sync error handling
      const mockSyncParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          getSnapshot: vi.fn(() => []),
          getPendingMutations: vi.fn(() => []),
        },
      };

      collectionConfig.sync.sync(mockSyncParams);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(onError).toHaveBeenCalledWith(networkError);
      expect(onError).toHaveBeenCalledTimes(2); // Once for fetch, once for subscribe

      // Test mutation error handling
      await expect(
        collectionConfig.onInsert({
          transaction: {
            mutations: [
              { modified: { id: '1', text: 'Test', completed: false, userId: 'user1' } },
            ],
          },
        })
      ).rejects.toThrow('Network unavailable');

      expect(onError).toHaveBeenCalledTimes(3);
    });
  });

  describe('Type safety integration', () => {
    it('should maintain type safety throughout the integration', () => {
      interface StrictTodoItem {
        id: string;
        title: string;
        done: boolean;
        createdAt: Date;
      }

      type StrictModels = {
        strictTodos: StrictTodoItem;
      };

      const strictQuery = {
        collectionName: 'strictTodos' as keyof StrictModels,
        _output: {} as StrictTodoItem,
      } as SchemaQuery<StrictModels>;

      const strictGetKey = (item: StrictTodoItem): string => item.id;

      const strictCollection = createTriplitCollection({
        client: mockClient as TriplitClient<StrictModels>,
        query: strictQuery,
        getKey: strictGetKey,
        id: 'strict-todos',
      });

      expect(mockCreateCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'strict-todos',
          getKey: strictGetKey,
        })
      );
    });
  });

  describe('Performance and cleanup integration', () => {
    it('should properly clean up resources in complex scenarios', () => {
      const unsubscribeFns: Array<() => void> = [];
      
      mockClient.subscribe.mockImplementation(() => {
        const unsubscribe = vi.fn();
        unsubscribeFns.push(unsubscribe);
        return unsubscribe;
      });

      // Create multiple collections
      const collections = Array.from({ length: 3 }, (_, i) =>
        createTriplitCollection({
          client: mockClient as TriplitClient<TodoModels>,
          query: mockQuery,
          getKey,
          id: `collection-${i}`,
        })
      );

      const cleanupFns = mockCreateCollection.mock.calls.map((call) => {
        const config = call[0];
        return config.sync.sync({
          begin: vi.fn(),
          write: vi.fn(),
          commit: vi.fn(),
          markReady: vi.fn(),
          collection: {
            getSnapshot: vi.fn(() => []),
            getPendingMutations: vi.fn(() => []),
          },
        });
      });

      expect(unsubscribeFns).toHaveLength(3);

      // Clean up all collections
      cleanupFns.forEach(cleanup => cleanup());

      unsubscribeFns.forEach(unsubscribe => {
        expect(unsubscribe).toHaveBeenCalled();
      });
    });
  });
});
