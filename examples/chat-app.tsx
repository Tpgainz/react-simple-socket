import React, { useState, useCallback } from 'react';
import { useSocket } from '../src/service/useSocket';

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  content: string;
  timestamp: Date;
}

interface ChatState {
  messages: ChatMessage[];
  onlineUsers: Array<{ id: string; username: string }>;
  typingUsers: string[];
  roomInfo: {
    id: string;
    name: string;
    memberCount: number;
  };
}

interface ChatAppProps {
  serverUrl: string;
  userId: string;
  username: string;
  roomId: string;
}

export function ChatApp({ serverUrl, userId, username, roomId }: ChatAppProps) {
  const [messageInput, setMessageInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const validateChatState = useCallback((state: any): state is ChatState => {
    return (
      state &&
      Array.isArray(state.messages) &&
      Array.isArray(state.onlineUsers) &&
      Array.isArray(state.typingUsers) &&
      state.roomInfo &&
      typeof state.roomInfo.id === 'string'
    );
  }, []);

  const {
    state,
    connection,
    error,
    reconnectionInfo,
    updateState,
    clearError,
    emit,
    on
  } = useSocket<ChatState>(
    serverUrl,
    userId,
    {
      room: roomId,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      enableLogging: true,
      stateValidator: validateChatState,
      errorHandler: (error) => {
        console.error('Chat error:', error);
      },
    }
  );

  React.useEffect(() => {
    const unsubscribeTyping = on('userTyping', (typingUserId: string) => {
      if (state) {
        updateState({
          typingUsers: [...state.typingUsers, typingUserId].filter(
            (id, index, arr) => arr.indexOf(id) === index
          )
        });
      }
    });

    const unsubscribeStoppedTyping = on('userStoppedTyping', (userId: string) => {
      if (state) {
        updateState({
          typingUsers: state.typingUsers.filter(id => id !== userId)
        });
      }
    });

    return () => {
      unsubscribeTyping();
      unsubscribeStoppedTyping();
    };
  }, [on, state, updateState]);

  const sendMessage = useCallback(async () => {
    if (!messageInput.trim() || !connection.isConnected) return;

    const message: ChatMessage = {
      id: `msg_${Date.now()}_${userId}`,
      userId,
      username,
      content: messageInput.trim(),
      timestamp: new Date(),
    };

    const success = await updateState({
      messages: [...(state?.messages || []), message]
    });

    if (success) {
      setMessageInput('');
      if (isTyping) {
        emit('stopTyping', userId);
        setIsTyping(false);
      }
    }
  }, [messageInput, connection.isConnected, userId, username, state?.messages, updateState, isTyping, emit]);

  const handleTyping = useCallback((value: string) => {
    setMessageInput(value);
    
    if (value.length > 0 && !isTyping) {
      setIsTyping(true);
      emit('startTyping', userId);
    } else if (value.length === 0 && isTyping) {
      setIsTyping(false);
      emit('stopTyping', userId);
    }
  }, [isTyping, emit, userId]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  if (error) {
    return (
      <div className="chat-error">
        <div className="error-content">
          <h3>❌ Chat Error</h3>
          <p><strong>Type:</strong> {error.type}</p>
          <p><strong>Message:</strong> {error.message}</p>
          <p><strong>Time:</strong> {error.timestamp.toLocaleTimeString()}</p>
          {error.details && (
            <details>
              <summary>Error Details</summary>
              <pre>{JSON.stringify(error.details, null, 2)}</pre>
            </details>
          )}
          <div className="error-actions">
            <button onClick={clearError}>Dismiss</button>
            <button onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-app">
      <header className="chat-header">
        <div className="room-info">
          <h2>💬 {state?.roomInfo.name || 'Loading...'}</h2>
          <span className="member-count">
            👥 {state?.roomInfo.memberCount || 0} members
          </span>
        </div>
        
        <ConnectionStatus 
          connection={connection}
          reconnectionInfo={reconnectionInfo}
        />
      </header>

      <div className="chat-content">
        <aside className="online-users">
          <h3>Online ({state?.onlineUsers.length || 0})</h3>
          <ul>
            {state?.onlineUsers.map(user => (
              <li key={user.id} className={user.id === userId ? 'current-user' : ''}>
                <span className="user-status">🟢</span>
                {user.username}
                {user.id === userId && ' (you)'}
              </li>
            ))}
          </ul>
        </aside>

        <main className="chat-messages">
          <div className="messages-container">
            {state?.messages.map(message => (
              <div 
                key={message.id} 
                className={`message ${message.userId === userId ? 'own-message' : ''}`}
              >
                <div className="message-header">
                  <span className="username">{message.username}</span>
                  <span className="timestamp">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="message-content">{message.content}</div>
              </div>
            ))}
          </div>

          {state?.typingUsers && state.typingUsers.length > 0 && (
            <div className="typing-indicator">
              💭 {state.typingUsers.join(', ')} 
              {state.typingUsers.length === 1 ? ' is' : ' are'} typing...
            </div>
          )}

          <div className="message-input">
            <textarea
              value={messageInput}
              onChange={(e) => handleTyping(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message... (Enter to send)"
              disabled={!connection.isConnected}
              rows={3}
            />
            <button 
              onClick={sendMessage}
              disabled={!connection.isConnected || !messageInput.trim()}
            >
              Send 📤
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

interface ConnectionStatusProps {
  connection: any;
  reconnectionInfo: any;
}

function ConnectionStatus({ connection, reconnectionInfo }: ConnectionStatusProps) {
  if (connection.isConnected) {
    return (
      <div className="status connected">
        🟢 Connected
        {connection.connectedAt && (
          <small> since {connection.connectedAt.toLocaleTimeString()}</small>
        )}
      </div>
    );
  }

  if (reconnectionInfo.isReconnecting) {
    return (
      <div className="status reconnecting">
        🟡 Reconnecting... 
        ({reconnectionInfo.attempt}/{reconnectionInfo.maxAttempts})
        {reconnectionInfo.nextRetryIn > 0 && (
          <small> retry in {Math.ceil(reconnectionInfo.nextRetryIn / 1000)}s</small>
        )}
      </div>
    );
  }

  return (
    <div className="status disconnected">
      🔴 Disconnected
      {connection.lastDisconnectedAt && (
        <small> at {connection.lastDisconnectedAt.toLocaleTimeString()}</small>
      )}
    </div>
  );
}

export default ChatApp; 