import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { SafeScreen } from '@/components/safe-screen';
import ChatMessagesView from '@/components/chats/chat-messages-view';
import ChatTrackingMapView, {
  type ChatTrackingMapOrderInfo,
} from '@/components/chats/chat-tracking-map-view';
import { LoadingState } from '@/components/ui';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  Colors,
  Spacing,
  Typography,
  FontWeights,
} from '@/constants/theme';
import { useChatContext } from '@/contexts/ChatContext';
import { getStoredUserData } from '@/lib/auth-utils';
import { getOrderById, type Order } from '@/services/order-service';
import { getStoreById, type Store } from '@/services/store-service';
import { getUserProfile } from '@/services/user-service';
import type { UserProfile } from '@/types/user';

type ViewMode = 'chat' | 'map';

const DEFAULT_ORDER_INFO: ChatTrackingMapOrderInfo = {
  id: 'loading',
  title: 'Order in progress',
  status: 'pending',
  buyer: {
    name: 'Buyer',
    picture: null,
  },
  runner: {
    name: 'Runner',
    picture: null,
    rating: 0,
    deliveries: 0,
  },
  pickup: 'Pickup Location',
  dropoff: 'Dropoff Location',
  pickupCoordinate: {
    latitude: 1.3008,
    longitude: 103.8525,
  },
  dropoffCoordinate: {
    latitude: 1.2966,
    longitude: 103.85,
  },
  price: 0,
};

function formatOrderTitle(order: Order | null): string {
  const firstItem = order?.items?.[0]?.name?.trim();
  const itemCount = order?.items?.length ?? 0;

  if (!firstItem) {
    return 'Order in progress';
  }

  if (itemCount <= 1) {
    return firstItem;
  }

  return `${firstItem} +${itemCount - 1} more`;
}

function mapOrderStatus(order?: Order | null): ChatTrackingMapOrderInfo['status'] {
  switch (order?.status) {
    case 'PENDING':
      return 'pending';
    case 'ACCEPTED':
      return 'accepted';
    case 'COMPLETED':
      return 'completed';
    case 'CANCELLED':
      return 'cancelled';
    case 'MIA':
      return 'mia';
    default:
      return 'pending';
  }
}

function buildOrderInfo(
  orderId: string | null,
  order: Order | null,
  store: Store | null,
  buyerProfile: UserProfile | null,
  runnerProfile: UserProfile | null,
  currentUser: {
    userId: string;
    name?: string | null;
    picture?: string | null;
  } | null,
): ChatTrackingMapOrderInfo {
  if (!orderId || !order) {
    return DEFAULT_ORDER_INFO;
  }

  const totalPrice = ((order.food_cost ?? 0) + (order.delivery_fee ?? 0)) / 100;
  const isCurrentUserRunner =
    Boolean(order.runner_id) &&
    Boolean(currentUser?.userId) &&
    order.runner_id === currentUser?.userId;
  const isCurrentUserBuyer =
    Boolean(order.buyer_id) &&
    Boolean(currentUser?.userId) &&
    order.buyer_id === currentUser?.userId;
  const runnerName = isCurrentUserRunner
    ? currentUser?.name?.trim() || 'You'
    : runnerProfile?.name || 'Runner';
  const runnerPicture = isCurrentUserRunner
    ? currentUser?.picture ?? null
    : runnerProfile?.picture ?? null;
  const buyerName = isCurrentUserBuyer
    ? currentUser?.name?.trim() || 'You'
    : buyerProfile?.name || 'Buyer';
  const buyerPicture = isCurrentUserBuyer
    ? currentUser?.picture ?? null
    : buyerProfile?.picture ?? null;

  return {
    id: order.order_id,
    title: formatOrderTitle(order),
    status: mapOrderStatus(order),
    pickup: store?.address || store?.name || 'Pickup Location',
    dropoff: order.drop_off?.address || 'Drop-off Location',
    pickupCoordinate: store
      ? {
          latitude: store.lat,
          longitude: store.lng,
        }
      : DEFAULT_ORDER_INFO.pickupCoordinate,
    dropoffCoordinate: order.drop_off
      ? {
          latitude: order.drop_off.lat,
          longitude: order.drop_off.lng,
        }
      : DEFAULT_ORDER_INFO.dropoffCoordinate,
    price: totalPrice,
    buyer: {
      name: buyerName,
      picture: buyerPicture,
    },
    runner: {
      name: runnerName,
      picture: runnerPicture,
      rating: 0,
      deliveries: 0,
    },
  };
}

