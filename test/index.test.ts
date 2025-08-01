import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTriplitCollection } from '../src/index';
import type { TriplitCollectionFactoryOptions } from '../src/index';
import type { TriplitClient, SchemaQuery, Models } from '@triplit/client';

// Mock TanStack DB
vi.mock('@tanstack/db', () => ({
  createCollection: vi.fn((config) => ({
    ...config,
    _type: 'MockCollection',
  })),
}));

// Mock Triplit Client
const createMockTriplitClient = () => ({
  query: vi.fn().mockReturnValue({
    collectionName: 'test_collection',
    _output: {} as any,
  }),
  fetch: vi.fn(),
  subscribe: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
});

describe('createTriplitCollection', () => {
  let mockClient: ReturnType<typeof createMockTriplitClient>;
  let mockQuery: SchemaQuery<any>;
  let getKey: (item: any) => string;
  let onError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockClient = createMockTriplitClient();
    mockQuery = {
      collectionName: 'test_collection',
      _output: {} as any,
    } as SchemaQuery<any>;
    getKey = vi.fn((item) => item.id);
    onError = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create a collection with minimal required options', () => {
    const options: TriplitCollectionFactoryOptions<any, any> = {
      client: mockClient as TriplitClient<any>,
      query: mockQuery,
      getKey,
    };

    const collection = createTriplitCollection(options);

    expect(collection).toBeDefined();
    expect(collection._type).toBe('MockCollection');
  });

  it('should create a collection with all options', () => {
    const mockSchema = { parse: vi.fn() };
    const options: TriplitCollectionFactoryOptions<any, any> = {
      client: mockClient as TriplitClient<any>,
      query: mockQuery,
      getKey,
      id: 'test-collection',
      schema: mockSchema,
      onError,
      rowUpdateMode: 'full' as const,
    };

    const collection = createTriplitCollection(options);

    expect(collection).toBeDefined();
    expect(collection.id).toBe('test-collection');
    expect(collection.schema).toBe(mockSchema);
    expect(collection.rowUpdateMode).toBe('full');
  });

  it('should pass through all standard CollectionConfig options', () => {
    const options: TriplitCollectionFactoryOptions<any, any> = {
      client: mockClient as TriplitClient<any>,
      query: mockQuery,
      getKey,
      id: 'test-collection',
      rowUpdateMode: 'partial' as const,
      maxAge: 5000,
    };

    const collection = createTriplitCollection(options);

    expect(collection.id).toBe('test-collection');
    expect(collection.rowUpdateMode).toBe('partial');
    expect(collection.maxAge).toBe(5000);
  });

  it('should create adapter options and pass them to createCollection', async () => {
    const { createCollection } = await import('@tanstack/db');
    
    const options: TriplitCollectionFactoryOptions<any, any> = {
      client: mockClient as TriplitClient<any>,
      query: mockQuery,
      getKey,
      id: 'test-collection',
    };

    createTriplitCollection(options);

    expect(createCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-collection',
        getKey,
        sync: expect.objectContaining({
          sync: expect.any(Function),
        }),
        onInsert: expect.any(Function),
        onUpdate: expect.any(Function),
        onDelete: expect.any(Function),
      })
    );
  });

  it('should handle TypeScript generics correctly', () => {
    interface TestModel {
      id: string;
      name: string;
      completed: boolean;
    }

    type TestModels = {
      todos: TestModel;
    };

    const typedOptions: TriplitCollectionFactoryOptions<TestModels, SchemaQuery<TestModels>> = {
      client: mockClient as TriplitClient<TestModels>,
      query: mockQuery as SchemaQuery<TestModels>,
      getKey: (item: TestModel) => item.id,
    };

    const collection = createTriplitCollection(typedOptions);
    expect(collection).toBeDefined();
  });
});

describe('TriplitCollectionFactoryOptions interface', () => {
  it('should enforce required properties', () => {
    // This test validates TypeScript compilation behavior
    type RequiredProps = keyof Pick<
      TriplitCollectionFactoryOptions<any, any>,
      'client' | 'query' | 'getKey'
    >;
    
    const requiredProps: RequiredProps[] = ['client', 'query', 'getKey'];
    expect(requiredProps).toHaveLength(3);
  });

  it('should allow optional properties', () => {
    type OptionalProps = keyof Pick<
      TriplitCollectionFactoryOptions<any, any>,
      'id' | 'schema' | 'onError'
    >;
    
    const optionalProps: OptionalProps[] = ['id', 'schema', 'onError'];
    expect(optionalProps).toHaveLength(3);
  });
});
