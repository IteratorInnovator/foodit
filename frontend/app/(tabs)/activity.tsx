import { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  ScrollView,
  Pressable,
  View,
  Text,
  Animated,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeScreen } from '@/components/safe-screen';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Shadows } from '@/constants/theme';
import { getPayments } from '@/services/payment-service';
import { getAllOrders } from '@/services/order-service';
import { getUserProfile } from '@/services/user-service';
import { getStoredUserData } from '@/lib/auth-utils';
import type { Payment } from '@/types/payment';
import type { UserProfile } from '@/types/user';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ActivityTab = 'transactions' | 'buyer' | 'runner';

type Transaction = {
  id: string;
  type: 'payment' | 'refund' | 'earning' | 'withdrawal';
  description: string;
  amount: number;
  isoDate: string;
  time: string;
};

type Order = {
  id: string;
  status: 'completed' | 'cancelled' | 'refunded';
  amount: number;
  timestamp: string;
  date: string;
  counterpartyName: string;
  counterpartyPicture?: string | null;
  rating?: number;
};

type BackendOrderStatus = 'PENDING' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED' | 'MIA';

type BackendOrder = {
  order_id: string;
  buyer_id: string;
  status: BackendOrderStatus;
  runner_id?: string;
  menu_item_id?: string;
  menu_store_id?: string;
  food_cost?: number;
  delivery_fee?: number;
  platform_fee?: number;
  transfer_amount: number;
  total_amount: number;
  created_at?: string;
};

function withOrderAmounts(
  order: Omit<BackendOrder, 'transfer_amount' | 'total_amount'>,
): BackendOrder {
  return {
    ...order,
    transfer_amount: (order.food_cost || 0) + (order.delivery_fee || 0),
    total_amount:
      (order.food_cost || 0) +
      (order.delivery_fee || 0) +
      (order.platform_fee || 0),
  };
}

const TAB_CONFIG = [
  { key: 'transactions' as const, label: 'History', icon: 'clock' as const },
  { key: 'buyer' as const, label: 'As Buyer', icon: 'bag' as const },
  { key: 'runner' as const, label: 'As Runner', icon: 'figure.walk' as const },
];

// Helper function to map Payment type to Transaction type
function mapPaymentTypeToTransactionType(paymentType: string): Transaction['type'] {
  switch (paymentType) {
    case 'payment':
      // Deduction from Stripe customer account
      return 'payment';
    case 'transfer':
      // Earning to Stripe Connect account
      return 'earning';
    case 'refund':
      // Refund to Stripe customer account
      return 'refund';
    default:
      return 'payment';
  }
}

// Helper function to get payment description
function getPaymentDescription(paymentType: string): string {
  switch (paymentType) {
    case 'payment':
      // User paid for an order
      return 'Order payment';
    case 'transfer':
      // User earned from delivery
      return 'Delivery earning';
    case 'refund':
      // User received refund
      return 'Order refund';
    default:
      return 'Transaction';
  }
}

// Ensure the ISO string is treated as UTC (append Z if no timezone info present)
function toUtcDate(isoString: string): Date {
  if (!isoString) return new Date();
  const normalized = /[Zz]$|[+-]\d{2}:\d{2}$/.test(isoString) ? isoString : `${isoString}Z`;
  return new Date(normalized);
}

// Compare calendar dates ignoring time, in local timezone
function calendarDayDiff(isoString: string): number {
  const d = toUtcDate(isoString);
  const now = new Date();
  const toMidnight = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((toMidnight(now) - toMidnight(d)) / (1000 * 60 * 60 * 24));
}

// Helper function to format timestamp
function formatTimestamp(isoString: string): string {
  const diffDays = calendarDayDiff(isoString);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return new Date(isoString).toLocaleDateString();
}