export default function ChatDetailScreen() {
  const { id: chatRoomId } = useLocalSearchParams<{ id: string }>();

  const [userId, setUserId] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<{
    userId: string;
    name?: string | null;
    picture?: string | null;
  } | null>(null);
  const [input, setInput] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [orderDetails, setOrderDetails] = useState<Order | null>(null);
  const [pickupStore, setPickupStore] = useState<Store | null>(null);
  const [buyerProfile, setBuyerProfile] = useState<UserProfile | null>(null);
  const [runnerProfile, setRunnerProfile] = useState<UserProfile | null>(null);

  const listRef = useRef<ScrollView>(null);

  const {
    messages,
    isLoadingMessages,
    isLoadingMoreMessages,
    hasMoreMessages,
    messagesError,
    connectionStatus,
    activeOrderId,
    otherUser,
    isLoadingOtherUser,
    openChat,
    closeChat,
    sendMessage,
    loadMoreMessages,
  } = useChatContext();

  useEffect(() => {
    async function initChat() {
      const userData = await getStoredUserData();
      if (userData?.userId && chatRoomId) {
        setUserId(userData.userId);
        setCurrentUserProfile({
          userId: userData.userId,
          name: userData.name,
          picture: userData.picture,
        });
        await openChat(chatRoomId, userData.userId);
      }
    }

    void initChat();

    return () => {
      closeChat();
    };
  }, [chatRoomId, openChat, closeChat]);

  const reloadOrderDetails = useCallback(async () => {
    if (!activeOrderId) return;
    try {
      const order = await getOrderById(activeOrderId);
      setOrderDetails(order);
      const [store, buyer, runner] = await Promise.all([
        getStoreById(order.menu_store_id).catch(() => null),
        order.buyer_id ? getUserProfile(order.buyer_id) : Promise.resolve(null),
        order.runner_id ? getUserProfile(order.runner_id) : Promise.resolve(null),
      ]);
      setPickupStore(store);
      setBuyerProfile(buyer);
      setRunnerProfile(runner);
    } catch (error) {
      console.error('[ChatDetail] Failed to load order details:', error);
    }
  }, [activeOrderId]);

  useEffect(() => {
    void reloadOrderDetails();
  }, [reloadOrderDetails]);

  // Poll order status every 8s while order is accepted so the runner sees MIA/cancellation
  useEffect(() => {
    if (orderDetails?.status !== 'ACCEPTED') return;
    const interval = setInterval(() => {
      void reloadOrderDetails();
    }, 8000);
    return () => clearInterval(interval);
  }, [orderDetails?.status, reloadOrderDetails]);

  const orderInfo = useMemo(
    () =>
      buildOrderInfo(
        activeOrderId ?? null,
        orderDetails,
        pickupStore,
        buyerProfile,
        runnerProfile,
        currentUserProfile,
      ),
    [activeOrderId, orderDetails, pickupStore, buyerProfile, runnerProfile, currentUserProfile],
  );

  function scrollToBottom() {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }

  function formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getStatusIcon(status?: string): string {
    switch (status) {
      case 'sending':
        return '...';
      case 'sent':
        return '\u2713';
      case 'delivered':
        return '\u2713\u2713';
      case 'read':
        return '\u2713\u2713';
      case 'failed':
        return '\u2717';
      default:
        return '';
    }
  }



  function onSend() {
    const trimmed = input.trim();
    if (!trimmed) return;

    const sent = sendMessage(trimmed);
    if (sent) {
      setInput('');
      scrollToBottom();
    }
  }

  function goBack() {
    router.replace('/(tabs)/chats');
  }

  const convertedMessages = messages.map((m) => ({
    id: m.id,
    from: m.from === 'you' ? ('you' as const) : ('runner' as const),
    text: m.text,
    timestamp: m.timestamp,
    status:
      m.status === 'sending'
        ? ('sent' as const)
        : m.status === 'failed'
          ? ('sent' as const)
          : (m.status as 'sent' | 'delivered' | 'read' | undefined),
  }));

  if (isLoadingMessages && messages.length === 0) {
    return (
      <SafeScreen>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <Pressable
            onPress={goBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Loading...</Text>
          </View>
          <View style={styles.headerRight} />
        </View>
        <LoadingState message="Loading messages..." />
      </SafeScreen>
    );
  }

  return (
    <SafeScreen>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>

        <View style={styles.headerCenter}>
          {otherUser?.picture ? (
            <Image
              source={{ uri: otherUser.picture }}
              style={styles.avatar}
              onError={(e) => {
                console.error(
                  `[ChatDetail] Header avatar failed to load for ${otherUser?.name}:`,
                  e.nativeEvent.error,
                );
                console.error(`[ChatDetail] Image URL was: ${otherUser.picture}`);
              }}
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {otherUser?.name?.charAt(0)?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
          <View style={styles.headerInfo}>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {isLoadingOtherUser ? 'Loading...' : otherUser?.name || 'Unknown User'}
            </Text>
            {otherUser?.email && (
              <Text numberOfLines={1} style={styles.headerSubtitle}>
                {otherUser.email}
              </Text>
            )}
          </View>
        </View>

        {orderInfo.status === 'accepted' && (
          <View style={styles.headerRight}>
            <View style={styles.toggleGroup}>
              <Pressable
                onPress={() => setViewMode('chat')}
                style={({ pressed }) => [
                  styles.toggleIconBtn,
                  viewMode === 'chat' && styles.toggleIconActive,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Show chat"
              >
                <IconSymbol
                  name="message.fill"
                  size={18}
                  color={viewMode === 'chat' ? Colors.textInverse : Colors.textMuted}
                />
              </Pressable>

              <Pressable
                onPress={() => setViewMode('map')}
                style={({ pressed }) => [
                  styles.toggleIconBtn,
                  viewMode === 'map' && styles.toggleIconActive,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Show map"
              >
                <IconSymbol
                  name="map.fill"
                  size={18}
                  color={viewMode === 'map' ? Colors.textInverse : Colors.textMuted}
                />
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {messagesError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{messagesError}</Text>
        </View>
      )}

      {connectionStatus === 'disconnected' && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>Reconnecting...</Text>
        </View>
      )}

      {viewMode === 'chat' || orderInfo.status !== 'accepted' ? (
        <ChatMessagesView
          messages={convertedMessages}
          input={input}
          listRef={listRef}
          setInput={setInput}
          onSend={onSend}
          scrollToBottom={scrollToBottom}
          formatTime={formatTime}
          getStatusIcon={getStatusIcon}
          pressedStyle={styles.pressed}
          colors={{ textMuted: Colors.textMuted }}
          hasMoreMessages={hasMoreMessages}
          isLoadingMoreMessages={isLoadingMoreMessages}
          onLoadMore={loadMoreMessages}
          otherUser={otherUser}
        />
      ) : (
        <ChatTrackingMapView
          orderInfo={orderInfo}
          orderId={activeOrderId || ''}
          userId={userId || ''}
          isBuyer={
            Boolean(orderDetails?.buyer_id) &&
            Boolean(userId) &&
            orderDetails?.buyer_id === userId
          }
          runnerId={orderDetails?.runner_id ?? undefined}
          onMiaSuccess={reloadOrderDetails}
        />
      )}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.surface,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  backIcon: {
    fontSize: 28,
    fontWeight: FontWeights.bold,
    color: Colors.text,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    ...Typography.h4,
  },
  headerSubtitle: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerRight: {
    width: 80,
    alignItems: 'flex-end',
  },
  toggleGroup: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  toggleIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleIconActive: {
    backgroundColor: Colors.primary,
  },
  errorBanner: {
    backgroundColor: Colors.error + '20',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  errorText: {
    ...Typography.bodySmall,
    color: Colors.error,
    textAlign: 'center',
  },
  warningBanner: {
    backgroundColor: Colors.warning + '20',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  warningText: {
    ...Typography.bodySmall,
    color: Colors.warning,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
