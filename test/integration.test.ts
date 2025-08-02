import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTriplitCollection } from "../src/index";
import { createTriplitCollectionOptions } from "../src/options";
import type { TriplitClient, SchemaQuery, Models } from "@triplit/client";

// Mock TanStack DB's createCollection
vi.mock("@tanstack/db", () => ({
  createCollection: vi.fn(),
}));

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  userId: string;
  createdAt: number;
  updatedAt: number;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

type AppModels = {
  todos: TodoItem;
  users: UserItem;
};

describe("Comprehensive Integration Tests", () => {
  let mockClient: any;
  let mockQuery: SchemaQuery<AppModels>;
  let getKey: (item: TodoItem) => string;
  let onError: ReturnType<typeof vi.fn>;
  let mockCreateCollection: any;

  beforeEach(async () => {
    const { createCollection } = await import("@tanstack/db");
    mockCreateCollection = createCollection as any;

    mockClient = {
      fetch: vi.fn(),
      subscribe: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    mockQuery = {
      collectionName: "todos",
      _output: {} as TodoItem,
    } as SchemaQuery<AppModels>;

    getKey = (item: TodoItem) => item.id;
    onError = vi.fn();

    mockCreateCollection.mockReturnValue({
      _type: "MockCollection",
      id: "test-collection",
      state: new Map(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Real-world User Workflows", () => {
    it("should handle complete todo management workflow", async () => {
      // Initial state: User has existing todos
      const initialTodos = new Map([
        [
          "1",
          {
            id: "1",
            text: "Setup project",
            completed: true,
            userId: "user1",
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
        [
          "2",
          {
            id: "2",
            text: "Write tests",
            completed: false,
            userId: "user1",
            createdAt: 2000,
            updatedAt: 2000,
          },
        ],
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
        client: mockClient as TriplitClient<AppModels>,
        query: mockQuery,
        getKey,
        id: "user-todos",
        onError,
      });

      const collectionConfig = mockCreateCollection.mock.calls[0][0];

      // Simulate collection initialization
      const mockSyncParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map(),
        },
      };

      const cleanup = collectionConfig.sync.sync(mockSyncParams);

      // Wait for initial fetch
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockClient.fetch).toHaveBeenCalledWith(mockQuery);
      expect(mockSyncParams.markReady).toHaveBeenCalled();
      expect(mockSyncParams.write).toHaveBeenCalledTimes(2);

      // Simulate user adding a new todo
      await collectionConfig.onInsert({
        transaction: {
          mutations: [
            {
              modified: {
                id: "3",
                text: "Deploy app",
                completed: false,
                userId: "user1",
                createdAt: 3000,
                updatedAt: 3000,
              },
            },
          ],
        },
      });

      // Simulate user completing a todo
      await collectionConfig.onUpdate({
        transaction: {
          mutations: [
            { key: "2", changes: { completed: true, updatedAt: 2500 } },
          ],
        },
      });

      // Simulate real-time update from another device
      mockSyncParams.collection.state = new Map([
        [
          "1",
          {
            id: "1",
            text: "Setup project",
            completed: true,
            userId: "user1",
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
        [
          "2",
          {
            id: "2",
            text: "Write tests",
            completed: false,
            userId: "user1",
            createdAt: 2000,
            updatedAt: 2000,
          },
        ],
        [
          "3",
          {
            id: "3",
            text: "Deploy app",
            completed: false,
            userId: "user1",
            createdAt: 3000,
            updatedAt: 3000,
          },
        ],
      ]);

      const updatedTodos = new Map([
        [
          "1",
          {
            id: "1",
            text: "Setup project",
            completed: true,
            userId: "user1",
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
        [
          "2",
          {
            id: "2",
            text: "Write comprehensive tests",
            completed: true,
            userId: "user1",
            createdAt: 2000,
            updatedAt: 2600,
          },
        ],
        [
          "3",
          {
            id: "3",
            text: "Deploy app",
            completed: false,
            userId: "user1",
            createdAt: 3000,
            updatedAt: 3000,
          },
        ],
        [
          "4",
          {
            id: "4",
            text: "Monitor performance",
            completed: false,
            userId: "user1",
            createdAt: 4000,
            updatedAt: 4000,
          },
        ],
      ]);

      subscriptionCallback!(updatedTodos);

      // Simulate user deleting a completed todo
      await collectionConfig.onDelete({
        transaction: {
          mutations: [{ key: "1" }],
        },
      });

      expect(mockClient.insert).toHaveBeenCalledWith("todos", {
        id: "3",
        text: "Deploy app",
        completed: false,
        userId: "user1",
        createdAt: 3000,
        updatedAt: 3000,
      });
      expect(mockClient.update).toHaveBeenCalledWith("todos", "2", {
        completed: true,
        updatedAt: 2500,
      });
      expect(mockClient.delete).toHaveBeenCalledWith("todos", "1");

      cleanup();
    });

    it("should handle multi-user collaboration scenario", async () => {
      const initialData = new Map([
        [
          "shared-1",
          {
            id: "shared-1",
            text: "Team meeting",
            completed: false,
            userId: "user1",
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
      ]);

      let subscriptionCallback: (results: any) => void;

      mockClient.fetch.mockResolvedValue(initialData);
      mockClient.subscribe.mockImplementation((query, callback) => {
        subscriptionCallback = callback;
        return () => {};
      });

      const collection = createTriplitCollection({
        client: mockClient as TriplitClient<AppModels>,
        query: mockQuery,
        getKey,
        id: "team-todos",
        onError,
      });

      const collectionConfig = mockCreateCollection.mock.calls[0][0];

      const mockSyncParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map([
            [
              "shared-1",
              {
                id: "shared-1",
                text: "Team meeting",
                completed: false,
                userId: "user1",
                createdAt: 1000,
                updatedAt: 1000,
              },
            ],
          ]),
        },
      };

      collectionConfig.sync.sync(mockSyncParams);

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Simulate rapid updates from multiple users
      const updates = [
        new Map([
          [
            "shared-1",
            {
              id: "shared-1",
              text: "Team meeting (updated by user2)",
              completed: false,
              userId: "user1",
              createdAt: 1000,
              updatedAt: 1100,
            },
          ],
        ]),
        new Map([
          [
            "shared-1",
            {
              id: "shared-1",
              text: "Team meeting (updated by user2)",
              completed: true,
              userId: "user1",
              createdAt: 1000,
              updatedAt: 1200,
            },
          ],
          [
            "shared-2",
            {
              id: "shared-2",
              text: "Code review",
              completed: false,
              userId: "user2",
              createdAt: 1150,
              updatedAt: 1150,
            },
          ],
        ]),
        new Map([
          [
            "shared-1",
            {
              id: "shared-1",
              text: "Team meeting (updated by user2)",
              completed: true,
              userId: "user1",
              createdAt: 1000,
              updatedAt: 1200,
            },
          ],
          [
            "shared-2",
            {
              id: "shared-2",
              text: "Code review",
              completed: false,
              userId: "user2",
              createdAt: 1150,
              updatedAt: 1150,
            },
          ],
          [
            "shared-3",
            {
              id: "shared-3",
              text: "Deploy to staging",
              completed: false,
              userId: "user3",
              createdAt: 1300,
              updatedAt: 1300,
            },
          ],
        ]),
      ];

      // Simulate real-time updates
      for (const update of updates) {
        subscriptionCallback!(update);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(mockSyncParams.write).toHaveBeenCalledWith({
        type: "update",
        value: {
          id: "shared-1",
          text: "Team meeting (updated by user2)",
          completed: false,
          userId: "user1",
          createdAt: 1000,
          updatedAt: 1100,
        },
      });

      expect(mockSyncParams.write).toHaveBeenCalledWith({
        type: "insert",
        value: {
          id: "shared-2",
          text: "Code review",
          completed: false,
          userId: "user2",
          createdAt: 1150,
          updatedAt: 1150,
        },
      });

      expect(mockSyncParams.write).toHaveBeenCalledWith({
        type: "insert",
        value: {
          id: "shared-3",
          text: "Deploy to staging",
          completed: false,
          userId: "user3",
          createdAt: 1300,
          updatedAt: 1300,
        },
      });
    });

    it("should handle offline to online transition", async () => {
      const offlineData = new Map([
        [
          "offline-1",
          {
            id: "offline-1",
            text: "Created offline",
            completed: false,
            userId: "user1",
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
      ]);

      // Simulate initial offline state - fetch fails but subscription eventually succeeds
      mockClient.fetch.mockRejectedValue(new Error("Network unavailable"));

      let subscriptionCallback: (results: any) => void;
      let subscriptionErrorCallback: (error: any) => void;

      mockClient.subscribe.mockImplementation(
        (query, callback, errorCallback) => {
          subscriptionCallback = callback;
          subscriptionErrorCallback = errorCallback;

          // Simulate connection after delay
          setTimeout(() => {
            callback(offlineData);
          }, 100);

          return () => {};
        },
      );

      const collection = createTriplitCollection({
        client: mockClient as TriplitClient<AppModels>,
        query: mockQuery,
        getKey,
        id: "offline-todos",
        onError,
      });

      const collectionConfig = mockCreateCollection.mock.calls[0][0];

      const mockSyncParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map(),
        },
      };

      collectionConfig.sync.sync(mockSyncParams);

      // Wait for fetch to fail and subscription to succeed
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Network unavailable",
        }),
      );
      expect(mockSyncParams.markReady).toHaveBeenCalled();
      expect(mockSyncParams.write).toHaveBeenCalledWith({
        type: "insert",
        value: {
          id: "offline-1",
          text: "Created offline",
          completed: false,
          userId: "user1",
          createdAt: 1000,
          updatedAt: 1000,
        },
      });

      // Simulate coming back online with server data
      const onlineData = new Map([
        [
          "offline-1",
          {
            id: "offline-1",
            text: "Created offline",
            completed: false,
            userId: "user1",
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
        [
          "server-1",
          {
            id: "server-1",
            text: "From server",
            completed: true,
            userId: "user2",
            createdAt: 2000,
            updatedAt: 2000,
          },
        ],
      ]);

      mockSyncParams.collection.state = new Map([
        [
          "offline-1",
          {
            id: "offline-1",
            text: "Created offline",
            completed: false,
            userId: "user1",
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
      ]);

      subscriptionCallback!(onlineData);

      expect(mockSyncParams.write).toHaveBeenCalledWith({
        type: "insert",
        value: {
          id: "server-1",
          text: "From server",
          completed: true,
          userId: "user2",
          createdAt: 2000,
          updatedAt: 2000,
        },
      });
    });
  });

  describe("Sync Flow Architecture Integration", () => {
    it("should coordinate initial fetch and subscription properly", async () => {
      const fetchData = new Map([
        [
          "fetch-1",
          {
            id: "fetch-1",
            text: "From fetch",
            completed: false,
            userId: "user1",
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
      ]);

      const subscriptionData = new Map([
        [
          "fetch-1",
          {
            id: "fetch-1",
            text: "From fetch",
            completed: false,
            userId: "user1",
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
        [
          "sub-1",
          {
            id: "sub-1",
            text: "From subscription",
            completed: true,
            userId: "user1",
            createdAt: 2000,
            updatedAt: 2000,
          },
        ],
      ]);

      let fetchResolve: (value: any) => void;
      const fetchPromise = new Promise((resolve) => {
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
        onError,
      });

      const mockSyncParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map(),
        },
      };

      config.sync.sync(mockSyncParams);

      // Subscription delivers first
      subscriptionCallback!(subscriptionData);
      expect(mockSyncParams.markReady).toHaveBeenCalledTimes(1);

      // Fetch completes later - should not call markReady again
      fetchResolve!(fetchData);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockSyncParams.markReady).toHaveBeenCalledTimes(1);
      expect(mockSyncParams.write).toHaveBeenCalledWith({
        type: "insert",
        value: {
          id: "fetch-1",
          text: "From fetch",
          completed: false,
          userId: "user1",
          createdAt: 1000,
          updatedAt: 1000,
        },
      });
      expect(mockSyncParams.write).toHaveBeenCalledWith({
        type: "insert",
        value: {
          id: "sub-1",
          text: "From subscription",
          completed: true,
          userId: "user1",
          createdAt: 2000,
          updatedAt: 2000,
        },
      });
    });

    it("should handle complex reconciliation scenarios", async () => {
      const localData = [
        {
          id: "local-1",
          text: "Local only",
          completed: false,
          userId: "user1",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: "both-1",
          text: "Local version",
          completed: false,
          userId: "user1",
          createdAt: 2000,
          updatedAt: 2000,
        },
        {
          id: "both-2",
          text: "Another local",
          completed: true,
          userId: "user1",
          createdAt: 3000,
          updatedAt: 3000,
        },
      ];

      const remoteData = new Map([
        [
          "both-1",
          {
            id: "both-1",
            text: "Remote version",
            completed: true,
            userId: "user1",
            createdAt: 2000,
            updatedAt: 2500,
          },
        ],
        [
          "both-2",
          {
            id: "both-2",
            text: "Another remote",
            completed: false,
            userId: "user1",
            createdAt: 3000,
            updatedAt: 3500,
          },
        ],
        [
          "remote-1",
          {
            id: "remote-1",
            text: "Remote only",
            completed: true,
            userId: "user2",
            createdAt: 4000,
            updatedAt: 4000,
          },
        ],
      ]);

      mockClient.fetch.mockResolvedValue(remoteData);
      mockClient.subscribe.mockReturnValue(() => {});

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: mockQuery,
        getKey,
      });

      const mockSyncParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map(localData.map((item) => [getKey(item), item])),
        },
      };

      config.sync.sync(mockSyncParams);

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Should delete local-only item
      expect(mockSyncParams.write).toHaveBeenCalledWith({
        type: "delete",
        value: {
          id: "local-1",
          text: "Local only",
          completed: false,
          userId: "user1",
          createdAt: 1000,
          updatedAt: 1000,
        },
      });

      // Should update existing items with remote versions
      expect(mockSyncParams.write).toHaveBeenCalledWith({
        type: "update",
        value: {
          id: "both-1",
          text: "Remote version",
          completed: true,
          userId: "user1",
          createdAt: 2000,
          updatedAt: 2500,
        },
      });

      expect(mockSyncParams.write).toHaveBeenCalledWith({
        type: "update",
        value: {
          id: "both-2",
          text: "Another remote",
          completed: false,
          userId: "user1",
          createdAt: 3000,
          updatedAt: 3500,
        },
      });

      // Should insert remote-only item
      expect(mockSyncParams.write).toHaveBeenCalledWith({
        type: "insert",
        value: {
          id: "remote-1",
          text: "Remote only",
          completed: true,
          userId: "user2",
          createdAt: 4000,
          updatedAt: 4000,
        },
      });
    });

    it("should handle optimistic updates and rollbacks", async () => {
      mockClient.fetch.mockResolvedValue(new Map());
      mockClient.subscribe.mockReturnValue(() => {});
      mockClient.update.mockRejectedValue(new Error("Update failed"));

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: mockQuery,
        getKey,
        onError,
      });

      // Test optimistic update that fails
      await expect(
        config.onUpdate({
          transaction: {
            mutations: [{ key: "1", changes: { completed: true } }],
          },
        } as any),
      ).rejects.toThrow("Update failed");

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Update failed",
        }),
      );
      expect(mockClient.update).toHaveBeenCalledWith("todos", "1", {
        completed: true,
      });
    });
  });

  describe("Performance and Resource Management", () => {
    it("should handle large datasets efficiently", async () => {
      // Generate 10,000 items
      const largeDataset = new Map();
      for (let i = 0; i < 10000; i++) {
        largeDataset.set(i.toString(), {
          id: i.toString(),
          text: `Todo ${i}`,
          completed: i % 2 === 0,
          userId: `user${i % 10}`,
          createdAt: 1000 + i,
          updatedAt: 1000 + i,
        });
      }

      mockClient.fetch.mockResolvedValue(largeDataset);
      mockClient.subscribe.mockReturnValue(() => {});

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: mockQuery,
        getKey,
      });

      const mockSyncParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map(),
        },
      };

      const startTime = Date.now();
      config.sync.sync(mockSyncParams);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(mockSyncParams.write).toHaveBeenCalledTimes(10000);
      expect(processingTime).toBeLessThan(2000); // Should process within 2 seconds
      expect(mockSyncParams.begin).toHaveBeenCalledTimes(1);
      expect(mockSyncParams.commit).toHaveBeenCalledTimes(1);
    });

    it("should manage multiple collection instances efficiently", () => {
      const collections = [];
      const cleanupFunctions = [];

      mockClient.fetch.mockResolvedValue(new Map());
      mockClient.subscribe.mockReturnValue(() => {});

      // Create 10 collections
      for (let i = 0; i < 10; i++) {
        const collection = createTriplitCollection({
          client: mockClient as TriplitClient<AppModels>,
          query: { ...mockQuery, collectionName: `collection${i}` } as any,
          getKey,
          id: `collection-${i}`,
        });

        collections.push(collection);

        const collectionConfig = mockCreateCollection.mock.calls[i][0];
        const cleanup = collectionConfig.sync.sync({
          begin: vi.fn(),
          write: vi.fn(),
          commit: vi.fn(),
          markReady: vi.fn(),
          collection: { state: new Map() },
        });

        cleanupFunctions.push(cleanup);
      }

      expect(collections).toHaveLength(10);
      expect(mockClient.subscribe).toHaveBeenCalledTimes(10);

      // Clean up all collections
      cleanupFunctions.forEach((cleanup) => cleanup());

      expect(cleanupFunctions).toHaveLength(10);
    });

    it("should handle memory pressure gracefully", async () => {
      // Simulate memory pressure by creating and destroying collections rapidly
      const iterations = 100;

      mockClient.fetch.mockResolvedValue(new Map());
      mockClient.subscribe.mockReturnValue(() => {});

      for (let i = 0; i < iterations; i++) {
        const collection = createTriplitCollection({
          client: mockClient as TriplitClient<AppModels>,
          query: mockQuery,
          getKey,
          id: `temp-collection-${i}`,
        });

        const collectionConfig =
          mockCreateCollection.mock.calls[
            mockCreateCollection.mock.calls.length - 1
          ][0];
        const cleanup = collectionConfig.sync.sync({
          begin: vi.fn(),
          write: vi.fn(),
          commit: vi.fn(),
          markReady: vi.fn(),
          collection: { state: new Map() },
        });

        // Immediately clean up
        cleanup();
      }

      expect(mockCreateCollection).toHaveBeenCalledTimes(iterations);
    });
  });

  describe("Error Recovery and Resilience", () => {
    it("should recover from network partitions", async () => {
      let subscriptionCallback: (results: any) => void;
      let subscriptionErrorCallback: (error: any) => void;

      mockClient.fetch.mockResolvedValue(new Map());
      mockClient.subscribe.mockImplementation(
        (query, callback, errorCallback) => {
          subscriptionCallback = callback;
          subscriptionErrorCallback = errorCallback;
          return () => {};
        },
      );

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: mockQuery,
        getKey,
        onError,
      });

      const mockSyncParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map(),
        },
      };

      config.sync.sync(mockSyncParams);

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Simulate network partition
      const networkError = new Error("Connection lost");
      subscriptionErrorCallback!(networkError);

      expect(onError).toHaveBeenCalledWith(networkError);

      // Simulate reconnection with new data
      const reconnectionData = new Map([
        [
          "reconnect-1",
          {
            id: "reconnect-1",
            text: "After reconnection",
            completed: false,
            userId: "user1",
            createdAt: 5000,
            updatedAt: 5000,
          },
        ],
      ]);

      subscriptionCallback!(reconnectionData);

      expect(mockSyncParams.write).toHaveBeenCalledWith({
        type: "insert",
        value: {
          id: "reconnect-1",
          text: "After reconnection",
          completed: false,
          userId: "user1",
          createdAt: 5000,
          updatedAt: 5000,
        },
      });
    });

    it("should handle partial mutation failures in batches", async () => {
      mockClient.insert.mockImplementation((collection, data) => {
        if (data.id === "fail") {
          return Promise.reject(new Error("Insert failed"));
        }
        return Promise.resolve();
      });

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: mockQuery,
        getKey,
        onError,
      });

      // Test batch with mixed success/failure
      await expect(
        config.onInsert({
          transaction: {
            mutations: [
              {
                modified: {
                  id: "success1",
                  text: "Will succeed",
                  completed: false,
                  userId: "user1",
                  createdAt: 1000,
                  updatedAt: 1000,
                },
              },
              {
                modified: {
                  id: "fail",
                  text: "Will fail",
                  completed: false,
                  userId: "user1",
                  createdAt: 2000,
                  updatedAt: 2000,
                },
              },
              {
                modified: {
                  id: "success2",
                  text: "Never reached",
                  completed: false,
                  userId: "user1",
                  createdAt: 3000,
                  updatedAt: 3000,
                },
              },
            ],
          },
        } as any),
      ).rejects.toThrow("Insert failed");

      expect(mockClient.insert).toHaveBeenCalledWith("todos", {
        id: "success1",
        text: "Will succeed",
        completed: false,
        userId: "user1",
        createdAt: 1000,
        updatedAt: 1000,
      });
      expect(mockClient.insert).toHaveBeenCalledWith("todos", {
        id: "fail",
        text: "Will fail",
        completed: false,
        userId: "user1",
        createdAt: 2000,
        updatedAt: 2000,
      });
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Insert failed",
        }),
      );
    });

    it("should handle data corruption gracefully", async () => {
      const corruptedData = new Map([
        [
          "valid",
          {
            id: "valid",
            text: "Valid todo",
            completed: false,
            userId: "user1",
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
        ["corrupt1", null],
        ["corrupt2", undefined],
        ["corrupt3", { text: "Missing id", completed: false }],
        ["corrupt4", { id: "", text: "Empty id", completed: false }],
      ]);

      mockClient.fetch.mockResolvedValue(corruptedData);
      mockClient.subscribe.mockReturnValue(() => {});

      const safeGetKey = (item: any) => {
        if (!item || typeof item !== "object") return "unknown";
        return item.id || "unknown";
      };

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: mockQuery,
        getKey: safeGetKey,
        onError,
      });

      const mockSyncParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map(),
        },
      };

      expect(() => {
        config.sync.sync(mockSyncParams);
      }).not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockSyncParams.markReady).toHaveBeenCalled();
      expect(mockSyncParams.write).toHaveBeenCalledWith({
        type: "insert",
        value: {
          id: "valid",
          text: "Valid todo",
          completed: false,
          userId: "user1",
          createdAt: 1000,
          updatedAt: 1000,
        },
      });
    });
  });

  describe("Type Safety and Schema Integration", () => {
    it("should maintain type safety with custom schemas", () => {
      interface CustomItem {
        uuid: string;
        title: string;
        status: "pending" | "active" | "completed";
        metadata: Record<string, any>;
      }

      type CustomModels = {
        customItems: CustomItem;
      };

      const customQuery = {
        collectionName: "customItems" as keyof CustomModels,
        _output: {} as CustomItem,
      } as SchemaQuery<CustomModels>;

      const customGetKey = (item: CustomItem): string => item.uuid;

      const customSchema = {
        parse: vi.fn((data) => data),
        safeParse: vi.fn((data) => ({ success: true, data })),
      };

      const collection = createTriplitCollection({
        client: mockClient as TriplitClient<CustomModels>,
        query: customQuery,
        getKey: customGetKey,
        schema: customSchema,
        id: "custom-collection",
      });

      expect(mockCreateCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "custom-collection",
          schema: customSchema,
          getKey: customGetKey,
        }),
      );
    });

    it("should work with factory function passthrough options", () => {
      const schema = {
        parse: vi.fn((data) => data),
        safeParse: vi.fn((data) => ({ success: true, data })),
      };

      const collection = createTriplitCollection({
        client: mockClient as TriplitClient<AppModels>,
        query: mockQuery,
        getKey,
        id: "feature-rich-todos",
        schema,
        onError,
        rowUpdateMode: "full" as const,
        maxAge: 5 * 60 * 1000, // 5 minutes
      });

      expect(mockCreateCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "feature-rich-todos",
          schema,
          rowUpdateMode: "full",
          maxAge: 300000,
          getKey,
          sync: expect.objectContaining({
            sync: expect.any(Function),
          }),
          onInsert: expect.any(Function),
          onUpdate: expect.any(Function),
          onDelete: expect.any(Function),
        }),
      );

      expect(collection).toEqual({
        _type: "MockCollection",
        id: "test-collection",
        state: new Map(),
      });
    });
  });

  describe("Advanced Real-time Scenarios", () => {
    it("should handle rapid subscription updates without race conditions", async () => {
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

      const mockSyncParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map(),
        },
      };

      config.sync.sync(mockSyncParams);

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Simulate rapid-fire updates
      const updates = Array.from(
        { length: 50 },
        (_, i) =>
          new Map([
            [
              `rapid-${i}`,
              {
                id: `rapid-${i}`,
                text: `Rapid update ${i}`,
                completed: i % 2 === 0,
                userId: "user1",
                createdAt: 1000 + i,
                updatedAt: 1000 + i,
              },
            ],
          ]),
      );

      for (const update of updates) {
        subscriptionCallback!(update);
      }

      expect(mockSyncParams.begin).toHaveBeenCalledTimes(51); // Initial fetch + 50 updates
      expect(mockSyncParams.commit).toHaveBeenCalledTimes(51);
      expect(mockSyncParams.write).toHaveBeenCalledTimes(50);
    });

    it("should handle subscription cleanup edge cases", () => {
      let unsubscribeCallCount = 0;
      const unsubscribe = vi.fn(() => {
        unsubscribeCallCount++;
        if (unsubscribeCallCount === 1) {
          throw new Error("First unsubscribe failed");
        }
      });

      mockClient.fetch.mockResolvedValue(new Map());
      mockClient.subscribe.mockReturnValue(unsubscribe);

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: mockQuery,
        getKey,
        onError,
      });

      const mockSyncParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map(),
        },
      };

      const cleanup = config.sync.sync(mockSyncParams);

      // First cleanup should fail
      expect(() => cleanup()).toThrow("First unsubscribe failed");
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("should handle concurrent mutation operations", async () => {
      const delays = {
        insert: 100,
        update: 50,
        delete: 75,
      };

      mockClient.insert.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, delays.insert)),
      );
      mockClient.update.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, delays.update)),
      );
      mockClient.delete.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, delays.delete)),
      );

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: mockQuery,
        getKey,
      });

      const startTime = Date.now();

      // Start all operations concurrently
      const operations = [
        config.onInsert({
          transaction: {
            mutations: [
              {
                modified: {
                  id: "1",
                  text: "New todo",
                  completed: false,
                  userId: "user1",
                  createdAt: 1000,
                  updatedAt: 1000,
                },
              },
            ],
          },
        } as any),
        config.onUpdate({
          transaction: {
            mutations: [
              { key: "2", changes: { completed: true, updatedAt: 1100 } },
            ],
          },
        } as any),
        config.onDelete({
          transaction: {
            mutations: [{ key: "3" }],
          },
        } as any),
      ];

      await Promise.all(operations);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should complete in roughly the time of the longest operation (100ms)
      // rather than the sum of all operations (225ms)
      expect(totalTime).toBeLessThan(150);
      expect(totalTime).toBeGreaterThan(90);
    });
  });

  describe("Complex Query and Filter Scenarios", () => {
    it("should handle filtered query updates correctly", async () => {
      // Simulate a filtered query (e.g., only incomplete todos)
      const filteredQuery = {
        collectionName: "todos",
        _output: {} as TodoItem,
        filters: { completed: false },
      } as SchemaQuery<AppModels>;

      const initialData = new Map([
        [
          "1",
          {
            id: "1",
            text: "Incomplete task",
            completed: false,
            userId: "user1",
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
        // Note: completed todos are not included due to filter
      ]);

      let subscriptionCallback: (results: any) => void;

      mockClient.fetch.mockResolvedValue(initialData);
      mockClient.subscribe.mockImplementation((query, callback) => {
        subscriptionCallback = callback;
        return () => {};
      });

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: filteredQuery,
        getKey,
      });

      const mockSyncParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map([
            [
              "1",
              {
                id: "1",
                text: "Incomplete task",
                completed: false,
                userId: "user1",
                createdAt: 1000,
                updatedAt: 1000,
              },
            ],
          ]),
        },
      };

      config.sync.sync(mockSyncParams);

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Simulate completing a task (which should remove it from filtered results)
      const updatedData = new Map([
        // Task '1' is no longer in results because it's now completed
        [
          "2",
          {
            id: "2",
            text: "New incomplete task",
            completed: false,
            userId: "user1",
            createdAt: 2000,
            updatedAt: 2000,
          },
        ],
      ]);

      subscriptionCallback!(updatedData);

      // Should delete the completed task from local collection
      expect(mockSyncParams.write).toHaveBeenCalledWith({
        type: "delete",
        value: {
          id: "1",
          text: "Incomplete task",
          completed: false,
          userId: "user1",
          createdAt: 1000,
          updatedAt: 1000,
        },
      });

      // Should insert the new incomplete task
      expect(mockSyncParams.write).toHaveBeenCalledWith({
        type: "insert",
        value: {
          id: "2",
          text: "New incomplete task",
          completed: false,
          userId: "user1",
          createdAt: 2000,
          updatedAt: 2000,
        },
      });
    });

    it("should handle user-specific query updates", async () => {
      const userQuery = {
        collectionName: "todos",
        _output: {} as TodoItem,
        userId: "user1",
      } as SchemaQuery<AppModels>;

      const userData = new Map([
        [
          "user1-1",
          {
            id: "user1-1",
            text: "User 1 task",
            completed: false,
            userId: "user1",
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
        [
          "user1-2",
          {
            id: "user1-2",
            text: "Another user 1 task",
            completed: true,
            userId: "user1",
            createdAt: 2000,
            updatedAt: 2000,
          },
        ],
      ]);

      mockClient.fetch.mockResolvedValue(userData);
      mockClient.subscribe.mockReturnValue(() => {});

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: userQuery,
        getKey,
      });

      const mockSyncParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map(),
        },
      };

      config.sync.sync(mockSyncParams);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockSyncParams.write).toHaveBeenCalledWith({
        type: "insert",
        value: {
          id: "user1-1",
          text: "User 1 task",
          completed: false,
          userId: "user1",
          createdAt: 1000,
          updatedAt: 1000,
        },
      });

      expect(mockSyncParams.write).toHaveBeenCalledWith({
        type: "insert",
        value: {
          id: "user1-2",
          text: "Another user 1 task",
          completed: true,
          userId: "user1",
          createdAt: 2000,
          updatedAt: 2000,
        },
      });
    });
  });

  describe("End-to-End Application Scenarios", () => {
    it("should simulate a complete todo app lifecycle", async () => {
      const appStates = {
        initial: new Map([
          [
            "1",
            {
              id: "1",
              text: "Setup project",
              completed: true,
              userId: "user1",
              createdAt: 1000,
              updatedAt: 1000,
            },
          ],
        ]),
        afterUserAction: new Map([
          [
            "1",
            {
              id: "1",
              text: "Setup project",
              completed: true,
              userId: "user1",
              createdAt: 1000,
              updatedAt: 1000,
            },
          ],
          [
            "2",
            {
              id: "2",
              text: "Implement features",
              completed: false,
              userId: "user1",
              createdAt: 2000,
              updatedAt: 2000,
            },
          ],
        ]),
        afterCollaboration: new Map([
          [
            "1",
            {
              id: "1",
              text: "Setup project",
              completed: true,
              userId: "user1",
              createdAt: 1000,
              updatedAt: 1000,
            },
          ],
          [
            "2",
            {
              id: "2",
              text: "Implement features",
              completed: false,
              userId: "user1",
              createdAt: 2000,
              updatedAt: 2000,
            },
          ],
          [
            "3",
            {
              id: "3",
              text: "Review code",
              completed: false,
              userId: "user2",
              createdAt: 3000,
              updatedAt: 3000,
            },
          ],
        ]),
        afterCleanup: new Map([
          [
            "2",
            {
              id: "2",
              text: "Implement features",
              completed: true,
              userId: "user1",
              createdAt: 2000,
              updatedAt: 2500,
            },
          ],
          [
            "3",
            {
              id: "3",
              text: "Review code",
              completed: false,
              userId: "user2",
              createdAt: 3000,
              updatedAt: 3000,
            },
          ],
        ]),
      };

      let subscriptionCallback: (results: any) => void;

      mockClient.fetch.mockResolvedValue(appStates.initial);
      mockClient.subscribe.mockImplementation((query, callback) => {
        subscriptionCallback = callback;
        return () => {};
      });
      mockClient.insert.mockResolvedValue(undefined);
      mockClient.update.mockResolvedValue(undefined);
      mockClient.delete.mockResolvedValue(undefined);

      const collection = createTriplitCollection({
        client: mockClient as TriplitClient<AppModels>,
        query: mockQuery,
        getKey,
        id: "todo-app",
        onError,
      });

      const collectionConfig = mockCreateCollection.mock.calls[0][0];

      const mockSyncParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map(),
        },
      };

      const cleanup = collectionConfig.sync.sync(mockSyncParams);

      // 1. Initial load
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockSyncParams.markReady).toHaveBeenCalled();

      // 2. User adds a todo
      await collectionConfig.onInsert({
        transaction: {
          mutations: [
            {
              modified: {
                id: "2",
                text: "Implement features",
                completed: false,
                userId: "user1",
                createdAt: 2000,
                updatedAt: 2000,
              },
            },
          ],
        },
      });

      // 3. Real-time update reflects the addition
      mockSyncParams.collection.state = appStates.initial;
      subscriptionCallback!(appStates.afterUserAction);

      // 4. Collaborator adds their todo
      mockSyncParams.collection.state = appStates.afterUserAction;
      subscriptionCallback!(appStates.afterCollaboration);

      // 5. Complete and delete todos
      await collectionConfig.onUpdate({
        transaction: {
          mutations: [
            { key: "2", changes: { completed: true, updatedAt: 2500 } },
          ],
        },
      });

      await collectionConfig.onDelete({
        transaction: {
          mutations: [{ key: "1" }],
        },
      });

      // 6. Final state sync
      mockSyncParams.collection.state = appStates.afterCollaboration;
      subscriptionCallback!(appStates.afterCleanup);

      // Verify all operations were called
      expect(mockClient.insert).toHaveBeenCalledWith("todos", {
        id: "2",
        text: "Implement features",
        completed: false,
        userId: "user1",
        createdAt: 2000,
        updatedAt: 2000,
      });

      expect(mockClient.update).toHaveBeenCalledWith("todos", "2", {
        completed: true,
        updatedAt: 2500,
      });

      expect(mockClient.delete).toHaveBeenCalledWith("todos", "1");

      cleanup();
    });

    it("should handle complex error recovery scenario", async () => {
      let subscriptionCallback: (results: any) => void;
      let subscriptionErrorCallback: (error: any) => void;
      let reconnectCount = 0;

      // Simulate intermittent connection
      mockClient.fetch.mockImplementation(() => {
        if (reconnectCount < 2) {
          reconnectCount++;
          return Promise.reject(new Error("Connection failed"));
        }
        return Promise.resolve(
          new Map([
            [
              "recovery-1",
              {
                id: "recovery-1",
                text: "Recovered data",
                completed: false,
                userId: "user1",
                createdAt: 1000,
                updatedAt: 1000,
              },
            ],
          ]),
        );
      });

      mockClient.subscribe.mockImplementation(
        (query, callback, errorCallback) => {
          subscriptionCallback = callback;
          subscriptionErrorCallback = errorCallback;

          // Simulate connection issues then recovery
          setTimeout(() => {
            errorCallback(new Error("Subscription failed"));
          }, 10);

          setTimeout(() => {
            callback(
              new Map([
                [
                  "recovery-1",
                  {
                    id: "recovery-1",
                    text: "Recovered data",
                    completed: false,
                    userId: "user1",
                    createdAt: 1000,
                    updatedAt: 1000,
                  },
                ],
              ]),
            );
          }, 50);

          return () => {};
        },
      );

      const config = createTriplitCollectionOptions({
        client: mockClient,
        query: mockQuery,
        getKey,
        onError,
      });

      const mockSyncParams = {
        begin: vi.fn(),
        write: vi.fn(),
        commit: vi.fn(),
        markReady: vi.fn(),
        collection: {
          state: new Map(),
        },
      };

      config.sync.sync(mockSyncParams);

      // Wait for all async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Connection failed",
        }),
      );

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Subscription failed",
        }),
      );

      expect(mockSyncParams.markReady).toHaveBeenCalled();
      expect(mockSyncParams.write).toHaveBeenCalledWith({
        type: "insert",
        value: {
          id: "recovery-1",
          text: "Recovered data",
          completed: false,
          userId: "user1",
          createdAt: 1000,
          updatedAt: 1000,
        },
      });
    });
  });
});
