import { ManagerOptions, SocketOptions } from 'socket.io-client';

export type SocketEventMap = Record<string, (...args: any[]) => void>;

export interface ServerToClientEvents<TState = any> extends SocketEventMap {
  stateUpdate: (state: TState) => void;
  statePartialUpdate: (update: Partial<TState>) => void;
  error: (error: SocketErrorPayload) => void;
  userJoined: (userId: string) => void;
  userLeft: (userId: string) => void;
}

export interface ClientToServerEvents<TState = any> extends SocketEventMap {
  updateState: (update: Partial<TState>) => void;
  replaceState: (state: TState) => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: (roomId: string) => void;
}

export type SocketErrorType = 
  | 'connection'
  | 'timeout' 
  | 'authentication'
  | 'authorization'
  | 'validation'
  | 'server'
  | 'network'
  | 'unknown';

export interface SocketErrorPayload {
  type: SocketErrorType;
  message: string;
  code?: string | number;
  details?: Record<string, any>;
}

export interface SocketError extends SocketErrorPayload {
  timestamp: Date;
  id: string;
}

export interface ReconnectionInfo {
  attempt: number;
  maxAttempts: number;
  nextRetryIn: number;
  isReconnecting: boolean;
  lastFailureReason?: string;
}

export interface SocketConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  connectionId?: string | undefined;
  connectedAt?: Date | undefined;
  lastDisconnectedAt?: Date | undefined;
  disconnectReason?: string | undefined;
}

export interface UseSocketOptions extends Partial<ManagerOptions & SocketOptions> {
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
  enableLogging?: boolean;
  namespace?: string;
  room?: string;
  autoConnect?: boolean;
  stateValidator?: (state: any) => boolean;
  errorHandler?: (error: SocketError) => void;
}

export interface UseSocketReturn<TState> {
  state: TState | null;
  connection: SocketConnectionState;
  error: SocketError | null;
  reconnectionInfo: ReconnectionInfo;
  
  updateState: (update: Partial<TState>) => Promise<boolean>;
  replaceState: (state: TState) => Promise<boolean>;
  clearError: () => void;
  reconnect: () => void;
  disconnect: () => void;
  
  emit: <TEvent extends keyof ClientToServerEvents<TState>>(
    event: TEvent,
    ...args: Parameters<ClientToServerEvents<TState>[TEvent]>
  ) => void;
  
  on: <TEvent extends keyof ServerToClientEvents<TState>>(
    event: TEvent,
    listener: ServerToClientEvents<TState>[TEvent]
  ) => () => void;
}

