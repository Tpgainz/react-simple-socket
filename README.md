# useSocket

> **A simple React hook wrapper around Socket.IO client**

Just a convenient TypeScript hook that handles the boilerplate of connecting Socket.IO to React state. Nothing fancy, just less repetitive code.

[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What it does

- Wraps Socket.IO client in a React hook
- Manages connection state for you  
- Provides TypeScript types for common patterns
- Handles basic reconnection logic
- Saves you from writing the same Socket.IO + useState code repeatedly

## What it doesn't do

- Magic state synchronization (you still need a server)
- Conflict resolution or optimistic updates
- Performance optimization beyond basic Socket.IO
- Production-ready state management patterns

## Installation

```bash
npm install @tpgainz/socket-events
```

## Usage

Instead of this repetitive setup every time:

```typescript
const [socket, setSocket] = useState(null);
const [connected, setConnected] = useState(false);
const [data, setData] = useState(null);

useEffect(() => {
  const s = io('ws://localhost:3001');
  s.on('connect', () => setConnected(true));
  s.on('data', setData);
  setSocket(s);
  return () => s.disconnect();
}, []);
```

Just do this:

```typescript
import { useSocket } from '@tpgainz/socket-events';

function GameRoom() {
  const {
    state,
    connection,
    updateState,
    emit,
    on
  } = useSocket<GameState>('ws://localhost:3001', 'user123');

  if (!connection.isConnected) {
    return <div>Connecting...</div>;
  }

  return (
    <div>
      <h2>Score: {state?.score || 0}</h2>
      <button onClick={() => updateState({ score: (state?.score || 0) + 1 })}>
        +1 Point
      </button>
    </div>
  );
}
```

## API

```typescript
const {
  state,                    // Current state from server
  connection,               // { isConnected, connectionId, etc. }
  error,                    // Current error (if any)
  reconnectionInfo,         // Reconnection status
  
  updateState,              // Send partial state update
  replaceState,             // Replace entire state
  clearError,               // Clear error state
  reconnect,                // Manual reconnection
  disconnect,               // Manual disconnection
  
  emit,                     // Emit Socket.IO events
  on                        // Listen to Socket.IO events
} = useSocket<TState>(socketUrl, userId, options);
```

### Options

```typescript
interface UseSocketOptions {
  reconnectionAttempts?: number;        // Default: 5
  reconnectionDelay?: number;           // Default: 1000ms
  autoConnect?: boolean;                // Default: true
  enableLogging?: boolean;              // Default: false
  namespace?: string;                   // Socket.IO namespace
  room?: string;                        // Auto-join room
  stateValidator?: (state: any) => boolean;
  errorHandler?: (error: SocketError) => void;
  
  // All Socket.IO client options are also supported
}
```

## When to use this

✅ You're prototyping with Socket.IO and React  
✅ You want basic TypeScript types for Socket.IO events  
✅ You're tired of writing the same connection boilerplate  
✅ You need simple state updates from server events  

❌ You're building production real-time features (use proper libraries)  
❌ You need optimistic updates or conflict resolution  
❌ You want advanced state management (use Zustand/Redux + Socket.IO)  
❌ You need performance optimization for high-frequency updates  

## Alternatives to consider

For production apps, you probably want:
- Raw Socket.IO + your preferred state management library
- Libraries like Liveblocks for collaborative features  
- Socket.IO with proper optimistic update patterns

## Example

See `examples/chat-app.tsx` for a complete chat implementation.

## Contributing

This is a simple utility I built for my own projects. Feel free to fork it if it's useful, but don't expect enterprise support or feature development.
