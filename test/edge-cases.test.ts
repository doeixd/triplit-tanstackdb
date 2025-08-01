import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTriplitCollection } from '../src/index';
import { createTriplitCollectionOptions } from '../src/options';
import type { TriplitClient, SchemaQuery, Models } from '@triplit/client';

// Mock TanStack DB
vi.mock('@tanstack/db', () => ({
  createCollection: vi.fn((config) => ({
    ...config,
    _type: 'MockCollection',
  })),
}));

interface TestItem {
  id: string;
  value: any;
}

type TestModels = {
  testCollection: TestItem;
};

describe('Edge Cases and Error Scenarios', () => {
  let mockClient: any;
  let mockQuery: SchemaQuery<TestModels>;
  let getKey: (item: TestItem) => string;

  beforeEach(() => {
    mockClient = {
      fetch: vi.fn(),
      subscribe: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    
    mockQuery = {
      collectionName: 'testCollection',
      _output: {} as TestItem,
    } as SchemaQuery<TestModels>;
    
    getKey = (item: TestItem) => item.id;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Empty and null data scenarios', () => {
    it('should handle empty fetch results', async () => {
      mockClient.fetch.mockResolvedValue(new Map());
      mockClient.subscribe.mockReturnValue(() => {});

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: mockQuery,
        getKey,
      });

      const mockParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map(),
        },
      };

      config.sync.sync(mockParams);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockParams.begin).toHaveBeenCalled();
      expect(mockParams.commit).toHaveBeenCalled();
      expect(mockParams.markReady).toHaveBeenCalled();
      expect(mockParams.write).not.toHaveBeenCalled();
    });

    it('should handle null and undefined items gracefully', async () => {
      const resultsWithNulls = new Map([
        ['1', { id: '1', value: null }],
        ['2', { id: '2', value: undefined }],
        ['3', { id: '3', value: '' }],
      ]);

      mockClient.fetch.mockResolvedValue(resultsWithNulls);
      mockClient.subscribe.mockReturnValue(() => {});

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: mockQuery,
        getKey,
      });

      const mockParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map(),
        },
      };

      config.sync.sync(mockParams);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockParams.write).toHaveBeenCalledWith({
        type: 'insert',
        value: { id: '1', value: null },
      });
      expect(mockParams.write).toHaveBeenCalledWith({
        type: 'insert',
        value: { id: '2', value: undefined },
      });
      expect(mockParams.write).toHaveBeenCalledWith({
        type: 'insert',
        value: { id: '3', value: '' },
      });
    });
  });

  describe('Duplicate and invalid keys', () => {
    it('should handle duplicate keys from remote data', async () => {
      const getKeyWithDuplicates = vi.fn()
        .mockReturnValueOnce('duplicate')
        .mockReturnValueOnce('duplicate')
        .mockReturnValueOnce('unique');

      const remoteResults = new Map([
        ['1', { id: '1', value: 'first' }],
        ['2', { id: '2', value: 'second' }],
        ['3', { id: '3', value: 'third' }],
      ]);

      mockClient.fetch.mockResolvedValue(remoteResults);
      mockClient.subscribe.mockReturnValue(() => {});

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: mockQuery,
        getKey: getKeyWithDuplicates,
      });

      const mockParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map(),
        },
      };

      config.sync.sync(mockParams);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(getKeyWithDuplicates).toHaveBeenCalledTimes(6); // Called twice per item (local + remote sets)
    });

    it('should handle non-string keys correctly', async () => {
      const numericGetKey = (item: TestItem) => parseInt(item.id);
      
      mockClient.update.mockResolvedValue(undefined);
      mockClient.delete.mockResolvedValue(undefined);

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: mockQuery,
        getKey: numericGetKey,
      });

      // Test update with numeric key
      await config.onUpdate({
        transaction: {
          mutations: [
            { key: 123, changes: { value: 'updated' } },
          ],
        },
      } as any);

      // Test delete with numeric key
      await config.onDelete({
        transaction: {
          mutations: [
            { key: 456 },
          ],
        },
      } as any);

      expect(mockClient.update).toHaveBeenCalledWith('testCollection', '123', { value: 'updated' });
      expect(mockClient.delete).toHaveBeenCalledWith('testCollection', '456');
    });
  });

  describe('Subscription timing edge cases', () => {
    it('should handle subscription data arriving before fetch completes', async () => {
      let fetchResolve: (value: any) => void;
      const fetchPromise = new Promise(resolve => {
        fetchResolve = resolve;
      });

      mockClient.fetch.mockReturnValue(fetchPromise);

      let subscriptionCallback: (results: any) => void;
      mockClient.subscribe.mockImplementation((query, callback) => {
        subscriptionCallback = callback;
        return () => {};
      });

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: mockQuery,
        getKey,
      });

      const mockParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map(),
        },
      };

      config.sync.sync(mockParams);

      // Subscription delivers data first
      const subscriptionData = new Map([
        ['1', { id: '1', value: 'from subscription' }],
      ]);
      subscriptionCallback!(subscriptionData);

      expect(mockParams.markReady).toHaveBeenCalledTimes(1);

      // Fetch completes later
      const fetchData = new Map([
        ['1', { id: '1', value: 'from fetch' }],
      ]);
      fetchResolve!(fetchData);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should not call markReady again
      expect(mockParams.markReady).toHaveBeenCalledTimes(1);
    });

    it('should handle rapid subscription updates', async () => {
      mockClient.fetch.mockResolvedValue(new Map());

      let subscriptionCallback: (results: any) => void;
      mockClient.subscribe.mockImplementation((query, callback) => {
        subscriptionCallback = callback;
        return () => {};
      });

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: mockQuery,
        getKey,
      });

      const mockParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map(),
        },
      };

      config.sync.sync(mockParams);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Rapid updates
      for (let i = 0; i < 10; i++) {
        const updateData = new Map([
          ['1', { id: '1', value: `update-${i}` }],
        ]);
        subscriptionCallback!(updateData);
      }

      expect(mockParams.begin).toHaveBeenCalledTimes(11); // Initial fetch + 10 updates
      expect(mockParams.commit).toHaveBeenCalledTimes(11);
    });
  });

  describe('Memory and resource management', () => {
    it('should clean up properly when subscription fails to unsubscribe', () => {
      mockClient.fetch.mockResolvedValue(new Map());
      
      const unsubscribe = vi.fn(() => {
        throw new Error('Unsubscribe failed');
      });
      mockClient.subscribe.mockReturnValue(unsubscribe);

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: mockQuery,
        getKey,
      });

      const mockParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map(),
        },
      };

      const cleanup = config.sync.sync(mockParams);

      // Should handle unsubscribe errors but still call the function
      try {
        cleanup();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('Unsubscribe failed');
      }
      expect(unsubscribe).toHaveBeenCalled();
    });

    it('should handle large datasets efficiently', async () => {
      // Generate large dataset
      const largeDataset = new Map();
      for (let i = 0; i < 10000; i++) {
        largeDataset.set(i.toString(), { id: i.toString(), value: `item-${i}` });
      }

      mockClient.fetch.mockResolvedValue(largeDataset);
      mockClient.subscribe.mockReturnValue(() => {});

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: mockQuery,
        getKey,
      });

      const mockParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map(),
        },
      };

      const startTime = Date.now();
      config.sync.sync(mockParams);

      await new Promise(resolve => setTimeout(resolve, 0));

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(mockParams.write).toHaveBeenCalledTimes(10000);
      expect(processingTime).toBeLessThan(1000); // Should process quickly
    });
  });

  describe('Concurrent mutation scenarios', () => {
    it('should handle overlapping mutations correctly', async () => {
      mockClient.insert.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      mockClient.update.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 50)));
      mockClient.delete.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 75)));

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: mockQuery,
        getKey,
      });

      // Start overlapping mutations
      const insertPromise = config.onInsert({
        transaction: {
          mutations: [
            { modified: { id: '1', value: 'new' } },
          ],
        },
      } as any);

      const updatePromise = config.onUpdate({
        transaction: {
          mutations: [
            { key: '2', changes: { value: 'updated' } },
          ],
        },
      } as any);

      const deletePromise = config.onDelete({
        transaction: {
          mutations: [
            { key: '3' },
          ],
        },
      } as any);

      await Promise.all([insertPromise, updatePromise, deletePromise]);

      expect(mockClient.insert).toHaveBeenCalledWith('testCollection', { id: '1', value: 'new' });
      expect(mockClient.update).toHaveBeenCalledWith('testCollection', '2', { value: 'updated' });
      expect(mockClient.delete).toHaveBeenCalledWith('testCollection', '3');
    });

    it('should handle batch mutations with mixed success/failure', async () => {
      mockClient.insert.mockImplementation((collection, data) => {
        if (data.id === 'fail') {
          throw new Error('Insert failed');
        }
        return Promise.resolve();
      });

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: mockQuery,
        getKey,
      });

      await expect(
        config.onInsert({
          transaction: {
            mutations: [
              { modified: { id: 'success', value: 'ok' } },
              { modified: { id: 'fail', value: 'error' } },
            ],
          },
        } as any)
      ).rejects.toThrow('Insert failed');

      expect(mockClient.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe('Malformed data handling', () => {
    it('should handle malformed query objects', () => {
      const malformedQuery = {
        // Missing collectionName
        _output: {} as TestItem,
      } as any;

      expect(() => {
        createTriplitCollectionOptions({
          client: mockClient,
          query: malformedQuery,
          getKey,
        });
      }).not.toThrow(); // Should handle gracefully
    });

    it('should handle items without required properties', async () => {
      const malformedResults = new Map([
        ['1', { value: 'missing id' }],
        ['2', null],
        ['3', undefined],
      ]);

      mockClient.fetch.mockResolvedValue(malformedResults);
      mockClient.subscribe.mockReturnValue(() => {});

      const safeGetKey = (item: any) => {
        return item?.id || 'unknown';
      };

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: mockQuery,
        getKey: safeGetKey,
      });

      const mockParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map(),
        },
      };

      expect(() => {
        config.sync.sync(mockParams);
      }).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockParams.write).toHaveBeenCalled();
    });
  });
});
