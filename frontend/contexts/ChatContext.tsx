/**
 * ChatContext provides global chat state management
 *
 * Features:
 * - Manages chat rooms list
 * - Manages active WebSocket connection
 * - Handles real-time message updates
 * - Provides methods for sending messages
 * - Supports pagination for message history
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';

import type {
  ChatRoom,
  ChatRoomByUser,
  ChatMessage,
  DisplayMessage,
  ReceiveMessagePayload,
} from '@/types/chat';
import type { UserProfile } from '@/types/user';

import {
  ChatWebSocket,
  createChatWebSocket,
  type WebSocketStatus,
} from '@/services/chat-websocket';

import {
  getChatRoomsByUser,
  getChatRoomById,
  getMessagesByChatRoom,
  separateChatRoomsByStatus,
} from '@/services/chat-service';

import { getOrderById, type Order } from '@/services/order-service';
import { getUserProfile } from '@/services/user-service';

export type ChatRowMetadata = {
  title: string;
  meta: string;
  preview: string;
  picture: string | null;
  initial: string;
};

type ChatContextType = {
  // Chat rooms
  activeChatRooms: ChatRoomByUser[];
  closedChatRooms: ChatRoomByUser[];
  roomMetadataById: Record<string, ChatRowMetadata>;
  isLoadingRooms: boolean;
  isLoadingMoreRooms: boolean;
  hasMoreRooms: boolean;
  roomsError: string | null;
  refreshChatRooms: (userId: string) => Promise<void>;
  loadMoreChatRooms: () => Promise<void>;

  // Active chat
  activeChatRoomId: string | null;
  activeOrderId: string | null;
  messages: DisplayMessage[];
  isLoadingMessages: boolean;
  isLoadingMoreMessages: boolean;
  hasMoreMessages: boolean;
  messagesError: string | null;
  connectionStatus: WebSocketStatus;

  // Other user in chat
  otherUser: UserProfile | null;
  isLoadingOtherUser: boolean;

  // Actions
  ensureRoomMetadata: (room: ChatRoomByUser, userId: string) => Promise<void>;
  openChat: (chatRoomId: string, userId: string) => Promise<void>;
  closeChat: () => void;
  sendMessage: (content: string) => boolean;
  loadMoreMessages: () => Promise<void>;
};

const ChatContext = createContext<ChatContextType | null>(null);

export function useChatContext(): ChatContextType {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
}

type ChatProviderProps = {
  children: ReactNode;
};

function getInitial(name?: string | null): string {
  return name?.trim().charAt(0).toUpperCase() || '?';
}

function formatOrderTitle(order?: Order): string {
  const firstItem = order?.items?.[0]?.name?.trim();
  const itemCount = order?.items?.length ?? 0;

  if (!firstItem) {
    return 'Order conversation';
  }

  if (itemCount <= 1) {
    return firstItem;
  }

  return `${firstItem} +${itemCount - 1} more`;
}

function shortenAddress(address?: string): string | null {
  if (!address) return null;

  const firstSegment = address.split(',')[0]?.trim();
  if (!firstSegment) return null;

  return firstSegment.length > 28
    ? `${firstSegment.slice(0, 28).trimEnd()}...`
    : firstSegment;
}

function formatOrderPreview(order?: Order, isBuyer?: boolean): string {
  if (!order) {
    return 'Open conversation';
  }

  switch (order.status) {
    case 'PENDING':
      return isBuyer ? 'Looking for a runner' : 'Waiting to be accepted';
    case 'ACCEPTED': {
      const address = shortenAddress(order.drop_off?.address);
      if (!address) {
        return 'Delivery in progress';
      }
      return isBuyer ? `On the way to ${address}` : `Drop-off at ${address}`;
    }
    case 'COMPLETED':
      return 'Order completed';
    case 'CANCELLED':
      return 'Order cancelled';
    case 'MIA':
      return 'Order marked missing';
    default:
      return 'Open conversation';
  }
}

function formatMessagePreview(
  message?: ChatMessage | null,
  currentUserId?: string | null
): string | null {
  const content = message?.content?.trim();

  if (!content) {
    return null;
  }

  return message?.sender_id === currentUserId ? `You: ${content}` : content;
}

function buildFallbackMetadata(room: ChatRoomByUser): ChatRowMetadata {
  const isActive = room.status === 'open';
  return {
    title: 'Order conversation',
    meta: isActive ? 'Foodit chat' : 'Completed order chat',
    preview: isActive ? 'Open conversation' : 'Order completed',
    picture: null,
    initial: '?',
  };
}

export function ChatProvider({ children }: ChatProviderProps) {
  // Chat rooms state
  const [activeChatRooms, setActiveChatRooms] = useState<ChatRoomByUser[]>([]);
  const [closedChatRooms, setClosedChatRooms] = useState<ChatRoomByUser[]>([]);
  const [roomMetadataById, setRoomMetadataById] = useState<Record<string, ChatRowMetadata>>({});
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [isLoadingMoreRooms, setIsLoadingMoreRooms] = useState(false);
  const [hasMoreRooms, setHasMoreRooms] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);

  // Chat rooms pagination state
  const roomsPageStateRef = useRef<string | null>(null);
  const currentRoomsUserIdRef = useRef<string | null>(null);
  const metadataInFlightRef = useRef(new Set<string>());
  const roomMetadataByIdRef = useRef<Record<string, ChatRowMetadata>>({});
  const roomDetailsCacheRef = useRef<Record<string, ChatRoom>>({});
  const orderCacheRef = useRef<Record<string, Order>>({});
  const userProfileCacheRef = useRef<Record<string, UserProfile | null>>({});
  const latestMessageCacheRef = useRef<Record<string, ChatMessage | null>>({});

  // Active chat state
  const [activeChatRoomId, setActiveChatRoomId] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<WebSocketStatus>('disconnected');

  // Other user state
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [isLoadingOtherUser, setIsLoadingOtherUser] = useState(false);

  // Pagination state
  const nextPageStateRef = useRef<string | null>(null);

  // WebSocket ref
  const wsRef = useRef<ChatWebSocket | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const activeChatRoomIdRef = useRef<string | null>(null);

  /**
   * Convert API message to display message
   */
  const toDisplayMessage = useCallback(
    (msg: ChatMessage, userId: string): DisplayMessage => ({
      id: msg.message_id,
      from: msg.sender_id === userId ? 'you' : 'other',
      text: msg.content,
      timestamp: new Date(msg.sent_at),
      status: 'read',
    }),
    []
  );

  const clearRoomMetadata = useCallback(() => {
    setRoomMetadataById({});
    roomMetadataByIdRef.current = {};
    metadataInFlightRef.current.clear();
    roomDetailsCacheRef.current = {};
    orderCacheRef.current = {};
    userProfileCacheRef.current = {};
    latestMessageCacheRef.current = {};
  }, []);

  const upsertRoomMetadata = useCallback((chatRoomId: string, metadata: ChatRowMetadata) => {
    setRoomMetadataById((prev) => {
      const next = {
        ...prev,
        [chatRoomId]: metadata,
      };
      roomMetadataByIdRef.current = next;
      return next;
    });
  }, []);

  const ensureRoomMetadata = useCallback(
    async (room: ChatRoomByUser, userId: string) => {
      if (
        roomMetadataByIdRef.current[room.chat_room_id] ||
        metadataInFlightRef.current.has(room.chat_room_id)
      ) {
        return;
      }

      metadataInFlightRef.current.add(room.chat_room_id);

      const fallback = buildFallbackMetadata(room);
      let chatRoom: ChatRoom | null = null;
      let order: Order | null = null;
      let otherUser: UserProfile | null = null;
      let latestMessage: ChatMessage | null = null;
      let isBuyer: boolean | undefined;
      let roleLabel = 'Conversation';

      try {
        const [chatRoomResult, orderResult, latestMessageResult] = await Promise.all([
          roomDetailsCacheRef.current[room.chat_room_id]
            ? Promise.resolve(roomDetailsCacheRef.current[room.chat_room_id])
            : getChatRoomById(room.chat_room_id)
                .then((result) => {
                  roomDetailsCacheRef.current[room.chat_room_id] = result;
                  return result;
                })
                .catch((error) => {
                  console.error(`[Chats] Failed to fetch chat room ${room.chat_room_id}:`, error);
                  return null;
                }),
          orderCacheRef.current[room.order_id]
            ? Promise.resolve(orderCacheRef.current[room.order_id])
            : getOrderById(room.order_id)
                .then((result) => {
                  orderCacheRef.current[room.order_id] = result;
                  return result;
                })
                .catch((error) => {
                  console.error(`[Chats] Failed to fetch order ${room.order_id}:`, error);
                  return null;
                }),
          latestMessageCacheRef.current[room.chat_room_id] !== undefined
            ? Promise.resolve(latestMessageCacheRef.current[room.chat_room_id])
            : getMessagesByChatRoom(room.chat_room_id, { limit: 1 })
                .then((result) => {
                  const message = result.messages[0] ?? null;
                  latestMessageCacheRef.current[room.chat_room_id] = message;
                  return message;
                })
                .catch((error) => {
                  console.error(
                    `[Chats] Failed to fetch latest message for ${room.chat_room_id}:`,
                    error
                  );
                  return null;
                }),
        ]);

        chatRoom = chatRoomResult;
        order = orderResult;
        latestMessage = latestMessageResult;

        if (chatRoom) {
          isBuyer = chatRoom.buyer_id === userId;
          roleLabel = isBuyer ? 'Runner' : 'Buyer';

          const otherUserId = isBuyer ? chatRoom.runner_id : chatRoom.buyer_id;

          try {
            otherUser =
              userProfileCacheRef.current[otherUserId] !== undefined
                ? userProfileCacheRef.current[otherUserId]
                : await getUserProfile(otherUserId);
            userProfileCacheRef.current[otherUserId] = otherUser;
          } catch (error) {
            console.error(`[Chats] Failed to fetch user ${otherUserId}:`, error);
          }
        }

        const otherUserName =
          otherUser?.name?.trim() || (chatRoom ? roleLabel : 'Foodit');
        const orderTitle = order ? formatOrderTitle(order) : fallback.meta;
        const messagePreview =
          formatMessagePreview(latestMessage, userId) ??
          (order && isBuyer !== undefined
            ? formatOrderPreview(order, isBuyer)
            : fallback.preview);

        upsertRoomMetadata(room.chat_room_id, {
          title: chatRoom ? otherUserName : fallback.title,
          meta: orderTitle,
          preview: messagePreview,
          picture: otherUser?.picture ?? null,
          initial: getInitial(otherUserName),
        });
      } finally {
        metadataInFlightRef.current.delete(room.chat_room_id);
      }
    },
    [upsertRoomMetadata]
  );

  /**
   * Refresh chat rooms for a user (resets pagination)
   */
  const refreshChatRooms = useCallback(async (userId: string) => {
    if (currentRoomsUserIdRef.current !== userId) {
      clearRoomMetadata();
    }

    setIsLoadingRooms(true);
    setRoomsError(null);
    setHasMoreRooms(false);
    roomsPageStateRef.current = null;
    currentRoomsUserIdRef.current = userId;

    try {
      const response = await getChatRoomsByUser(userId, { limit: 20 });
      const { active, closed } = separateChatRoomsByStatus(response.chat_rooms);
      setActiveChatRooms(active);
      setClosedChatRooms(closed);
      response.chat_rooms.forEach((room) => {
        void ensureRoomMetadata(room, userId);
      });
      setHasMoreRooms(response.has_more);
      roomsPageStateRef.current = response.next_page_state ?? null;
    } catch (error) {
      console.error('Failed to fetch chat rooms:', error);
      setRoomsError(error instanceof Error ? error.message : 'Failed to fetch chat rooms');
    } finally {
      setIsLoadingRooms(false);
    }
  }, [clearRoomMetadata, ensureRoomMetadata]);

  /**
   * Load more chat rooms for pagination
   */
  const loadMoreChatRooms = useCallback(async () => {
    const userId = currentRoomsUserIdRef.current;
    const pageState = roomsPageStateRef.current;

    if (!userId || !pageState || isLoadingMoreRooms) {
      return;
    }

    setIsLoadingMoreRooms(true);

    try {
      const response = await getChatRoomsByUser(userId, { limit: 20, pageState });
      const { active, closed } = separateChatRoomsByStatus(response.chat_rooms);

      // Append new rooms (deduplicate by chat_room_id)
      setActiveChatRooms((prev) => {
        const existingIds = new Set(prev.map((r) => r.chat_room_id));
        const newRooms = active.filter((r) => !existingIds.has(r.chat_room_id));
        return [...prev, ...newRooms];
      });

      setClosedChatRooms((prev) => {
        const existingIds = new Set(prev.map((r) => r.chat_room_id));
        const newRooms = closed.filter((r) => !existingIds.has(r.chat_room_id));
        return [...prev, ...newRooms];
      });
      response.chat_rooms.forEach((room) => {
        void ensureRoomMetadata(room, userId);
      });

      setHasMoreRooms(response.has_more);
      roomsPageStateRef.current = response.next_page_state ?? null;
    } catch (error) {
      console.error('Failed to load more chat rooms:', error);
    } finally {
      setIsLoadingMoreRooms(false);
    }
  }, [ensureRoomMetadata, isLoadingMoreRooms]);

  /**
   * Handle incoming WebSocket message
   */
  const handleWebSocketMessage = useCallback(
    (payload: ReceiveMessagePayload) => {
      const userId = currentUserIdRef.current;
      const chatRoomId = activeChatRoomIdRef.current;
      if (!userId) return;

      const isOwnMessage = payload.sender_id === userId;

      const displayMsg: DisplayMessage = {
        id: payload.message_id,
        from: isOwnMessage ? 'you' : 'other',
        text: payload.content,
        timestamp: new Date(payload.sent_at),
        status: 'read',
      };

      setMessages((prev) => {
        // Check if message already exists by server ID (dedup)
        if (prev.some((m) => m.id === displayMsg.id)) {
          return prev;
        }

        // If this is our own message, find and replace the optimistic (temp) message
        if (isOwnMessage) {
          const tempIndex = prev.findIndex(
            (m) =>
              m.id.startsWith('temp_') &&
              m.from === 'you' &&
              m.text === payload.content
          );

          if (tempIndex !== -1) {
            // Replace the temp message with the server-confirmed message
            const updated = [...prev];
            updated[tempIndex] = displayMsg;
            return updated;
          }
        }

        return [...prev, displayMsg];
      });

      if (!chatRoomId) {
        return;
      }

      latestMessageCacheRef.current[chatRoomId] = {
        message_id: payload.message_id,
        chat_room_id: chatRoomId,
        sender_id: payload.sender_id,
        content: payload.content,
        sent_at: payload.sent_at,
        status: 'read',
      };

      const existingMetadata = roomMetadataByIdRef.current[chatRoomId];
      if (existingMetadata) {
        upsertRoomMetadata(chatRoomId, {
          ...existingMetadata,
          preview:
            formatMessagePreview(latestMessageCacheRef.current[chatRoomId], userId) ??
            existingMetadata.preview,
        });
      }
    },
    [upsertRoomMetadata]
  );

  /**
   * Handle WebSocket connection status change
   */
  const handleConnectionChange = useCallback((status: WebSocketStatus) => {
    setConnectionStatus(status);
  }, []);

  /**
   * Open a chat room and connect WebSocket
   */
  const openChat = useCallback(
    async (chatRoomId: string, userId: string) => {
      let openedChatRoom: ChatRoom | null = null;

      // Close existing connection if any
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current = null;
      }

      setActiveChatRoomId(chatRoomId);
      activeChatRoomIdRef.current = chatRoomId;
      setMessages([]);
      setMessagesError(null);
      setIsLoadingMessages(true);
      setHasMoreMessages(false);
      setOtherUser(null);
      setIsLoadingOtherUser(true);
      nextPageStateRef.current = null;
      currentUserIdRef.current = userId;

      // Fetch chat room details to get buyer_id, runner_id, and order_id
      try {
        const chatRoom = await getChatRoomById(chatRoomId);
        openedChatRoom = chatRoom;
        roomDetailsCacheRef.current[chatRoomId] = chatRoom;
        // Set the order ID for location tracking
        setActiveOrderId(chatRoom.order_id);

        // Determine the other user's ID
        const otherUserId =
          chatRoom.buyer_id === userId ? chatRoom.runner_id : chatRoom.buyer_id;

        // Fetch other user's profile from user service
        const profile = await getUserProfile(otherUserId);
        userProfileCacheRef.current[otherUserId] = profile;
        setOtherUser(profile);
      } catch (error) {
        console.error('Failed to fetch chat room:', error);
        setMessagesError('Chat room not found');
        setIsLoadingOtherUser(false);
        setIsLoadingMessages(false);
        return; // Don't attempt WebSocket connection if chat room doesn't exist
      } finally {
        setIsLoadingOtherUser(false);
      }

      // Fetch initial messages (most recent)
      try {
        const response = await getMessagesByChatRoom(chatRoomId, { limit: 50 });
        latestMessageCacheRef.current[chatRoomId] = response.messages[0] ?? null;
        // Messages come newest first from API, reverse for display (oldest first)
        const displayMessages = response.messages
          .map((msg) => toDisplayMessage(msg, userId))
          .reverse();
        setMessages(displayMessages);
        setHasMoreMessages(response.has_more);
        nextPageStateRef.current = response.next_page_state ?? null;
      } catch (error) {
        console.error('Failed to fetch messages:', error);
        setMessagesError(error instanceof Error ? error.message : 'Failed to fetch messages');
      } finally {
        setIsLoadingMessages(false);
      }

      // Connect WebSocket only if chat room exists
      const ws = createChatWebSocket(chatRoomId, userId, {
        onMessage: handleWebSocketMessage,
        onConnectionChange: handleConnectionChange,
        onError: (error) => {
          console.error('WebSocket error:', error);
        },
      });

      wsRef.current = ws;
      ws.connect();

      const activeRoom =
        activeChatRooms.find((room) => room.chat_room_id === chatRoomId) ??
        closedChatRooms.find((room) => room.chat_room_id === chatRoomId) ??
        (openedChatRoom
          ? {
              user_id: userId,
              chat_room_id: openedChatRoom.chat_room_id,
              order_id: openedChatRoom.order_id,
              status: openedChatRoom.status,
              created_at: openedChatRoom.created_at,
            }
          : undefined);

      if (activeRoom) {
        void ensureRoomMetadata(activeRoom, userId);
      }
    },
    [
      activeChatRooms,
      closedChatRooms,
      ensureRoomMetadata,
      toDisplayMessage,
      handleWebSocketMessage,
      handleConnectionChange,
    ]
  );

  /**
   * Load more (older) messages for pagination
   */
  const loadMoreMessages = useCallback(async () => {
    const chatRoomId = activeChatRoomId;
    const userId = currentUserIdRef.current;
    const pageState = nextPageStateRef.current;

    if (!chatRoomId || !userId || !pageState || isLoadingMoreMessages) {
      return;
    }

    setIsLoadingMoreMessages(true);

    try {
      const response = await getMessagesByChatRoom(chatRoomId, {
        limit: 50,
        pageState,
      });

      // Messages come newest first, reverse for display (oldest first)
      // Prepend older messages to the beginning of the list
      const olderMessages = response.messages
        .map((msg) => toDisplayMessage(msg, userId))
        .reverse();

      setMessages((prev) => {
        // Deduplicate by message ID
        const existingIds = new Set(prev.map((m) => m.id));
        const newMessages = olderMessages.filter((m) => !existingIds.has(m.id));
        return [...newMessages, ...prev];
      });

      setHasMoreMessages(response.has_more);
      nextPageStateRef.current = response.next_page_state ?? null;
    } catch (error) {
      console.error('Failed to load more messages:', error);
    } finally {
      setIsLoadingMoreMessages(false);
    }
  }, [activeChatRoomId, isLoadingMoreMessages, toDisplayMessage]);

  /**
   * Close the active chat and disconnect WebSocket
   */
  const closeChat = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
    }

    setActiveChatRoomId(null);
    activeChatRoomIdRef.current = null;
    setActiveOrderId(null);
    setMessages([]);
    setMessagesError(null);
    setConnectionStatus('disconnected');
    setHasMoreMessages(false);
    setOtherUser(null);
    setIsLoadingOtherUser(false);
    nextPageStateRef.current = null;
    currentUserIdRef.current = null;
  }, []);

  /**
   * Send a message through the WebSocket
   */
  const sendMessage = useCallback((content: string): boolean => {
    const trimmed = content.trim();
    if (!trimmed || !wsRef.current) {
      return false;
    }

    const userId = currentUserIdRef.current;
    if (!userId) return false;

    // Optimistically add message to UI
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg: DisplayMessage = {
      id: tempId,
      from: 'you',
      text: trimmed,
      timestamp: new Date(),
      status: 'sending',
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    // Send via WebSocket
    const sent = wsRef.current.sendMessage(trimmed);

    if (sent) {
      // Update status to sent
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'sent' as const } : m))
      );
    } else {
      // Mark as failed
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' as const } : m))
      );
    }

    return sent;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect();
      }
    };
  }, []);

  const value: ChatContextType = {
    activeChatRooms,
    closedChatRooms,
    roomMetadataById,
    isLoadingRooms,
    isLoadingMoreRooms,
    hasMoreRooms,
    roomsError,
    refreshChatRooms,
    loadMoreChatRooms,
    activeChatRoomId,
    activeOrderId,
    messages,
    isLoadingMessages,
    isLoadingMoreMessages,
    hasMoreMessages,
    messagesError,
    connectionStatus,
    otherUser,
    isLoadingOtherUser,
    ensureRoomMetadata,
    openChat,
    closeChat,
    sendMessage,
    loadMoreMessages,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
