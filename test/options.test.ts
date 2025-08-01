import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTriplitCollectionOptions } from '../src/options';
import type { TriplitCollectionOptions } from '../src/options';
import type { TriplitClient, SchemaQuery, Models, FetchResult } from '@triplit/client';

// Mock data types
interface TestItem {
  id: string;
  name: string;
  completed: boolean;
}

type TestModels = {
  todos: TestItem;
};

describe('createTriplitCollectionOptions', () => {
  let mockClient: any;
  let mockQuery: SchemaQuery<TestModels>;
  let getKey: (item: TestItem) => string;
  let onError: ReturnType<typeof vi.fn>;
  let options: TriplitCollectionOptions<TestModels, SchemaQuery<TestModels>, TestItem>;

  beforeEach(() => {
    mockClient = {
      fetch: vi.fn(),
      subscribe: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    
    mockQuery = {
      collectionName: 'todos',
      _output: {} as TestItem,
    } as SchemaQuery<TestModels>;
    
    getKey = vi.fn((item) => item.id);
    onError = vi.fn();
    
    options = {
      client: mockClient,
      query: mockQuery,
      getKey,
      onError,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('return value structure', () => {
    it('should return correct config structure', () => {
      const config = createTriplitCollectionOptions(options);

      expect(config).toEqual({
        getKey,
        sync: {
          sync: expect.any(Function),
        },
        onInsert: expect.any(Function),
        onUpdate: expect.any(Function),
        onDelete: expect.any(Function),
      });
    });
  });

  describe('sync function', () => {
    it('should perform initial fetch and setup subscription', async () => {
      const mockResults = new Map([
        ['1', { id: '1', name: 'Test', completed: false }],
        ['2', { id: '2', name: 'Test 2', completed: true }],
      ]);
      
      mockClient.fetch.mockResolvedValue(mockResults);
      mockClient.subscribe.mockReturnValue(() => {});

      const config = createTriplitCollectionOptions(options);
      const mockParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          getSnapshot: vi.fn(() => []),
          getPendingMutations: vi.fn(() => []),
        },
      };

      const cleanup = config.sync.sync(mockParams);

      // Wait for initial fetch
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockClient.fetch).toHaveBeenCalledWith(mockQuery);
      expect(mockClient.subscribe).toHaveBeenCalledWith(
        mockQuery,
        expect.any(Function),
        expect.any(Function)
      );
      expect(mockParams.markReady).toHaveBeenCalled();
      expect(cleanup).toBeInstanceOf(Function);
    });

    it('should handle initial fetch errors gracefully', async () => {
      const fetchError = new Error('Fetch failed');
      mockClient.fetch.mockRejectedValue(fetchError);
      mockClient.subscribe.mockReturnValue(() => {});

      const config = createTriplitCollectionOptions(options);
      const mockParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          getSnapshot: vi.fn(() => []),
          getPendingMutations: vi.fn(() => []),
        },
      };

      config.sync.sync(mockParams);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(onError).toHaveBeenCalledWith(fetchError);
      expect(mockClient.subscribe).toHaveBeenCalled();
    });

    it('should reconcile data correctly with inserts, updates, and deletes', async () => {
      const localItems = [
        { id: '1', name: 'Old Item', completed: false },
        { id: '3', name: 'To Delete', completed: false },
      ];
      
      const remoteResults = new Map([
        ['1', { id: '1', name: 'Updated Item', completed: true }],
        ['2', { id: '2', name: 'New Item', completed: false }],
      ]);

      mockClient.fetch.mockResolvedValue(remoteResults);
      mockClient.subscribe.mockReturnValue(() => {});

      const config = createTriplitCollectionOptions(options);
      const mockParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          getSnapshot: vi.fn(() => localItems),
          getPendingMutations: vi.fn(() => []),
        },
      };

      config.sync.sync(mockParams);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockParams.write).toHaveBeenCalledWith({
        type: 'delete',
        key: '3',
      });
      expect(mockParams.write).toHaveBeenCalledWith({
        type: 'update',
        key: '1',
        value: { id: '1', name: 'Updated Item', completed: true },
      });
      expect(mockParams.write).toHaveBeenCalledWith({
        type: 'insert',
        value: { id: '2', name: 'New Item', completed: false },
      });
    });

    it('should not delete items with pending mutations', async () => {
      const localItems = [
        { id: '1', name: 'Item', completed: false },
        { id: '2', name: 'Pending Delete', completed: false },
      ];
      
      const remoteResults = new Map([
        ['1', { id: '1', name: 'Item', completed: false }],
      ]);

      const pendingMutations = [
        {
          mutations: [{ key: '2', type: 'delete' }],
        },
      ];

      mockClient.fetch.mockResolvedValue(remoteResults);
      mockClient.subscribe.mockReturnValue(() => {});

      const config = createTriplitCollectionOptions(options);
      const mockParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          getSnapshot: vi.fn(() => localItems),
          getPendingMutations: vi.fn(() => pendingMutations),
        },
      };

      config.sync.sync(mockParams);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should not delete item with key '2' because it has pending mutations
      expect(mockParams.write).not.toHaveBeenCalledWith({
        type: 'delete',
        key: '2',
      });
    });

    it('should handle subscription errors', () => {
      mockClient.fetch.mockResolvedValue(new Map());
      let subscriptionErrorCallback: (error: Error) => void;
      
      mockClient.subscribe.mockImplementation((query, callback, errorCallback) => {
        subscriptionErrorCallback = errorCallback;
        return () => {};
      });

      const config = createTriplitCollectionOptions(options);
      const mockParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          getSnapshot: vi.fn(() => []),
          getPendingMutations: vi.fn(() => []),
        },
      };

      config.sync.sync(mockParams);

      const subscriptionError = new Error('Subscription failed');
      subscriptionErrorCallback!(subscriptionError);

      expect(onError).toHaveBeenCalledWith(subscriptionError);
    });

    it('should cleanup subscription on return function call', () => {
      mockClient.fetch.mockResolvedValue(new Map());
      const unsubscribe = vi.fn();
      mockClient.subscribe.mockReturnValue(unsubscribe);

      const config = createTriplitCollectionOptions(options);
      const mockParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          getSnapshot: vi.fn(() => []),
          getPendingMutations: vi.fn(() => []),
        },
      };

      const cleanup = config.sync.sync(mockParams);
      cleanup();

      expect(unsubscribe).toHaveBeenCalled();
    });
  });

  describe('onInsert mutation handler', () => {
    it('should insert items via client', async () => {
      mockClient.insert.mockResolvedValue(undefined);

      const config = createTriplitCollectionOptions(options);
      const transaction = {
        mutations: [
          { modified: { id: '1', name: 'New Item', completed: false } },
          { modified: { id: '2', name: 'Another Item', completed: true } },
        ],
      };

      await config.onInsert({ transaction } as any);

      expect(mockClient.insert).toHaveBeenCalledWith(
        'todos',
        { id: '1', name: 'New Item', completed: false }
      );
      expect(mockClient.insert).toHaveBeenCalledWith(
        'todos',
        { id: '2', name: 'Another Item', completed: true }
      );
      expect(mockClient.insert).toHaveBeenCalledTimes(2);
    });

    it('should handle insert errors and rethrow', async () => {
      const insertError = new Error('Insert failed');
      mockClient.insert.mockRejectedValue(insertError);

      const config = createTriplitCollectionOptions(options);
      const transaction = {
        mutations: [
          { modified: { id: '1', name: 'New Item', completed: false } },
        ],
      };

      await expect(config.onInsert({ transaction } as any)).rejects.toThrow('Insert failed');
      expect(onError).toHaveBeenCalledWith(insertError);
    });
  });

  describe('onUpdate mutation handler', () => {
    it('should update items via client', async () => {
      mockClient.update.mockResolvedValue(undefined);

      const config = createTriplitCollectionOptions(options);
      const transaction = {
        mutations: [
          { key: '1', changes: { name: 'Updated Name' } },
          { key: '2', changes: { completed: true } },
        ],
      };

      await config.onUpdate({ transaction } as any);

      expect(mockClient.update).toHaveBeenCalledWith('todos', '1', { name: 'Updated Name' });
      expect(mockClient.update).toHaveBeenCalledWith('todos', '2', { completed: true });
      expect(mockClient.update).toHaveBeenCalledTimes(2);
    });

    it('should handle update errors and rethrow', async () => {
      const updateError = new Error('Update failed');
      mockClient.update.mockRejectedValue(updateError);

      const config = createTriplitCollectionOptions(options);
      const transaction = {
        mutations: [
          { key: '1', changes: { name: 'Updated Name' } },
        ],
      };

      await expect(config.onUpdate({ transaction } as any)).rejects.toThrow('Update failed');
      expect(onError).toHaveBeenCalledWith(updateError);
    });

    it('should convert keys to strings', async () => {
      mockClient.update.mockResolvedValue(undefined);

      const config = createTriplitCollectionOptions(options);
      const transaction = {
        mutations: [
          { key: 123, changes: { name: 'Updated Name' } },
        ],
      };

      await config.onUpdate({ transaction } as any);

      expect(mockClient.update).toHaveBeenCalledWith('todos', '123', { name: 'Updated Name' });
    });
  });

  describe('onDelete mutation handler', () => {
    it('should delete items via client', async () => {
      mockClient.delete.mockResolvedValue(undefined);

      const config = createTriplitCollectionOptions(options);
      const transaction = {
        mutations: [
          { key: '1' },
          { key: '2' },
        ],
      };

      await config.onDelete({ transaction } as any);

      expect(mockClient.delete).toHaveBeenCalledWith('todos', '1');
      expect(mockClient.delete).toHaveBeenCalledWith('todos', '2');
      expect(mockClient.delete).toHaveBeenCalledTimes(2);
    });

    it('should handle delete errors and rethrow', async () => {
      const deleteError = new Error('Delete failed');
      mockClient.delete.mockRejectedValue(deleteError);

      const config = createTriplitCollectionOptions(options);
      const transaction = {
        mutations: [
          { key: '1' },
        ],
      };

      await expect(config.onDelete({ transaction } as any)).rejects.toThrow('Delete failed');
      expect(onError).toHaveBeenCalledWith(deleteError);
    });

    it('should convert keys to strings', async () => {
      mockClient.delete.mockResolvedValue(undefined);

      const config = createTriplitCollectionOptions(options);
      const transaction = {
        mutations: [
          { key: 456 },
        ],
      };

      await config.onDelete({ transaction } as any);

      expect(mockClient.delete).toHaveBeenCalledWith('todos', '456');
    });
  });

  describe('without onError callback', () => {
    beforeEach(() => {
      options = {
        client: mockClient,
        query: mockQuery,
        getKey,
        // No onError callback
      };
    });

    it('should not throw when onError is undefined', async () => {
      const insertError = new Error('Insert failed');
      mockClient.insert.mockRejectedValue(insertError);

      const config = createTriplitCollectionOptions(options);
      const transaction = {
        mutations: [
          { modified: { id: '1', name: 'New Item', completed: false } },
        ],
      };

      await expect(config.onInsert({ transaction } as any)).rejects.toThrow('Insert failed');
      // Should not throw when calling onError
    });
  });
});