// Helper function to format time
function formatTime(isoString: string): string {
  const date = toUtcDate(isoString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Helper function to check if order is completed (for history)
function isCompletedOrder(status: BackendOrderStatus): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED' || status === 'MIA';
}

// Helper function to map BackendOrder status to Order status
function mapOrderStatus(backendStatus: BackendOrderStatus): Order['status'] {
  switch (backendStatus) {
    case 'COMPLETED':
      return 'completed';
    case 'CANCELLED':
    case 'MIA':
      return 'cancelled';
    default:
      return 'completed';
  }
}

// Helper to format absolute date
function formatDate(isoString: string): string {
  const date = toUtcDate(isoString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' • ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Helper function to map BackendOrder to Order
function mapBackendOrderToOrder(
  backendOrder: BackendOrder,
  currentUserId: string,
  profileCache: Record<string, UserProfile | null>,
): Order {
  const totalAmount = (backendOrder.total_amount || 0) / 100;
  const transferAmount = (backendOrder.transfer_amount || 0) / 100;
  const isRunner = backendOrder.runner_id === currentUserId;
  const counterpartyId = isRunner ? backendOrder.buyer_id : backendOrder.runner_id;
  const profile = counterpartyId ? profileCache[counterpartyId] : null;

  return {
    id: backendOrder.order_id,
    status: mapOrderStatus(backendOrder.status),
    amount: isRunner ? transferAmount : totalAmount,
    timestamp: backendOrder.created_at ? formatTimestamp(backendOrder.created_at) : 'Recently',
    date: backendOrder.created_at ? formatDate(backendOrder.created_at) : '',
    counterpartyName: profile?.name ?? (counterpartyId ? counterpartyId.slice(0, 8) : 'Unassigned'),
    counterpartyPicture: profile?.picture ?? null,
    rating: undefined,
  };
}

export default function ActivityScreen() {
  const [activeTab, setActiveTab] = useState<ActivityTab>('transactions');
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [orders, setOrders] = useState<BackendOrder[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile | null>>({});
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Fetch user ID on mount
  useEffect(() => {
    async function loadUserId() {
      try {
        const userData = await getStoredUserData();
        if (userData?.userId) {
          setUserId(userData.userId);
        }
      } catch (error) {
        console.error('[Activity] Error loading user ID:', error);
      }
    }
    loadUserId();
  }, []);

  // Fetch payments and orders when userId is available
  useEffect(() => {
    if (userId) {
      Promise.all([fetchPayments(), fetchOrders()]);
    }
  }, [userId]);

  const fetchPayments = useCallback(async () => {
    if (!userId) return;

    try {
      console.log('[Activity] Fetching payments for user:', userId);
      const payments = await getPayments(userId);

      // Map Payment objects to Transaction objects
      const mappedTransactions: Transaction[] = payments.map((payment: Payment) => {
        // Payment type should be negative (deduction), transfer and refund should be positive
        const amount = payment.type === 'payment'
          ? -Math.abs(payment.amount)
          : Math.abs(payment.amount);

        return {
          id: payment.id,
          type: mapPaymentTypeToTransactionType(payment.type),
          description: getPaymentDescription(payment.type),
          amount: amount,
          isoDate: payment.created_at,
          time: formatTime(payment.created_at),
        };
      });

      setTransactions(mappedTransactions);
      console.log('[Activity] Loaded', mappedTransactions.length, 'payments');
    } catch (error) {
      console.error('[Activity] Error fetching payments:', error);
      // Set empty array on error
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const fetchOrders = useCallback(async () => {
    if (!userId) return;

    try {
      const allOrders = (
        await getAllOrders() as Omit<BackendOrder, 'transfer_amount' | 'total_amount'>[]
      ).map(
        withOrderAmounts,
      );
      setOrders(allOrders);

      // Collect unique counterparty IDs across all orders
      const counterpartyIds = [...new Set(
        allOrders.flatMap((o) => [o.buyer_id, o.runner_id].filter((id): id is string => !!id && id !== userId))
      )];

      const profiles = await Promise.all(counterpartyIds.map((id) => getUserProfile(id)));
      const cache: Record<string, UserProfile | null> = {};
      counterpartyIds.forEach((id, i) => { cache[id] = profiles[i]; });
      setUserProfiles(cache);
      console.log('[Activity] Loaded', allOrders.length, 'orders');
    } catch (error) {
      console.error('[Activity] Error fetching orders:', error);
      setOrders([]);
    }
  }, [userId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([fetchPayments(), fetchOrders()]).finally(() => {
      setRefreshing(false);
    });
  }, [fetchPayments, fetchOrders]);

  const handleTabChange = (tab: ActivityTab, index: number) => {
    setActiveTab(tab);
    Animated.spring(slideAnim, {
      toValue: index,
      useNativeDriver: true,
      tension: 300,
      friction: 30,
    }).start();
  };

  const tabWidth = (SCREEN_WIDTH - 48) / 3;
  const translateX = slideAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, tabWidth, tabWidth * 2],
  });

  return (
    <SafeScreen>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0f172a"
            colors={['#0f172a']}
            progressBackgroundColor="#fff"
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>Your Activity</Text>
        </View>

        {/* Tab Selector */}
        <View style={styles.tabContainer}>
          <View style={styles.tabTrack}>
            <Animated.View
              style={[
                styles.tabIndicator,
                { width: tabWidth - 8, transform: [{ translateX }] },
              ]}
            />
            {TAB_CONFIG.map((tab, index) => (
              <Pressable
                key={tab.key}
                style={styles.tabItem}
                onPress={() => handleTabChange(tab.key, index)}
              >
                <IconSymbol
                  name={tab.icon}
                  size={16}
                  color={activeTab === tab.key ? '#fff' : Colors.textMuted}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    activeTab === tab.key && styles.tabLabelActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading activity...</Text>
            </View>
          ) : (
            <>
              {activeTab === 'transactions' && <TransactionsList transactions={transactions} />}
              {activeTab === 'buyer' && (
                <OrdersList
                  orders={orders
                    .filter((order) => order.buyer_id === userId && isCompletedOrder(order.status))
                    .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
                    .map((order) => mapBackendOrderToOrder(order, userId!, userProfiles))}
                  role="buyer"
                />
              )}
              {activeTab === 'runner' && (
                <OrdersList
                  orders={orders
                    .filter((order) => order.runner_id === userId && isCompletedOrder(order.status))
                    .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
                    .map((order) => mapBackendOrderToOrder(order, userId!, userProfiles))}
                  role="runner"
                />
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeScreen>
  );
}

function TransactionsList({ transactions }: { transactions: Transaction[] }) {
  const getTypeConfig = (type: Transaction['type']) => {
    switch (type) {
      case 'payment':
        return { icon: 'creditcard.fill' as const, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', label: 'Payment' };
      case 'refund':
        return { icon: 'arrow.uturn.backward' as const, color: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)', label: 'Refund' };
      case 'earning':
        return { icon: 'dollarsign.circle.fill' as const, color: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)', label: 'Earning' };
      case 'withdrawal':
        return { icon: 'building.columns' as const, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)', label: 'Withdrawal' };
      default:
        return { icon: 'receipt' as const, color: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)', label: 'Transaction' };
    }
  };

  if (transactions.length === 0) {
    return (
      <View style={styles.emptyState}>
        <IconSymbol name="creditcard" size={48} color="#cbd5e1" />
        <Text style={styles.emptyStateTitle}>No transactions yet</Text>
        <Text style={styles.emptyStateText}>Your payment history will appear here</Text>
      </View>
    );
  }

  function dateKey(isoDate: string): string {
    const diffDays = calendarDayDiff(isoDate);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return toUtcDate(isoDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  const sorted = [...transactions].sort(
    (a, b) => new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime(),
  );

  const grouped = sorted.reduce((acc, tx) => {
    const key = dateKey(tx.isoDate);
    if (!acc[key]) acc[key] = [];
    acc[key].push(tx);
    return acc;
  }, {} as Record<string, Transaction[]>);

  // Sort sections by the timestamp of their first (newest) transaction
  const sections = Object.keys(grouped).sort(
    (a, b) => new Date(grouped[b][0].isoDate).getTime() - new Date(grouped[a][0].isoDate).getTime(),
  );

  return (
    <View style={styles.listContainer}>
      {sections.map((section, sectionIndex) => (
        <View key={section} style={[styles.section, sectionIndex > 0 && styles.sectionGap]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section}</Text>
            <View style={styles.sectionLine} />
          </View>
          <View style={styles.transactionCard}>
            {grouped[section].map((tx, index) => {
              const config = getTypeConfig(tx.type);
              const isPositive = tx.amount >= 0;
              const isLast = index === grouped[section].length - 1;

              return (
                <Pressable
                  key={tx.id}
                  style={({ pressed }) => [
                    styles.txRow,
                    !isLast && styles.txRowBorder,
                    pressed && styles.txRowPressed,
                  ]}
                >
                  <View style={[styles.txIconWrapper, { backgroundColor: config.bg }]}>
                    <IconSymbol name={config.icon} size={18} color={config.color} />
                  </View>
                  <View style={styles.txDetails}>
                    <Text style={styles.txDescription} numberOfLines={1}>
                      {tx.description}
                    </Text>
                    <View style={styles.txMeta}>
                      <View style={[styles.txTypeBadge, { backgroundColor: config.bg }]}>
                        <Text style={[styles.txTypeText, { color: config.color }]}>{config.label}</Text>
                      </View>
                      {tx.time && <Text style={styles.txTime}>{tx.time}</Text>}
                    </View>
                  </View>
                  <Text style={[styles.txAmount, isPositive ? styles.txAmountPositive : styles.txAmountNegative]}>
                    {isPositive ? '+' : ''}{tx.amount < 0 ? '-' : ''}${Math.abs(tx.amount).toFixed(2)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

function OrdersList({ orders, role }: { orders: Order[]; role: 'buyer' | 'runner' }) {
  const getStatusConfig = (status: Order['status']) => {
    switch (status) {
      case 'completed':
        return { color: '#16a34a', bg: 'rgba(22, 163, 74, 0.1)', label: 'Completed', icon: 'checkmark.circle.fill' as const };
      case 'cancelled':
        return { color: '#dc2626', bg: 'rgba(220, 38, 38, 0.1)', label: 'Cancelled', icon: 'xmark.circle.fill' as const };
      case 'refunded':
        return { color: '#d97706', bg: 'rgba(217, 119, 6, 0.1)', label: 'Refunded', icon: 'arrow.uturn.backward' as const };
      default:
        return { color: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)', label: status, icon: 'receipt' as const };
    }
  };

  const renderStars = (rating: number) => {
    return (
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map(star => (
          <IconSymbol
            key={star}
            name="star.fill"
            size={10}
            color={star <= rating ? '#fbbf24' : '#e5e7eb'}
          />
        ))}
      </View>
    );
  };

  if (orders.length === 0) {
    return (
      <View style={styles.emptyState}>
        <IconSymbol
          name={role === 'buyer' ? 'bag' : 'figure.walk'}
          size={48}
          color="#cbd5e1"
        />
        <Text style={styles.emptyStateTitle}>No orders yet</Text>
        <Text style={styles.emptyStateText}>
          {role === 'buyer'
            ? 'Your purchase history will appear here'
            : 'Your delivery history will appear here'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.listContainer}>
      <View style={styles.ordersCard}>
        {orders.map((order, index) => {
          const statusConfig = getStatusConfig(order.status);
          const isLast = index === orders.length - 1;

          return (
            <Pressable
              key={order.id}
              style={({ pressed }) => [
                styles.orderRow,
                !isLast && styles.orderRowBorder,
                pressed && styles.orderRowPressed,
              ]}
            >
              <View style={styles.orderLeft}>
                {order.counterpartyPicture ? (
                  <Image source={{ uri: order.counterpartyPicture }} style={styles.orderAvatar} />
                ) : (
                  <View style={styles.orderAvatar}>
                    <Text style={styles.orderAvatarText}>
                      {order.counterpartyName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.orderInfo}>
                  <Text style={styles.orderTitle} numberOfLines={1}>{order.counterpartyName}</Text>
                  <Text style={styles.orderCounterparty}>
                    {role === 'buyer' ? 'Runner' : 'Buyer'}
                    {order.rating ? <>{' '}{renderStars(order.rating)}</> : null}
                  </Text>
                  <Text style={styles.orderTimestamp}>{order.date}</Text>
                </View>
              </View>
              <View style={styles.orderRight}>
                <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                  <IconSymbol name={statusConfig.icon} size={10} color={statusConfig.color} />
                  <Text style={[styles.statusText, { color: statusConfig.color }]}>
                    {statusConfig.label}
                  </Text>
                </View>
                <View style={styles.orderAmountWrapper}>
                  <Text style={styles.orderAmountLabel}>
                    {role === 'buyer' ? 'Paid' : 'Earned'}
                  </Text>
                  <Text style={styles.orderAmount}>${order.amount.toFixed(2)}</Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    paddingBottom: 120,
  },

  // Header
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  subheading: {
    fontSize: 15,
    color: '#64748b',
    marginTop: 4,
  },

  // Tab Selector
  tabContainer: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
  },
  tabTrack: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    padding: 4,
    position: 'relative',
  },
  tabIndicator: {
    position: 'absolute',
    height: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    left: 4,
    top: 4,
    bottom: 4,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    zIndex: 1,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabLabelActive: {
    color: '#fff',
  },

  // Content
  content: {
    paddingHorizontal: 24,
  },
  listContainer: {
    gap: 8,
  },

  // Sections
  section: {},
  sectionGap: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0',
  },

  // Transaction Card
  transactionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    ...Shadows.sm,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  txRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  txRowPressed: {
    backgroundColor: '#f8fafc',
  },
  txIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txDetails: {
    flex: 1,
    gap: 6,
  },
  txDescription: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  txMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  txTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  txTypeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  txTime: {
    fontSize: 12,
    color: '#94a3b8',
  },
  txAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  txAmountPositive: {
    color: '#16a34a',
  },
  txAmountNegative: {
    color: '#0f172a',
  },

  // Orders Card
  ordersCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    ...Shadows.sm,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    gap: 12,
  },
  orderRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  orderRowPressed: {
    backgroundColor: '#f8fafc',
  },
  orderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  orderAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#3b82f6',
  },
  orderInfo: {
    flex: 1,
    gap: 4,
  },
  orderTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  orderMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderCounterparty: {
    fontSize: 13,
    color: '#64748b',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  orderTimestamp: {
    fontSize: 12,
    color: '#94a3b8',
  },
  orderRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  orderAmountWrapper: {
    alignItems: 'flex-end',
  },
  orderAmountLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  orderAmount: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },

  // Loading state
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },

  // Empty state
  emptyState: {
    paddingVertical: 60,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
    marginTop: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
});
