import { renderHook, act } from '@testing-library/react';
import { useSocket } from '../useSocket';
import { io } from 'socket.io-client';

jest.mock('socket.io-client');

const mockIo = io as jest.MockedFunction<typeof io>;

describe('useSocket', () => {
  let mockSocket: any;

  beforeEach(() => {
    mockSocket = {
      id: 'test-socket-id',
      connected: false,
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      io: {
        on: jest.fn(),
        off: jest.fn(),
      },
    };

    mockIo.mockReturnValue(mockSocket);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() =>
      useSocket('ws://localhost:3001', 'test-user')
    );

    expect(result.current.state).toBeNull();
    expect(result.current.connection.isConnected).toBe(false);
    expect(result.current.connection.isConnecting).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.reconnectionInfo.isReconnecting).toBe(false);
  });

  it('should connect to socket with correct options', () => {
    const options = {
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      room: 'test-room',
    };

    renderHook(() =>
      useSocket('ws://localhost:3001', 'test-user', options)
    );

    expect(mockIo).toHaveBeenCalledWith('ws://localhost:3001', expect.objectContaining({
      query: { userId: 'test-user', room: 'test-room' },
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
    }));
  });

  it('should handle connection events', () => {
    renderHook(() =>
      useSocket('ws://localhost:3001', 'test-user')
    );

    expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
  });

  it('should update state when receiving stateUpdate', () => {
    const { result } = renderHook(() =>
      useSocket<{ count: number }>('ws://localhost:3001', 'test-user')
    );

    const stateUpdateCallback = mockSocket.on.mock.calls.find(
      (call: any[]) => call[0] === 'stateUpdate'
    )?.[1];

    act(() => {
      stateUpdateCallback({ count: 42 });
    });

    expect(result.current.state).toEqual({ count: 42 });
  });

  it('should validate state when validator is provided', () => {
    const validator = jest.fn().mockReturnValue(false);
    const { result } = renderHook(() =>
      useSocket<{ count: number }>('ws://localhost:3001', 'test-user', {
        stateValidator: validator,
      })
    );

    const stateUpdateCallback = mockSocket.on.mock.calls.find(
      (call: any[]) => call[0] === 'stateUpdate'
    )?.[1];

    act(() => {
      stateUpdateCallback({ count: 42 });
    });

    expect(validator).toHaveBeenCalledWith({ count: 42 });
    expect(result.current.state).toBeNull();
    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.type).toBe('validation');
  });

  it('should emit updateState when socket is connected', async () => {
    mockSocket.connected = true;

    const { result } = renderHook(() =>
      useSocket<{ count: number }>('ws://localhost:3001', 'test-user')
    );

    const success = await act(async () => {
      return result.current.updateState({ count: 1 });
    });

    expect(success).toBe(true);
    expect(mockSocket.emit).toHaveBeenCalledWith('updateState', { count: 1 });
  });

  it('should return false when trying to update state while disconnected', async () => {
    mockSocket.connected = false;

    const { result } = renderHook(() =>
      useSocket<{ count: number }>('ws://localhost:3001', 'test-user')
    );

    const success = await act(async () => {
      return result.current.updateState({ count: 1 });
    });

    expect(success).toBe(false);
    expect(result.current.error?.type).toBe('connection');
  });

  it('should clear error when clearError is called', () => {
    const { result } = renderHook(() =>
      useSocket('ws://localhost:3001', 'test-user')
    );

    const connectErrorCallback = mockSocket.on.mock.calls.find(
      (call: any[]) => call[0] === 'connect_error'
    )?.[1];

    act(() => {
      connectErrorCallback(new Error('Connection failed'));
    });

    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it('should handle custom events with emit and on', () => {
    const { result } = renderHook(() =>
      useSocket('ws://localhost:3001', 'test-user')
    );

    mockSocket.connected = true;

    act(() => {
      result.current.emit('joinRoom', 'room-123');
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('joinRoom', 'room-123');

    const mockListener = jest.fn();
    let unsubscribe: () => void;

    act(() => {
      unsubscribe = result.current.on('userJoined', mockListener);
    });

    expect(mockSocket.on).toHaveBeenCalledWith('userJoined', mockListener);

    act(() => {
      unsubscribe();
    });

    expect(mockSocket.off).toHaveBeenCalledWith('userJoined', mockListener);
  });

  it('should not auto-connect when autoConnect is false', () => {
    renderHook(() =>
      useSocket('ws://localhost:3001', 'test-user', { autoConnect: false })
    );

    expect(mockIo).not.toHaveBeenCalled();
  });

  it('should cleanup on unmount', () => {
    const { unmount } = renderHook(() =>
      useSocket('ws://localhost:3001', 'test-user')
    );

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith('connect');
    expect(mockSocket.off).toHaveBeenCalledWith('disconnect');
    expect(mockSocket.off).toHaveBeenCalledWith('connect_error');
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  describe('connection events', () => {
    it('should handle successful connection', () => {
      const { result } = renderHook(() =>
        useSocket('ws://localhost:3001', 'test-user')
      );

      const connectCallback = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];

      act(() => {
        mockSocket.id = 'new-socket-id';
        connectCallback();
      });

      expect(result.current.connection.isConnected).toBe(true);
      expect(result.current.connection.isConnecting).toBe(false);
      expect(result.current.connection.connectionId).toBe('new-socket-id');
      expect(result.current.error).toBeNull();
    });

    it('should handle disconnection', () => {
      const { result } = renderHook(() =>
        useSocket('ws://localhost:3001', 'test-user')
      );

      const disconnectCallback = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'disconnect'
      )?.[1];

      act(() => {
        disconnectCallback('io server disconnect', { reason: 'forced' });
      });

      expect(result.current.connection.isConnected).toBe(false);
      expect(result.current.connection.disconnectReason).toBe('io server disconnect');
      expect(result.current.error?.type).toBe('connection');
    });

    it('should handle different connection error types', () => {
      const { result } = renderHook(() =>
        useSocket('ws://localhost:3001', 'test-user')
      );

      const connectErrorCallback = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect_error'
      )?.[1];

      act(() => {
        connectErrorCallback(new Error('timeout error'));
      });
      expect(result.current.error?.type).toBe('timeout');

      act(() => {
        connectErrorCallback(new Error('auth failed'));
      });
      expect(result.current.error?.type).toBe('authentication');

      act(() => {
        connectErrorCallback(new Error('unauthorized access'));
      });
      expect(result.current.error?.type).toBe('authorization');
    });
  });

  describe('reconnection handling', () => {
    it('should handle reconnection attempts', () => {
      const { result } = renderHook(() =>
        useSocket('ws://localhost:3001', 'test-user', {
          reconnectionAttempts: 3
        })
      );

      const reconnectAttemptCallback = mockSocket.io.on.mock.calls.find(
        (call: any[]) => call[0] === 'reconnect_attempt'
      )?.[1];

      act(() => {
        reconnectAttemptCallback(2);
      });

      expect(result.current.reconnectionInfo.isReconnecting).toBe(true);
      expect(result.current.reconnectionInfo.attempt).toBe(2);
      expect(result.current.reconnectionInfo.maxAttempts).toBe(3);
    });

    it('should handle reconnection failure', () => {
      const { result } = renderHook(() =>
        useSocket('ws://localhost:3001', 'test-user', {
          reconnectionAttempts: 3
        })
      );

      const reconnectFailedCallback = mockSocket.io.on.mock.calls.find(
        (call: any[]) => call[0] === 'reconnect_failed'
      )?.[1];

      act(() => {
        reconnectFailedCallback();
      });

      expect(result.current.reconnectionInfo.isReconnecting).toBe(false);
      expect(result.current.error?.type).toBe('connection');
      expect(result.current.error?.message).toContain('Failed to reconnect after 3 attempts');
    });

    it('should clear reconnection timer on reconnect', () => {
      const { result } = renderHook(() =>
        useSocket('ws://localhost:3001', 'test-user')
      );

      const reconnectAttemptCallback = mockSocket.io.on.mock.calls.find(
        (call: any[]) => call[0] === 'reconnect_attempt'
      )?.[1];

      const connectCallback = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];

      act(() => {
        reconnectAttemptCallback(1);
      });

      expect(result.current.reconnectionInfo.isReconnecting).toBe(true);

      act(() => {
        connectCallback();
      });

      expect(result.current.reconnectionInfo.isReconnecting).toBe(false);
      expect(result.current.reconnectionInfo.attempt).toBe(0);
    });
  });

  describe('state management', () => {
    it('should handle partial state updates', () => {
      const { result } = renderHook(() =>
        useSocket<{ count: number; name: string }>('ws://localhost:3001', 'test-user')
      );

      const stateUpdateCallback = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'stateUpdate'
      )?.[1];

      act(() => {
        stateUpdateCallback({ count: 10, name: 'initial' });
      });

      const partialUpdateCallback = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'statePartialUpdate'
      )?.[1];

      act(() => {
        partialUpdateCallback({ count: 15 });
      });

      expect(result.current.state).toEqual({ count: 15, name: 'initial' });
    });

    it('should validate partial state updates', () => {
      const validator = jest.fn().mockReturnValue(false);
      const { result } = renderHook(() =>
        useSocket<{ count: number }>('ws://localhost:3001', 'test-user', {
          stateValidator: validator,
        })
      );

      const stateUpdateCallback = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'stateUpdate'
      )?.[1];

      validator.mockReturnValueOnce(true);
      act(() => {
        stateUpdateCallback({ count: 10 });
      });

      const partialUpdateCallback = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'statePartialUpdate'
      )?.[1];

      validator.mockReturnValueOnce(false);
      act(() => {
        partialUpdateCallback({ count: -5 });
      });

      expect(result.current.state).toEqual({ count: 10 });
      expect(result.current.error?.type).toBe('validation');
    });

    it('should handle replaceState successfully', async () => {
      mockSocket.connected = true;
      const { result } = renderHook(() =>
        useSocket<{ count: number }>('ws://localhost:3001', 'test-user')
      );

      const success = await act(async () => {
        return result.current.replaceState({ count: 100 });
      });

      expect(success).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith('replaceState', { count: 100 });
    });

    it('should validate replaceState', async () => {
      mockSocket.connected = true;
      const validator = jest.fn().mockReturnValue(false);
      const { result } = renderHook(() =>
        useSocket<{ count: number }>('ws://localhost:3001', 'test-user', {
          stateValidator: validator,
        })
      );

      const success = await act(async () => {
        return result.current.replaceState({ count: -100 });
      });

      expect(success).toBe(false);
      expect(result.current.error?.type).toBe('validation');
      expect(mockSocket.emit).not.toHaveBeenCalledWith('replaceState', expect.anything());
    });

    it('should fail replaceState when disconnected', async () => {
      mockSocket.connected = false;
      const { result } = renderHook(() =>
        useSocket<{ count: number }>('ws://localhost:3001', 'test-user')
      );

      const success = await act(async () => {
        return result.current.replaceState({ count: 100 });
      });

      expect(success).toBe(false);
      expect(result.current.error?.type).toBe('connection');
    });
  });

  describe('error handling', () => {
    it('should handle server errors', () => {
      const { result } = renderHook(() =>
        useSocket('ws://localhost:3001', 'test-user')
      );

      const errorCallback = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'error'
      )?.[1];

      const errorPayload = {
        type: 'server' as const,
        message: 'Internal server error',
        code: 500,
        details: { timestamp: Date.now() }
      };

      act(() => {
        errorCallback(errorPayload);
      });

      expect(result.current.error?.type).toBe('server');
      expect(result.current.error?.message).toBe('Internal server error');
      expect(result.current.error?.details).toEqual(errorPayload.details);
    });

    it('should call custom error handler', () => {
      const errorHandler = jest.fn();
      renderHook(() =>
        useSocket('ws://localhost:3001', 'test-user', {
          errorHandler
        })
      );

      const connectErrorCallback = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect_error'
      )?.[1];

      act(() => {
        connectErrorCallback(new Error('Custom error'));
      });

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'connection',
        message: 'Custom error'
      }));
    });
  });

  describe('manual connection control', () => {
    it('should reconnect manually', () => {
      const { result } = renderHook(() =>
        useSocket('ws://localhost:3001', 'test-user')
      );

      act(() => {
        result.current.reconnect();
      });

      expect(mockSocket.connect).toHaveBeenCalled();
    });

    it('should disconnect manually', () => {
      mockSocket.connected = true;
      const { result } = renderHook(() =>
        useSocket('ws://localhost:3001', 'test-user')
      );

      act(() => {
        result.current.disconnect();
      });

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('namespaces and rooms', () => {
    it('should connect with namespace', () => {
      renderHook(() =>
        useSocket('ws://localhost:3001', 'test-user', {
          namespace: 'chat'
        })
      );

      expect(mockIo).toHaveBeenCalledWith('ws://localhost:3001/chat', expect.any(Object));
    });

    it('should join room on connection', () => {
      const { result } = renderHook(() =>
        useSocket('ws://localhost:3001', 'test-user', {
          room: 'room-123'
        })
      );

      const connectCallback = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];

      act(() => {
        connectCallback();
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('joinRoom', 'room-123');
    });
  });

  describe('logging', () => {
    it('should log when enabled', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      
      renderHook(() =>
        useSocket('ws://localhost:3001', 'test-user', {
          enableLogging: true
        })
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        '[useSocket:test-user] Connecting to socket...',
        { url: 'ws://localhost:3001' }
      );

      consoleSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('should handle emit when socket is disconnected', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockSocket.connected = false;
      
      const { result } = renderHook(() =>
        useSocket('ws://localhost:3001', 'test-user', {
          enableLogging: true
        })
      );

      act(() => {
        result.current.emit('customEvent', 'data');
      });

      expect(mockSocket.emit).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[useSocket:test-user] Cannot emit event: socket not connected',
        { event: 'customEvent', args: ['data'] }
      );

      consoleSpy.mockRestore();
    });

    it('should handle partial state update without existing state', () => {
      const { result } = renderHook(() =>
        useSocket<{ count: number }>('ws://localhost:3001', 'test-user')
      );

      const partialUpdateCallback = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'statePartialUpdate'
      )?.[1];

      act(() => {
        partialUpdateCallback({ count: 15 });
      });

      expect(result.current.state).toBeNull();
    });

    it('should handle updateState with try-catch error', async () => {
      mockSocket.connected = true;
      mockSocket.emit.mockImplementation(() => {
        throw new Error('Emit failed');
      });

      const { result } = renderHook(() =>
        useSocket<{ count: number }>('ws://localhost:3001', 'test-user')
      );

      const success = await act(async () => {
        return result.current.updateState({ count: 1 });
      });

      expect(success).toBe(false);
      expect(result.current.error?.type).toBe('unknown');
      expect(result.current.error?.message).toBe('Failed to send state update');
    });

    it('should handle replaceState with try-catch error', async () => {
      mockSocket.connected = true;
      mockSocket.emit.mockImplementation(() => {
        throw new Error('Emit failed');
      });

      const { result } = renderHook(() =>
        useSocket<{ count: number }>('ws://localhost:3001', 'test-user')
      );

      const success = await act(async () => {
        return result.current.replaceState({ count: 1 });
      });

      expect(success).toBe(false);
      expect(result.current.error?.type).toBe('unknown');
      expect(result.current.error?.message).toBe('Failed to send state replacement');
    });
  });
}); 