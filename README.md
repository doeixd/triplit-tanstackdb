[![NPM Version](https://img.shields.io/npm/v/triplit-tanstackdb)](https://www.npmjs.com/package/triplit-tanstackdb) [![Minzip Size](https://img.shields.io/bundlephobia/minzip/triplit-tanstackdb)](https://bundlephobia.com/package/triplit-tanstackdb) [![License](https://img.shields.io/npm/l/triplit-tanstackdb)](https://github.com/TanStack/db/blob/main/LICENSE)

# Triplit TanStack DB

Welcome! This is the primary guide for `triplit-tanstackdb`, a seamless, real-time collection for **TanStack DB** powered by the **[Triplit](https://www.triplit.dev/)** sync engine. This library provides the bridge to connect Triplit's real-time, offline-first power with the unified, reactive query engine of TanStack DB.

This first document covers the core concepts, the problems this library solves, and provides a quick start guide to get you up and running with your first real-time collection.

<br />

## Part 1: Table of Contents

1.  [What is This and Why Do I Need It?](#what-is-this-and-why-do-i-need-it)
2.  [The Solution: A Unified Data Fabric](#the-solution-a-unified-data-fabric)
3.  [Features](#features)
4.  [Understanding the Stack: A Mental Model](#understanding-the-stack-a-mental-model)
5.  [Installation & Setup](#installation--setup)
6.  [Quick Start: Your First Real-Time Collection](#quick-start-your-first-real-time-collection)
7.  [Next Steps](#next-steps)
8.  [Architectural Guide: Choosing Your Data Layer Strategy](#architectural-guide-choosing-your-data-layer-strategy)
9.  [Advanced Patterns & Recipes](#advanced-patterns--recipes)
    *   [Recipe 1: Creating "Views" from Complex Queries](#recipe-1-creating-views-from-complex-queries)
    *   [Recipe 2: The Hybrid Search Pattern (FTS/Vector)](#recipe-2-the-hybrid-search-pattern-ftsvector)
    *   [Recipe 3: Integrating Aggregations](#recipe-3-integrating-aggregations)
    *   [Recipe 4: The Unified Cross-Source Join](#recipe-4-the-unified-cross-source-join)
10.  [API Reference](#api-reference)
11.  [Frequently Asked Questions (FAQ)](#frequently-asked-questions-faq)
12.  [Contributing](#contributing)
13.  [Architectural Guide: TanStack DB, TanStack Query, and Triplit](#architectural-guide-tanstack-db-tanstack-query-and-triplit)

<br />

## What is This and Why Do I Need It?

Modern applications are rarely simple. As they grow, they often need to consume data from multiple, specialized backends. This leads to a common architectural challenge:

You have a **System of Record**: your traditional REST or GraphQL API, backed by a robust database like Postgres. It handles user accounts and transactional data.

You also have a **System of Engagement**: a real-time engine like Triplit, powering collaborative features and live dashboards with WebSockets.

This inevitably leads to a fragmented frontend. A single UI component might need data from both worlds, forcing you to write complex, brittle code to manage two completely different data-fetching lifecycles.

#### The Pain Point: The Fragmented Component

Without a unifying layer, your component code becomes a tangled mess of different data hooks, loading states, and error handling logic:

```typescript
// The old, fragmented way:
function TaskCard({ taskId, userId }) {
  // Hook for the real-time world, using Triplit's native hook...
  const { results: task, fetching: isLoadingTask } = useTriplitQuery(
    client.query('tasks').Id(taskId)
  );

  // Hook for the traditional API world...
  const { data: user, isLoading: isLoadingUser } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetch(`/api/users/${userId}`).then(res => res.json())
  });

  // Now you have to manage two separate loading states...
  if (isLoadingTask || isLoadingUser) return <TaskSkeleton />;

  // ...and two potential sources of error, with no easy way to join them.
  return (
    <div>
      <p>{task[0]?.title}</p>
      <p>Assignee: {user.name}</p>
    </div>
  );
}
```

This pattern creates components that are difficult to test, reuse, and reason about. This is the problem `triplit-tanstackdb` is designed to solve.

<br />

## The Solution: A Unified Data Fabric

`triplit-tanstackdb` allows you to treat your real-time Triplit data as just another **TanStack DB `Collection`**.

It provides an abstraction layer that harmonizes your disparate data sources. Once data is in a collection—whether from a REST API or a real-time Triplit stream—it speaks the same language. This enables you to build simple, powerful components that are completely unaware of the underlying data source complexity.

The true power of this is realized when you combine sources, but the foundation is a cleaner, more consistent way to work with your Triplit data.

<br />

## Features

-   **True Real-Time Reactivity:** Components update instantly via server push, with no polling needed.
-   **Automatic Optimistic Updates:** Deliver a snappy, native-like UI experience with automatic rollbacks on error.
-   **Conflict-Free by Default:** Leverages Triplit's CRDT-based sync to automatically handle concurrent writes from multiple users.
-   **Unified Query API:** Allows you to eventually join your real-time Triplit data with data from any other source (REST APIs, GraphQL, `localStorage`).
-   **Robust Offline-First:** Built on top of Triplit's powerful offline cache and mutation outbox.
-   **Seamless Integration:** Get started in seconds with a single, elegant factory function.

<br />

## Understanding the Stack: A Mental Model

It's helpful to think of these libraries' roles using a car analogy:

| Library | Role | Analogy |
|---|---|---|
| **TanStack Query** | Server Cache & Network Manager | The robust gas engine |
| **Triplit Client** | Real-Time Sync Engine | The high-performance electric motor |
| **TanStack DB** | Reactive UI Data Layer | The unified cockpit & dashboard |
| **`triplit-tanstackdb`**| The Bridge | The specialized wiring harness |

This library is the wiring harness that plugs your powerful Triplit "electric motor" into the unified "dashboard" of TanStack DB.

<br />

## Installation & Setup

### 1. Installation

This package has peer dependencies that need to be installed:
```bash
npm install @tanstack/db @tanstack/react-db @triplit/client triplit-tanstackdb
# or
yarn add @tanstack/db @tanstack/react-db @triplit/client triplit-tanstackdb
```
*Note: For the hybrid patterns discussed in Part 2, you will also need `@tanstack/react-query` and `@tanstack/query-collection`.*

### 2. Provider Setup

Your application's root component should include the provider for the Triplit client.

```tsx
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { TriplitProvider } from '@triplit/react';
import { client } from './triplitClient'; // Your initialized Triplit client
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TriplitProvider client={client}>
      <App />
    </TriplitProvider>
  </React.StrictMode>,
);
```
<br />

## Quick Start: Your First Real-Time Collection

This guide will walk you through creating and using a real-time `todos` collection.

### 1. Configure Your Triplit Client

First, ensure your Triplit client is configured for a robust offline experience by specifying `'indexeddb'` storage. This persists the cache and mutation outbox across browser sessions.

```typescript
// src/triplitClient.ts
import { TriplitClient } from '@triplit/client';
import { schema } from '../triplit/schema'; // Your Triplit schema

export const client = new TriplitClient({
  schema,
  serverUrl: import.meta.env.VITE_TRIPLIT_SERVER_URL,
  token: import.meta.env.VITE_TRIPLIT_TOKEN,
  // This is crucial for a true offline-first experience.
  storage: 'indexeddb', 
});
```

### 2. Create the Collection

Next, use the `createTriplitCollection` factory in a dedicated collections file.

```typescript
// src/collections.ts
import { createTriplitCollection } from 'triplit-tanstackdb';
import { client } from './triplitClient';
import { todoSchema } from '../triplit/schemas'; // An optional Zod schema

// Define the Triplit query for the data you want to sync.
const allTodosQuery = client.query('todos').order('createdAt', 'ASC');

// Create the TanStack DB collection using the factory.
export const todosCollection = createTriplitCollection({
  // --- Required Options ---
  client,
  query: allTodosQuery,
  getKey: (todo) => todo.id,
  
  // --- Recommended Options ---
  id: 'todos',
  schema: todoSchema,
  
  // --- Optional Error Handling ---
  onError: (error) => {
    console.error("A sync error occurred in the todos collection:", error);
  },
});
```

### 3. Read & Write Data in Your Component

With the collection created, you can now build a fully featured component that reads and writes data with a clean, declarative API.

```tsx
// src/components/TodoList.tsx
import { useLiveQuery } from '@tanstack/react-db';
import { q } from '@tanstack/db';
import { todosCollection } from '../collections';
import { client } from '../triplitClient';

export function TodoList() {
  const { data: todos, isLoading } = useLiveQuery(() =>
    q.from({ todo: todosCollection }).select(({ todo }) => todo)
  );

  const addTodo = (text: string) => {
    // This UI update is immediate and optimistic.
    todosCollection.insert({
      id: client.id(), // Use Triplit's ID generator
      text,
      completed: false,
      createdAt: new Date(),
    });
  };

  const toggleTodo = (todo) => {
    // Updates are also instant.
    todosCollection.update(todo.id, { completed: !todo.completed });
  };
  
  const deleteTodo = (todoId: string) => {
    // Deletes are also instant.
    todosCollection.delete(todoId);
  };

  // This `isLoading` state is only true during the very initial data load.
  if (isLoading) {
    return <div>Loading your todos...</div>;
  }

  return (
    <div>
      {/* Your form to call addTodo */}
      <ul>
        {todos?.map((todo) => (
          <li key={todo.id}>
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo)}
            />
            <span style={{ textDecoration: todo.completed ? 'line-through' : 'none' }}>
              {todo.text}
            </span>
            <button onClick={() => deleteTodo(todo.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```
If any mutation fails on the server, TanStack DB will automatically roll back the optimistic update, ensuring your UI always reflects the true state of your data.


<br />

## Architectural Guide: Choosing Your Data Layer Strategy

The key to using this ecosystem effectively is to choose the right tool for the right job. A TanStack DB `Collection` is your reactive UI store, but the way you populate it—your "adapter"—determines its behavior.

| Pattern | Data Flow Model | Real-Time? | Best For... |
| :--- | :--- | :--- | :--- |
| **A: Query + DB** (`@tanstack/query-collection`) | **Pull** | **No** (Simulated via Polling) | Collections from traditional REST/GraphQL APIs. |
| **B: Triplit + DB (This Lib)**| **Push** | **Yes** (Event-Driven & Instant) | Collections from a real-time sync engine like Triplit. |
| **C: Triplit in Query (Advanced)** | **Pull** | **No** | **Anti-Pattern** for entity collections. **Best Practice** for one-off aggregations or computations. |

This guide will now provide recipes for these patterns.

<br />

## Advanced Patterns & Recipes

### Recipe 1: Creating "Views" from Complex Queries

The `query` you pass to `createTriplitCollection` can be as complex as Triplit allows. This enables you to create collections that act as specific, pre-filtered "views" of your data that stay in sync automatically.

```typescript
// src/collections/urgent-tasks.collection.ts

// A complex query to find high-priority tasks with recent comments for a specific user.
const myUrgentTasksQuery = client.query('tasks')
  .where('priority', '>', 3)
  .where('assigneeId', '=', 'user-123')
  .include({
    comments: {
      _extends: 'comments', // The relationship name
      where: [
        ['createdAt', '>', new Date(Date.now() - 1000 * 60 * 60 * 24)] // in last 24h
      ],
      limit: 5,
      order: [['createdAt', 'DESC']],
    }
  });

// This collection will ONLY ever contain items that match this query.
// It will stay in sync automatically as data changes to match or un-match the criteria.
export const myUrgentTasksCollection = createTriplitCollection({
  client,
  query: myUrgentTasksQuery,
  getKey: (task) => task.id,
  id: 'myUrgentTasks',
});
```

### Recipe 2: The Hybrid Search Pattern (FTS/Vector)

This is the gold standard for a great search experience. It uses the best of both worlds: Triplit's specialized search engine for efficient computation, and TanStack DB for a live, reactive view of the results.

This is a two-step pattern:
1.  Use **TanStack Query (`useQuery`)** to execute a fast, one-time Triplit search to get back an array of entity IDs.
2.  Use **TanStack DB (`useLiveQuery`)** to reactively display the full, live entities that match those IDs.

```typescript
// src/components/SearchableTasks.tsx
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from '@tanstack/react-db';
import { q, inArray } from '@tanstack/db';
import { tasksCollection } from '../collections'; // The collection from Part 1
import { client } from '../triplitClient';

function SearchableTasks() {
  const [searchText, setSearchText] = useState('');

  // Step 1: Use TanStack Query to fetch just the IDs from Triplit's search engine.
  // This is a fast, indexed search on the server that we cache on the client.
  const { data: matchingTaskIds, isLoading: isSearching } = useQuery({
    queryKey: ['taskSearch', searchText],
    // Assuming Triplit provides a specialized search method like 'fts' or via its HttpClient
    queryFn: () => client.someSearchMethod('tasks', searchText, { select: ['id'] }),
    enabled: searchText.length > 2,
  });

  // Step 2: Use TanStack DB to create a live, reactive "view" of the results.
  // This query runs instantly on the client against the data you already have.
  const { data: searchResults } = useLiveQuery({
    query: (builder) =>
      builder
        .from({ task: tasksCollection })
        .where(({ task }) => inArray(task.id, matchingTaskIds ?? [])), // Pluck items by ID
    enabled: !!matchingTaskIds,
  });

  return (
    <div>
      <input
        type="search" value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder="Search tasks..."
      />
      {isSearching && <p>Searching...</p>}
      <ul>
        {/* The UI is fully reactive. If a task in the results is updated by
            a collaborator, it will re-render here instantly, without a new search. */}
        {searchResults?.map(task => <li key={task.id}>{task.title}</li>)}
      </ul>
    </div>
  );
}
```

### Recipe 3: Integrating Aggregations

While aggregations (like `count` or `avg`) don't naturally fit into a collection of *entities*, you should use the "Direct Query Pattern" with TanStack Query to fetch, cache, and display them.

```typescript
// src/components/ProjectStats.tsx
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from '@tanstack/react-db';
import { q } from '@tanstack/db';
import { tasksCollection } from '../collections';
import { client } from '../triplitClient';

function ProjectStats() {
  // For live, detailed data where we have all the entities, we use TanStack DB
  const { data: completedTasksCount } = useLiveQuery(() =>
    q.from(tasksCollection)
      .where(({ task }) => task.completed === true)
      .select(tasks => tasks.length) // `select` can derive any shape
  );

  // For heavy aggregations across the entire dataset, we use TanStack Query directly with Triplit
  const { data: totalValue } = useQuery({
    queryKey: ['projectTotalValue'],
    // This assumes Triplit offers an aggregation method, or you could call a custom
    // server endpoint that uses Triplit's HttpClient.
    queryFn: () => client.aggregate('tasks', { sum: 'value' }),
    refetchInterval: 60000, // Refetch total value every minute
  });

  return (
    <div>
      {/* This count updates instantly and optimistically */}
      <p>Live Completed Tasks: {completedTasksCount}</p>

      {/* This value updates periodically based on its refetch interval */}
      <p>Total Project Value: ${totalValue}</p>
    </div>
  );
}
```

### Recipe 4: The Unified Cross-Source Join

This is the ultimate expression of the data fabric, combining a real-time collection with one from a traditional API.

```typescript
// src/collections/users.collection.ts (using @tanstack/query-collection)
import { queryCollectionOptions } from '@tanstack/query-collection';
export const usersCollection = createCollection(
  queryCollectionOptions({
    queryKey: ['users'],
    queryFn: () => fetch('/api/users').then(res => res.json()),
    getKey: user => user.id,
  })
);

// src/components/TaskWithAssignee.tsx
import { tasksCollection } from './tasks.collection'; // From Triplit
import { usersCollection } from './users.collection'; // From REST API

function TaskWithAssignee({ taskId }) {
  // A single, declarative query that joins data across two backends.
  const { data: taskWithUser } = useLiveQuery((q) =>
    q.from({ task: tasksCollection, user: usersCollection })
      .where(({ task }) => eq(task.id, taskId))
      .join(({ task, user }) => eq(task.assigneeId, user.id))
      // Shape the data exactly as the component needs it
      .select(({ task, user }) => ({ ...task, assignee: user }))
  );
  
  // This component will reactively update if either the task data changes in
  // real-time, OR if the user data is updated after a background refetch!
}
```

<br />

## API Reference

The primary API is the `createTriplitCollection` factory function.

| Option | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `client` | `TriplitClient` | Yes | An instance of the configured TriplitClient. |
| `query` | `SchemaQuery` | Yes | The Triplit query that defines the data to be synced. |
| `getKey` | `(item) => string \| number` | Yes | A function that returns a unique, stable ID for a given item. |
| `id` | `string` | No | A unique ID for the collection, highly recommended for dev tools and debugging. |
| `schema` | `StandardSchema` | No | A schema (e.g., from Zod) to enable full, end-to-end type safety for mutations. |
| `onError`| `(error) => void` | No | A callback to handle errors from the sync engine or mutations. |
| *...others* | `Omit<...>` | No | All other standard `CollectionConfig` options (like `rowUpdateMode`) are passed through. |


<br />


## Frequently Asked Questions (FAQ)

**1. How does this compare to a server-side solution like GraphQL?**
GraphQL Gateways unify APIs on the **server**. The TanStack DB data fabric unifies data sources on the **client**. They are complementary. You could use this library to consume data from a Triplit source *and* your company's central GraphQL API in the same `useLiveQuery` join.

**2. How does offline support work?**
This adapter fully leverages Triplit's powerful local-first architecture. When offline:
*   **Reads:** `client.subscribe` serves data from Triplit's local cache.
*   **Writes:** `collection.insert()` resolves optimistically, and the change is queued in Triplit's outbox.
*   **Syncing:** Upon reconnection, the Triplit client automatically handles syncing the outbox. The adapter ensures this flow is seamlessly reflected in the TanStack DB collection.

**3. What about performance? Is all this abstraction slow?**
No. This pattern is highly performant. `useLiveQuery` joins and filters operate on **in-memory** data that has already been synced to the client. These are sub-millisecond operations powered by a differential dataflow engine. The library does not introduce any network bottlenecks.

**4. How are optimistic update race conditions handled?**
The adapter contains specific logic to be "optimistic-aware." It tracks pending optimistic mutations submitted to TanStack DB and ensures that an incoming server snapshot does not incorrectly discard a user's change before it's been confirmed, preventing UI flicker and ensuring a smooth, reliable experience.


<br />

## Contributing

We are open to contributions! Please open an issue or submit a pull request.


<br />

## Architectural Guide: TanStack DB, TanStack Query, and Triplit

Welcome to the definitive guide on the modern TanStack data layer. This document will provide a clear mental model for understanding the distinct but complementary roles of **TanStack DB**, **TanStack Query**, and a real-time sync engine like **Triplit**.

You will learn not just what each tool does, but *how* and *why* you should use them together to build sophisticated, high-performance, and resilient web applications.

### The Mental Model: A High-Performance Hybrid Car

The easiest way to understand the roles of these libraries is with an analogy. Think of your application as a high-performance hybrid car, where each library is a specialized component designed to do one job perfectly.

| Library | Role | Analogy |
|---|---|---|
| **TanStack Query** | Server Cache & Network Manager | The robust **Gasoline Engine**. It’s the workhorse for communicating with your traditional REST/GraphQL API. It handles the request/response cycle, caching fuel (data), and provides reliable power on any road (network condition). |
| **Triplit Client** | Real-Time Sync Engine | The high-performance **Electric Motor**. It's a specialized, self-contained unit that provides instantaneous, silent power (real-time updates) via a direct, persistent connection (WebSockets). It has its own battery (`localStorage`) and regenerative braking (offline outbox). |
| **TanStack DB** | Reactive UI Data Layer | The unified **Cockpit & Dashboard**. This is the interface your driver (your UI components) interacts with. It doesn't care if the power is coming from the gas engine or the electric motor. It takes data from all sources and presents it on a single, coherent, and always up-to-date dashboard. |
| **`@tanstack/triplit-collection`**| The Bridge / Adapter | The specialized **Wiring Harness & Power Controller**. This library is the sophisticated controller that allows the electric motor (Triplit) to seamlessly integrate with the universal dashboard (TanStack DB), ensuring they speak the same language. |

This model makes it clear: these are not competing tools. They are specialized components of a complete system.


### The Recipes: Creating Your Collections

A TanStack DB `Collection` is your reactive container. The strategy you use to fill it determines its behavior. Here are the three primary recipes.

#### Recipe 1: Collection from a TanStack Query (The Standard Model)

This is the foundational pattern for working with any traditional API.

*   **When to Use It:** Your data comes from a standard REST or GraphQL endpoint. You need best-in-class caching, background refetching, and an offline-first experience for a traditional client-server architecture.
*   **How It Works (The "Pull" Model):** `TanStack Query` is in charge. It *pulls* data from your API when needed, caches it, and pipes it into the TanStack DB collection. Real-time updates are achieved by configuring Query to *poll* your API at an interval.
*   **Offline & Sync:** TanStack Query handles this brilliantly. Reads are served from its cache. Writes are queued as "paused mutations" and are automatically synced when the network returns.
*   **Performance:** Excellent for request/response APIs. Caching eliminates redundant fetches. At very large scale, high-frequency polling can be less efficient than WebSockets, but for most apps, it's a perfect fit.

**The Code:**
```typescript
import { createCollection } from '@tanstack/db';
import { queryCollectionOptions } from '@tanstack/query-collection';

export const usersCollection = createCollection(
  queryCollectionOptions({
    queryKey: ['users'],
    queryFn: () => fetch('/api/users').then(res => res.json()),
    getKey: (user) => user.id,
    onInsert: async ({ transaction }) => { /* ... POST to /api/users ... */ },
  })
);
```

#### Recipe 2: Collection from a Triplit Query (The Real-Time Model)

This is the primary pattern for this library, designed for true real-time backends.

*   **When to Use It:** Your data comes from Triplit, and you need instantaneous, push-based updates, along with Triplit's robust, CRDT-based offline capabilities.
*   **How It Works (The "Push" Model):** The `createTriplitCollection` adapter establishes a persistent WebSocket connection via `client.subscribe()`. When data changes on the backend, the server *pushes* a new snapshot of the results to the client. The adapter receives this push and updates the collection.
*   **Offline & Sync:** Triplit's client handles this natively. Reads are served from its local `indexeddb` cache. Writes are queued in its offline "outbox." Upon reconnection, Triplit's sync protocol intelligently reconciles the changes. Our adapter simply leverages this power.
*   **Performance:** Superior for real-time data. Pushing deltas or snapshots over a single, persistent connection is vastly more efficient than repeatedly polling a stateless HTTP endpoint.

**The Code:**
```typescript
import { createTriplitCollection } from '@tanstack/triplit-collection';
import { client } from './my-triplit-client';

export const tasksCollection = createTriplitCollection({
  client,
  query: client.query('tasks').where('status', '!=', 'archived'),
  getKey: (task) => task.id,
});
```

#### Recipe 3: The Hybrid Pattern (Using Triplit inside TanStack Query)

This is an advanced technique. Understanding when and when *not* to do this is crucial.

##### **Part 3a: The Anti-Pattern (for Live Entities)**

You should **NOT** use TanStack Query as the primary manager for a collection of live entities from Triplit.

```typescript
// --- AVOID THIS PATTERN FOR ENTITY COLLECTIONS ---
export const badTasksCollection = createCollection(
  queryCollectionOptions({
    queryKey: ['tasksFromTriplit'],
    // This uses a one-time fetch, not a live subscription!
    queryFn: () => client.fetch(client.query('tasks')),
    getKey: (task) => task.id,
  })
);
```
**Why it's wrong:** This pattern discards the primary benefit of Triplit—its real-time, push-based architecture. It turns your live data source back into a "Pull" model that will only update if you manually refetch or poll, which is inefficient and negates the power of the WebSocket connection.

##### **Part 3b: The Power Pattern (for FTS, Aggregations, and Computations)**

This pattern is the best practice for integrating Triplit's specialized query capabilities (like Full-Text Search or complex aggregations) into a reactive UI. It's a powerful two-step dance:

1.  Use **TanStack Query** to execute a fast, one-time Triplit computation and get back a result (like a list of IDs or a single aggregate value).
2.  Use **TanStack DB (`useLiveQuery`)** to reactively display the full, live entities that match those results.

**The Code (Creating a Reactive Search "View"):**
```typescript
function SearchableTasks({ searchText }) {
  // Step 1: Use TanStack Query to fetch just the IDs from Triplit's FTS engine.
  // This is a fast, cached, one-time request.
  const { data: matchingTaskIds } = useQuery({
    queryKey: ['taskSearch', searchText],
    queryFn: () => client.fts.search('tasks', searchText, { select: ['id'] }),
    enabled: searchText.length > 2,
  });

  // Step 2: Use TanStack DB to create a live, reactive "view" of those results.
  // This runs instantly on the client against the data you already have in your real-time collection.
  const { data: searchResults } = useLiveQuery({
    query: (q) => q.from(tasksCollection).where((t) => inArray(t.id, matchingTaskIds ?? [])),
    enabled: !!matchingTaskIds,
  });

  // ... render search results
}
```
**Why it's right:** This gives you the best of both worlds: Triplit's specialized engine for heavy computation and TanStack DB's instantaneous reactivity for the UI.

---

### The Ultimate Power: A Unified Query API

The final payoff for this architecture is the ability to create a single, unified query API for your components, allowing you to harness the power of both your existing API and Triplit simultaneously.

Imagine a feature where you must display a "Payment Issue" badge (from your Postgres DB via a REST API) on a task in your real-time Triplit project board.

**The Code (The Grand Finale):**
```typescript
// collections.ts
import { usersCollection } from './users.collection'; // Recipe 1
import { tasksCollection } from './tasks.collection'; // Recipe 2

// component.tsx
function ProjectBoard() {
  const { data: atRiskTasks } = useLiveQuery((q) =>
    q
      .from({
        tasks: tasksCollection,           // From Triplit (real-time)
        users: usersCollection,           // From REST API (near real-time)
      })
      // Join the live tasks with the transactional user/payment data...
      .join(({ t, u }) => eq(t.assigneeId, u.id))
      // ...and filter in real-time to find only the problem cases.
      .where(({ u }) => eq(u.paymentStatus, 'failed'))
      .select(({ t }) => t) // Select the full task object
  );

  const atRiskTaskIds = new Set(atRiskTasks.map(t => t.id));

  // In your main board render logic:
  // <TaskCard isAtRisk={atRiskTaskIds.has(task.id)} />
}
```
This is the pinnacle of the modern data layer. The `atRiskTasks` list is **live**. If a user's payment fails and the `usersCollection` updates on the next background refetch, the badge will appear automatically. If a task is reassigned in real-time via Triplit, the badge will appear or disappear instantly.

This level of dynamic, cross-source reactivity, built on a foundation of simple, composable tools, is the new standard for building ambitious web applications.




<!--

Of course. Here are the "Advanced Examples" and an updated "Frequently Asked Questions" section for the README. This content is designed to answer the questions of power users and showcase the true potential of the unified data fabric architecture.

---

## Advanced Examples

The true power of this library is unlocked when you move beyond simple data display and start orchestrating data from multiple sources. Here are some advanced patterns that demonstrate what's possible.

### Example 1: Joining Real-Time Data with a Traditional REST API

This is the killer feature of the unified data fabric. Imagine your `usersCollection` is powered by a traditional REST API (via `@tanstack/query-collection`), but your `tasksCollection` is real-time via Triplit. You can join them seamlessly.

```typescript
// src/collections.ts
import { createTriplitCollection } from '@tanstack/triplit-collection';
import { createQueryCollection } from '@tanstack/query-collection';
import { client } from './triplitClient';

// A real-time collection from Triplit
export const tasksCollection = createTriplitCollection({
  client,
  query: client.query('tasks'),
  getKey: (task) => task.id,
  id: 'tasks',
});

// A standard collection from a REST API
export const usersCollection = createCollection(
  queryCollectionOptions({
    queryKey: ['users'],
    queryFn: () => fetch('/api/users').then(res => res.json()),
    getKey: (user) => user.id,
    id: 'users',
  })
);
```

```typescript
// src/components/TaskWithAssignee.tsx
import { useLiveQuery } from '@tanstack/react-db';
import { q, eq } from '@tanstack/db';
import { tasksCollection, usersCollection } from '../collections';

function TaskWithAssignee({ taskId }) {
  // A single, declarative query that joins data across two backends.
  const { data: taskWithUser } = useLiveQuery((q) =>
    q
      .from({
        task: tasksCollection,      // From Triplit (real-time)
        user: usersCollection,      // From your REST API
      })
      .where(({ task }) => eq(task.id, taskId))
      .join(({ task, user }) => eq(task.assigneeId, user.id))
      .select(({ task, user }) => ({
        ...task,
        assignee: user,
      }))
  );

  // This component will reactively update if either the task data changes in
  // real-time, OR if the user data is updated after a background refetch!
  return (
    <div>
      <h3>{taskWithUser.title}</h3>
      <p>Status: {taskWithUser.status}</p>
      <p>Assignee: {taskWithUser.assignee.name}</p>
    </div>
  );
}
```

### Example 2: Reactive UI from a Full-Text Search (FTS)

This pattern provides a best-of-both-worlds search experience. Triplit's powerful FTS engine performs the initial search, and TanStack DB provides a live, reactive view of the results.

```typescript
// src/components/SearchableTasks.tsx
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from '@tanstack/react-db';
import { q, inArray } from '@tanstack/db';
import { tasksCollection } from '../collections';
import { client } from '../triplitClient';

function SearchableTasks() {
  const [searchText, setSearchText] = useState('');

  // Step 1: Use TanStack Query to fetch just the IDs from Triplit's FTS engine.
  // This is a fast, indexed search.
  const { data: matchingTaskIds } = useQuery({
    queryKey: ['taskSearch', searchText],
    queryFn: () => client.fts.search('tasks', searchText, { select: ['id'] }),
    enabled: searchText.length > 2,
  });

  // Step 2: Use TanStack DB to get the live, reactive results for those IDs.
  // This query runs instantly on the client against the data you already have.
  const { data: searchResults } = useLiveQuery({
    query: (builder) =>
      builder
        .from({ task: tasksCollection })
        .where(({ task }) => inArray(task.id, matchingTaskIds ?? [])),
    enabled: !!matchingTaskIds,
  });

  return (
    <div>
      <input 
        type="search"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder="Search tasks..."
      />
      <ul>
        {/* The UI is fully reactive. If a task in the results is updated,
            it will re-render here instantly, without a new search. */}
        {searchResults?.map(task => <li key={task.id}>{task.title}</li>)}
      </ul>
    </div>
  );
}
```

### Example 3: Handling Complex Triplit Queries (Creating "Views")

The `query` you pass to `createTriplitCollection` can be as complex as you need. This allows you to create collections that act as pre-filtered "views" of your data.

```typescript
// src/collections.ts

// A complex query to find high-priority tasks with recent comments for a specific user.
const myUrgentTasksQuery = client.query('tasks')
  .where('priority', '>', 3)
  .where('assigneeId', '=', 'user-123')
  .include({
    comments: {
      _extends: 'comments',
      where: [
        ['createdAt', '>', new Date(Date.now() - 1000 * 60 * 60 * 24)] // in last 24h
      ],
      limit: 5
    }
  });

// This collection will now only ever contain items that match that specific, complex query.
// It will stay in sync automatically as data changes to match or un-match the criteria.
export const myUrgentTasksCollection = createTriplitCollection({
  client,
  query: myUrgentTasksQuery,
  getKey: (task) => task.id,
  id: 'myUrgentTasks',
});
```

### Example 4: Integrating Aggregations

While aggregations (like `count` or `avg`) don't naturally fit into a collection of *entities*, you can easily integrate them into your components using the "Direct Query Pattern" with TanStack Query.

```typescript
// src/components/ProjectStats.tsx
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from '@tanstack/react-db';
import { q } from '@tanstack/db';
import { tasksCollection } from '../collections';
import { client } from '../triplitClient';

function ProjectStats() {
  // For live, detailed data, we use TanStack DB
  const { data: completedTasksCount } = useLiveQuery(() =>
    q.from(tasksCollection)
      .where(({ task }) => task.completed === true)
      .select(tasks => tasks.length)
  );

  // For heavy aggregations, we use TanStack Query directly with Triplit
  const { data: totalValue } = useQuery({
    queryKey: ['projectTotalValue'],
    queryFn: () => client.aggregate('tasks', { sum: 'value' }),
    refetchInterval: 60000, // Refetch total value every minute
  });

  return (
    <div>
      {/* This count updates instantly and optimistically */}
      <p>Live Completed Tasks: {completedTasksCount}</p>
      
      {/* This value updates periodically */}
      <p>Total Project Value: ${totalValue}</p>
    </div>
  );
}
```
This hybrid approach gives you the best of both worlds: instantaneous reactivity for your core data, and efficient, cached results for heavier computations.

## Frequently Asked Questions (Expanded)

**1. Why do I need this? Why not just use the Triplit client directly in my components?**

You certainly can for simple cases! However, this library becomes invaluable when:
*   **You need to combine Triplit data with other sources:** The `useLiveQuery` join capability is something you cannot replicate easily with separate data hooks.
*   **You want to build a decoupled component library:** This allows your UI components to be completely ignorant of the data source, making them more reusable and testable.
*   **You value a consistent query API:** Using `useLiveQuery` for all your component's data needs creates a clean, consistent, and predictable pattern across your entire application.

**2. How does this compare to a server-side solution like GraphQL?**

They solve different problems.
*   **GraphQL Gateways** unify multiple APIs on the **server**, presenting a single API endpoint to the client. This is excellent for standardizing *data fetching*.
*   **This Library + TanStack DB** unifies multiple data sources on the **client**, creating a *reactive, real-time, offline-capable* data layer.

They are not mutually exclusive. You could absolutely use this library to consume data from a Triplit source *and* a GraphQL source in the same `useLiveQuery` join.

**3. What happens to offline support?**

This adapter is designed to fully embrace Triplit's powerful offline capabilities. Triplit's client manages its own offline cache and mutation outbox. When your device is offline:
*   **Reads:** The `client.subscribe` will immediately return the last known data from Triplit's local cache.
*   **Writes:** Calls to `collection.insert()` will resolve optimistically. The adapter will call `client.insert()`, which will add the change to Triplit's outbox.
*   **Syncing:** When the connection is restored, the Triplit client will automatically handle syncing the outbox and receiving any new changes, which will then flow through the adapter into your collections.

The user experience is seamless.

**4. How are optimistic update race conditions handled?**

The adapter includes specific logic to prevent optimistic UI flicker. It is aware of pending optimistic mutations that have been submitted to TanStack DB but not yet confirmed by the Triplit subscription. It ensures that a server snapshot arriving in this intermediate state does not incorrectly remove the optimistic item from the UI, ensuring a smooth and reliable user experience.

-->
