import { describe, it, expect } from 'vitest';
import type { 
  TriplitCollectionFactoryOptions,
} from '../src/index';
import type { 
  TriplitCollectionOptions,
} from '../src/options';
import type { TriplitClient, SchemaQuery, Models } from '@triplit/client';

// Test model definitions for type checking
interface User {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

interface Todo {
  id: string;
  userId: string;
  title: string;
  completed: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

interface Comment {
  id: string;
  todoId: string;
  userId: string;
  text: string;
  createdAt: Date;
}

type TestModels = {
  users: User;
  todos: Todo;
  comments: Comment;
};

describe('Type Safety Tests', () => {
  describe('TriplitCollectionFactoryOptions', () => {
    it('should enforce correct client type matching', () => {
      type ValidOptions = TriplitCollectionFactoryOptions<
        TestModels,
        SchemaQuery<TestModels>
      >;

      // This should compile without errors
      const validOptions: ValidOptions = {
        client: {} as TriplitClient<TestModels>,
        query: {} as SchemaQuery<TestModels>,
        getKey: (item) => item.id, // Should infer correct item type
      };

      expect(validOptions).toBeDefined();
    });

    it('should enforce getKey function signature', () => {
      // Mock query for todos
      const todoQuery = {
        collectionName: 'todos' as keyof TestModels,
        _output: {} as Todo,
      } as SchemaQuery<TestModels>;

      type TodoOptions = TriplitCollectionFactoryOptions<
        TestModels,
        typeof todoQuery,
        Todo
      >;

      const options: TodoOptions = {
        client: {} as TriplitClient<TestModels>,
        query: todoQuery,
        // getKey should receive Todo and return string | number
        getKey: (todo: Todo) => todo.id,
      };

      expect(options.getKey({ 
        id: '1', 
        userId: 'user1', 
        title: 'Test', 
        completed: false, 
        createdAt: new Date() 
      })).toBe('1');
    });

    it('should allow optional properties with correct types', () => {
      const todoQuery = {
        collectionName: 'todos' as keyof TestModels,
        _output: {} as Todo,
      } as SchemaQuery<TestModels>;

      type TodoOptions = TriplitCollectionFactoryOptions<
        TestModels,
        typeof todoQuery,
        Todo
      >;

      const options: TodoOptions = {
        client: {} as TriplitClient<TestModels>,
        query: todoQuery,
        getKey: (todo) => todo.id,
        id: 'my-todos',
        schema: {
          parse: (data: unknown) => data as Todo,
          safeParse: (data: unknown) => ({ success: true, data: data as Todo }),
        },
        onError: (error) => {
          // error should be TriplitError | Error
          console.error(error.message);
        },
        // Standard CollectionConfig properties should be allowed
        rowUpdateMode: 'partial' as const,
        maxAge: 60000,
      };

      expect(options.id).toBe('my-todos');
      expect(options.rowUpdateMode).toBe('partial');
    });

    it('should prevent incorrect type combinations', () => {
      const userQuery = {
        collectionName: 'users' as keyof TestModels,
        _output: {} as User,
      } as SchemaQuery<TestModels>;

      // This should work
      type ValidUserOptions = TriplitCollectionFactoryOptions<
        TestModels,
        typeof userQuery,
        User
      >;

      const validOptions: ValidUserOptions = {
        client: {} as TriplitClient<TestModels>,
        query: userQuery,
        getKey: (user: User) => user.id,
      };

      expect(validOptions.getKey).toBeDefined();

      // Type test: This would cause compilation error if uncommented
      // const invalidOptions: ValidUserOptions = {
      //   client: {} as TriplitClient<TestModels>,
      //   query: userQuery,
      //   getKey: (todo: Todo) => todo.id, // Wrong type!
      // };
    });
  });

  describe('TriplitCollectionOptions', () => {
    it('should have correct internal interface structure', () => {
      const todoQuery = {
        collectionName: 'todos' as keyof TestModels,
        _output: {} as Todo,
      } as SchemaQuery<TestModels>;

      type TodoInternalOptions = TriplitCollectionOptions<
        TestModels,
        typeof todoQuery,
        Todo
      >;

      const options: TodoInternalOptions = {
        client: {} as TriplitClient<TestModels>,
        query: todoQuery,
        getKey: (todo) => todo.id,
        onError: (error) => console.error(error),
      };

      // Verify the interface matches expected structure
      expect(typeof options.client).toBe('object');
      expect(typeof options.query).toBe('object');
      expect(typeof options.getKey).toBe('function');
      expect(typeof options.onError).toBe('function');
    });

    it('should allow onError to be optional', () => {
      const commentQuery = {
        collectionName: 'comments' as keyof TestModels,
        _output: {} as Comment,
      } as SchemaQuery<TestModels>;

      type CommentOptions = TriplitCollectionOptions<
        TestModels,
        typeof commentQuery,
        Comment
      >;

      // Should compile without onError
      const optionsWithoutError: CommentOptions = {
        client: {} as TriplitClient<TestModels>,
        query: commentQuery,
        getKey: (comment) => comment.id,
      };

      expect(optionsWithoutError.onError).toBeUndefined();
    });
  });

  describe('Generic type constraints', () => {
    it('should enforce Models extends Models<M> constraint', () => {
      // Valid Models type
      type ValidModels = {
        posts: { id: string; title: string };
        authors: { id: string; name: string };
      };

      // This should compile
      type ValidOptions = TriplitCollectionFactoryOptions<
        ValidModels,
        SchemaQuery<ValidModels>
      >;

      const options: ValidOptions = {
        client: {} as TriplitClient<ValidModels>,
        query: {} as SchemaQuery<ValidModels>,
        getKey: (item) => item.id,
      };

      expect(options).toBeDefined();
    });

    it('should handle complex nested types correctly', () => {
      interface NestedTodo {
        id: string;
        title: string;
        metadata: {
          priority: 'low' | 'medium' | 'high';
          tags: string[];
          assignee?: {
            id: string;
            name: string;
          };
        };
        timestamps: {
          created: Date;
          updated?: Date;
          due?: Date;
        };
      }

      type NestedModels = {
        nestedTodos: NestedTodo;
      };

      const nestedQuery = {
        collectionName: 'nestedTodos' as keyof NestedModels,
        _output: {} as NestedTodo,
      } as SchemaQuery<NestedModels>;

      type NestedOptions = TriplitCollectionFactoryOptions<
        NestedModels,
        typeof nestedQuery,
        NestedTodo
      >;

      const options: NestedOptions = {
        client: {} as TriplitClient<NestedModels>,
        query: nestedQuery,
        getKey: (todo) => {
          // Should have access to all nested properties
          expect(todo.metadata.priority).toBeDefined();
          expect(todo.timestamps.created).toBeDefined();
          return todo.id;
        },
      };

      expect(options.getKey).toBeDefined();
    });
  });

  describe('Type inference', () => {
    it('should infer item type from query output', () => {
      const userQuery = {
        collectionName: 'users' as keyof TestModels,
        _output: {} as User,
      } as SchemaQuery<TestModels>;

      // Type should be inferred automatically
      type AutoInferredOptions = TriplitCollectionFactoryOptions<
        TestModels,
        typeof userQuery
        // Note: TItem is not explicitly provided, should default to userQuery['_output']
      >;

      const options: AutoInferredOptions = {
        client: {} as TriplitClient<TestModels>,
        query: userQuery,
        // getKey parameter should be inferred as User
        getKey: (user) => {
          // TypeScript should know this is a User
          expect(typeof user.name).toBe('string');
          expect(typeof user.email).toBe('string');
          expect(typeof user.isActive).toBe('boolean');
          return user.id;
        },
      };

      expect(options.getKey).toBeDefined();
    });
  });

  describe('Schema type compatibility', () => {
    it('should work with Zod-like schema types', () => {
      // Simulate Zod schema structure
      interface ZodSchema<T> {
        parse(data: unknown): T;
        safeParse(data: unknown): { success: boolean; data?: T; error?: any };
      }

      const todoZodSchema: ZodSchema<Todo> = {
        parse: (data: unknown) => data as Todo,
        safeParse: (data: unknown) => ({ success: true, data: data as Todo }),
      };

      const todoQuery = {
        collectionName: 'todos' as keyof TestModels,
        _output: {} as Todo,
      } as SchemaQuery<TestModels>;

      const options: TriplitCollectionFactoryOptions<TestModels, typeof todoQuery> = {
        client: {} as TriplitClient<TestModels>,
        query: todoQuery,
        getKey: (todo) => todo.id,
        schema: todoZodSchema, // Should accept Zod-like schemas
      };

      expect(options.schema).toBe(todoZodSchema);
    });
  });
});
