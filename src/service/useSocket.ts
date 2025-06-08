import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  SocketError,
  SocketErrorPayload,
  ReconnectionInfo,
  SocketConnectionState,
  UseSocketOptions,
  UseSocketReturn,
} from './types';

type SocketInstance<TState> = Socket<ServerToClientEvents<TState>, ClientToServerEvents<TState>>;

function generateErrorId(): string {
  return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function createSocketError(payload: SocketErrorPayload): SocketError {
  return {
    ...payload,
    timestamp: new Date(),
    id: generateErrorId(),
  };
}

export function useSocket<TState = any>(
  socketUrl: string,
  userId: string,
  options: UseSocketOptions = {}
): UseSocketReturn<TState> {
  const {
    reconnectionAttempts = 5,
    reconnectionDelay = 1000,
    reconnectionDelayMax = 5000,
    enableLogging = false,
    namespace,
    room,
    autoConnect = true,
    stateValidator,
    errorHandler,
    ...socketOptions
  } = options;

  const [state, setState] = useState<TState | null>(null);
  const [connection, setConnection] = useState<SocketConnectionState>({
    isConnected: false,
    isConnecting: false,
  });
  const [error, setError] = useState<SocketError | null>(null);
  const [reconnectionInfo, setReconnectionInfo] = useState<ReconnectionInfo>({
    attempt: 0,
    maxAttempts: reconnectionAttempts,
    nextRetryIn: 0,
    isReconnecting: false,
  });

  const socketRef = useRef<SocketInstance<TState> | null>(null);
  const reconnectionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventListenersRef = useRef<Map<string, Function>>(new Map());

  const log = useCallback(
    (level: 'info' | 'warn' | 'error', message: string, ...args: any[]) => {
      if (enableLogging) {
        console[level](`[useSocket:${userId}] ${message}`, ...args);
      }
    },
    [enableLogging, userId]
  );

  const handleError = useCallback(
    (errorPayload: SocketErrorPayload) => {
      const socketError = createSocketError(errorPayload);
      setError(socketError);
      errorHandler?.(socketError);
      log('error', 'Socket error:', socketError);
    },
    [errorHandler, log]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearReconnectionTimer = useCallback(() => {
    if (reconnectionTimerRef.current) {
      clearInterval(reconnectionTimerRef.current);
      reconnectionTimerRef.current = null;
    }
  }, []);

  const socketUrl_with_namespace = useMemo(() => {
    return namespace ? `${socketUrl}/${namespace}` : socketUrl;
  }, [socketUrl, namespace]);



  useEffect(() => {
    if (!autoConnect) return;

    const socket: SocketInstance<TState> = io(socketUrl_with_namespace, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts,
      reconnectionDelay,
      reconnectionDelayMax,
      query: { userId, room },
      autoConnect,
      ...socketOptions,
    });
    socketRef.current = socket;

    setConnection(prev => ({ ...prev, isConnecting: true }));
    log('info', 'Connecting to socket...', { url: socketUrl_with_namespace });

    socket.on('connect', () => {
      const now = new Date();
      setConnection({
        isConnected: true,
        isConnecting: false,
        connectionId: socket.id || undefined,
        connectedAt: now,
      });
      setError(null);
      setReconnectionInfo(prev => ({
        ...prev,
        attempt: 0,
        isReconnecting: false,
        nextRetryIn: 0,
      }));
      clearReconnectionTimer();
      log('info', 'Connected successfully', { socketId: socket.id });

      if (room) {
        socket.emit('joinRoom', room);
        log('info', 'Joined room', { room });
      }
    });

    socket.on('disconnect', (reason, details) => {
      const now = new Date();
      setConnection(prev => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
        lastDisconnectedAt: now,
        disconnectReason: reason,
      }));
      log('warn', 'Disconnected', { reason, details });

      if (reason === 'io server disconnect') {
        handleError({
          type: 'connection',
          message: 'Server forcibly disconnected the socket',
          details: { reason, details },
        });
      }
    });

    socket.on('connect_error', (err) => {
      setConnection(prev => ({ ...prev, isConnecting: false }));
      
      let errorType: SocketError['type'] = 'connection';
      if (err.message.includes('timeout')) errorType = 'timeout';
      if (err.message.includes('auth')) errorType = 'authentication';
      if (err.message.includes('unauthorized')) errorType = 'authorization';

      handleError({
        type: errorType,
        message: err.message,
        details: { originalError: err },
      });
    });

    socket.io.on('reconnect_attempt', (attemptNumber: number) => {
      setReconnectionInfo(prev => ({
        ...prev,
        attempt: attemptNumber,
        isReconnecting: true,
        maxAttempts: reconnectionAttempts,
      }));

      clearReconnectionTimer();
      const delay = Math.min(reconnectionDelay * Math.pow(2, attemptNumber - 1), reconnectionDelayMax);
      let timeLeft = delay;

      log('info', 'Reconnection attempt', { attempt: attemptNumber, delay });

      reconnectionTimerRef.current = setInterval(() => {
        timeLeft = Math.max(0, timeLeft - 1000);
        setReconnectionInfo(prev => ({
          ...prev,
          nextRetryIn: timeLeft,
        }));

        if (timeLeft <= 0) {
          clearReconnectionTimer();
        }
      }, 1000);
    });

    socket.io.on('reconnect_failed', () => {
      clearReconnectionTimer();
      setReconnectionInfo(prev => ({
        ...prev,
        isReconnecting: false,
        nextRetryIn: 0,
      }));
      
      handleError({
        type: 'connection',
        message: `Failed to reconnect after ${reconnectionAttempts} attempts`,
        details: { maxAttempts: reconnectionAttempts },
      });
    });

    socket.on('stateUpdate', (newState: TState) => {
      if (stateValidator && !stateValidator(newState)) {
        handleError({
          type: 'validation',
          message: 'Received state failed validation',
          details: { state: newState },
        });
        return;
      }
      setState(newState);
      log('info', 'State updated from server', newState);
    });

    socket.on('statePartialUpdate', (update: Partial<TState>) => {
      setState(prev => {
        if (!prev) return prev;
        const newState = { ...prev, ...update };
        
        if (stateValidator && !stateValidator(newState)) {
          handleError({
            type: 'validation',
            message: 'Updated state failed validation',
            details: { update, previousState: prev },
          });
          return prev;
        }
        
        return newState;
      });
      log('info', 'State partially updated from server', update);
    });

    socket.on('error', (errorPayload: SocketErrorPayload) => {
      handleError(errorPayload);
    });

    return () => {
      clearReconnectionTimer();
      eventListenersRef.current.clear();
      
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('stateUpdate');
      socket.off('statePartialUpdate');
      socket.off('error');
      socket.io.off('reconnect_attempt');
      socket.io.off('reconnect_failed');
      
      socket.disconnect();
      log('info', 'Socket disconnected and cleaned up');
    };
  }, [
    socketUrl_with_namespace,
    userId,
    autoConnect,
    reconnectionAttempts,
    reconnectionDelayMax,
    reconnectionDelay,
    room,
  ]);

  const updateState = useCallback(
    async (update: Partial<TState>): Promise<boolean> => {
      const socket = socketRef.current;
      
      if (!socket?.connected) {
        handleError({
          type: 'connection',
          message: 'Cannot update state: socket not connected',
          details: { update },
        });
        return false;
      }

      try {
        socket.emit('updateState', update);
        log('info', 'State update sent', update);
        return true;
      } catch (err) {
        handleError({
          type: 'unknown',
          message: 'Failed to send state update',
          details: { update, error: err },
        });
        return false;
      }
    },
    [handleError, log]
  );

  const replaceState = useCallback(
    async (newState: TState): Promise<boolean> => {
      const socket = socketRef.current;
      
      if (!socket?.connected) {
        handleError({
          type: 'connection',
          message: 'Cannot replace state: socket not connected',
          details: { newState },
        });
        return false;
      }

      try {
        if (stateValidator && !stateValidator(newState)) {
          handleError({
            type: 'validation',
            message: 'New state failed validation',
            details: { newState },
          });
          return false;
        }

        socket.emit('replaceState', newState);
        log('info', 'State replacement sent', newState);
        return true;
      } catch (err) {
        handleError({
          type: 'unknown',
          message: 'Failed to send state replacement',
          details: { newState, error: err },
        });
        return false;
      }
    },
    [stateValidator, handleError, log]
  );

  const reconnect = useCallback(() => {
    const socket = socketRef.current;
    if (socket) {
      log('info', 'Manual reconnection triggered');
      socket.connect();
    }
  }, [log]);

  const disconnect = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.connected) {
      log('info', 'Manual disconnection triggered');
      socket.disconnect();
    }
  }, [log]);

  const emit = useCallback(
    <TEvent extends keyof ClientToServerEvents<TState>>(
      event: TEvent,
      ...args: Parameters<ClientToServerEvents<TState>[TEvent]>
    ) => {
      const socket = socketRef.current;
      if (socket?.connected) {
        socket.emit(event as string, ...args);
        log('info', 'Custom event emitted', { event, args });
      } else {
        log('warn', 'Cannot emit event: socket not connected', { event, args });
      }
    },
    [log]
  );

  const on = useCallback(
    <TEvent extends keyof ServerToClientEvents<TState>>(
      event: TEvent,
      listener: ServerToClientEvents<TState>[TEvent]
    ): (() => void) => {
      const socket = socketRef.current;
      if (socket) {
        socket.on(event as string, listener);
        const key = `${String(event)}_${Date.now()}`;
        eventListenersRef.current.set(key, () => socket.off(event as string, listener));
        
        log('info', 'Event listener added', { event });
        
        return () => {
          socket.off(event as string, listener);
          eventListenersRef.current.delete(key);
          log('info', 'Event listener removed', { event });
        };
      }
      
      return () => {};
    },
    [log]
  );

  return {
    state,
    connection,
    error,
    reconnectionInfo,
    updateState,
    replaceState,
    clearError,
    reconnect,
    disconnect,
    emit,
    on,
  };
}