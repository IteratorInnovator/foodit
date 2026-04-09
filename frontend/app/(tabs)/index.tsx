import {
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  View,
  Text,
  RefreshControl,
  Modal,
  Image,
} from "react-native";
import { SafeScreen } from "@/components/safe-screen";
import { useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DeliveryCard from "@/components/DeliveryCard";
import OrderCard from "@/components/OrderCard";
import ReviewModal from "@/components/ReviewModal";
import { SectionHeader, EmptyState, Badge } from "@/components/ui";
import { getAccessToken, getStoredUserData } from "@/lib/auth-utils";
import { getAllOrders, getPendingOrders } from "@/services/order-service";
import { getUserProfile } from "@/services/user-service";
import { UserProfile } from "@/types/user";
import {
  acceptManagedOrder,
  cancelManagedOrder,
  completeManagedOrder,
} from "@/services/order-management-service";
import {
  findChatRoomByOrderId,
  getAllChatRoomsByUser,
} from "@/services/chat-service";
import { createTrackingSession, getLocations } from "@/services/location-service";
import { createReview, getReviews } from "@/services/review-service";
import type { Review } from "@/types/review";
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  FontWeights,
  FontSizes,
  Shadows,
} from "@/constants/theme";
import { getOptionalText } from "@/utils/text";

const API_BASE = process.env.EXPO_PUBLIC_API_URL!;

type TabKey = "orders" | "deliveries";

type BackendOrderStatus =
  | "PENDING"
  | "ACCEPTED"
  | "COMPLETED"
  | "CANCELLED"
  | "MIA";

type BackendOrderItem = {
  menu_item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
};

type BackendDropOff = {
  lat: number;
  lng: number;
  address: string;
};

type Store = {
  store_id: string;
  name: string;
  cuisine: string;
  image_url: string;
  address: string;
  lat: number;
  lng: number;
  place_id: string;
};

type BackendOrder = {
  order_id: string;
  buyer_id: string;
  status: BackendOrderStatus;
  runner_id?: string;
  menu_store_id: string;
  items?: BackendOrderItem[];
  description?: string;
  food_cost: number;
  delivery_fee: number;
  platform_fee: number;
  transfer_amount: number;
  total_amount: number;
  drop_off?: BackendDropOff;
  payment_intent_id?: string;
  created_at?: string;
};

function withOrderAmounts(
  order: Omit<BackendOrder, "transfer_amount" | "total_amount">,
): BackendOrder {
  return {
    ...order,
    transfer_amount: (order.food_cost ?? 0) + (order.delivery_fee ?? 0),
    total_amount:
      (order.food_cost ?? 0) +
      (order.delivery_fee ?? 0) +
      (order.platform_fee ?? 0),
  };
}

function formatOrderDate(isoString?: string): string | undefined {
  if (!isoString) return undefined;
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " • " + date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function getOrderDescription(order: BackendOrder): string | undefined {
  return getOptionalText(order.description);
}

function getOrderItemsSummary(order: BackendOrder): string | undefined {
  return order.items
    ?.map((item) => `${item.quantity}x ${item.name}`)
    .join(", ");
}

function getStatusColor(status: BackendOrderStatus) {
  switch (status) {
    case "PENDING":   return { bg: Colors.warningMuted,  text: Colors.warning };
    case "ACCEPTED":  return { bg: Colors.primaryMuted,  text: Colors.primary };
    case "COMPLETED": return { bg: Colors.successMuted,  text: Colors.success };
    case "CANCELLED":
    case "MIA":       return { bg: Colors.errorMuted,    text: Colors.error };
  }
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveChatRoomIdForOrder(userId: string, orderId: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rooms = await getAllChatRoomsByUser(userId);
    const room = findChatRoomByOrderId(rooms, orderId);
    if (room) {
      return room.chat_room_id;
    }
    await delay(1000);
  }
  return null;
}

async function verifyLocationSessionActive(orderId: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const locationData = await getLocations(orderId);
      return locationData.status === "active";
    } catch {
      await delay(1000);
    }
  }
  return false;
}

export default function HomeScreen() {
  const [userData, setUserData] = useState<{
    userId: string;
    email: string | null;
    name?: string | null;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("orders");
  const [refreshing, setRefreshing] = useState(false);

  const [orders, setOrders] = useState<BackendOrder[]>([]);
  const [pendingOrders, setPendingOrders] = useState<BackendOrder[]>([]);

  const [storesById, setStoresById] = useState<Record<string, Store>>({});
  const [selectedOrder, setSelectedOrder] = useState<BackendOrder | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [buyerProfile, setBuyerProfile] = useState<UserProfile | null>(null);
  const [runnerProfile, setRunnerProfile] = useState<UserProfile | null>(null);

  const [reviewOrder, setReviewOrder] = useState<BackendOrder | null>(null);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [runnerReviews, setRunnerReviews] = useState<Review[]>([]);
  const [runnerReviewsVisible, setRunnerReviewsVisible] = useState(false);
  const [runnerReviewsLoading, setRunnerReviewsLoading] = useState(false);
  const [reviewerProfiles, setReviewerProfiles] = useState<Record<string, UserProfile | null>>({});

  const [reviewedOrderIds, setReviewedOrderIds] = useState<Set<string>>(new Set());
  const previousOrdersRef = useRef<BackendOrder[]>([]);
  const promptedOrderIds = useRef<Set<string>>(new Set());
  const userDataRef = useRef(userData);
  userDataRef.current = userData;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadUserData(), loadOrders(), loadStores()]);
    setRefreshing(false);
  }, []);

  const byDateDesc = (a: BackendOrder, b: BackendOrder) =>
    new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();

  const myOrders = orders
    .filter((order) => order.buyer_id === userData?.userId)
    .sort(byDateDesc);
  const acceptedDeliveries = orders
    .filter(
      (order) =>
        order.status === "ACCEPTED" &&
        !!order.runner_id &&
        order.runner_id === userData?.userId,
    )
    .sort(byDateDesc);

  async function acceptJob(orderId: string) {
    if (!userData?.userId) {
      Alert.alert(
        "Sign in required",
        "Please sign in before accepting a delivery.",
      );
      return;
    }

    const orderToAccept =
      pendingOrders.find((order) => order.order_id === orderId) ??
      orders.find((order) => order.order_id === orderId);

    try {
      await acceptManagedOrder(orderId, userData.userId);
      if (orderToAccept?.buyer_id) {
        try {
          await createTrackingSession(
            orderId,
            orderToAccept.buyer_id,
            userData.userId,
          );
        } catch (sessionError) {
          console.error(
            "Accepted delivery but failed to create tracking session:",
            sessionError,
          );
        }
      }

      await loadOrders();

      Alert.alert(
        "Delivery Accepted",
        "Job moved to your active deliveries.",
      );
    } catch (error) {
      console.error("Failed to accept job:", error);
      Alert.alert(
        "Accept failed",
        error instanceof Error
          ? error.message
          : "Unable to accept this job right now.",
      );
    }
  }

  async function completeDelivery(orderId: string) {
    Alert.alert("Complete Delivery", "Mark this delivery as completed?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Complete",
        onPress: async () => {
          try {
            await completeManagedOrder(orderId);
            await loadOrders();
            Alert.alert(
              "Delivery Completed",
              "This delivery has been marked as completed.",
            );
          } catch (error) {
            console.error("Failed to complete delivery:", error);
            Alert.alert(
              "Completion failed",
              error instanceof Error
                ? error.message
                : "Unable to complete this delivery right now.",
            );
          }
        },
      },
    ]);
  }

  useEffect(() => {
    AsyncStorage.getItem("reviewedOrderIds").then((stored) => {
      if (stored) {
        setReviewedOrderIds(new Set(JSON.parse(stored)));
      }
    });
    loadUserData();
    loadOrders();
    loadStores();

    // Poll for order updates every 10s so the buyer detects completions
    const interval = setInterval(loadOrders, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadUserData = async () => {
    const data = await getStoredUserData();
    if (!data) {
      setUserData(null);
      return;
    }

    setUserData(data);

    if (data.name || !data.userId) {
      return;
    }

    try {
      const profile = await getUserProfile(data.userId);
      if (profile?.name) {
        setUserData((current) =>
          current ? { ...current, name: profile.name } : current,
        );
      }
    } catch (error) {
      console.error("Failed to load user profile:", error);
    }
  };

  const loadOrders = async () => {
    try {
      const [allOrders, pending] = await Promise.all([
        getAllOrders(),
        getPendingOrders(),
      ]);
      const typedOrders = (
        allOrders as Omit<BackendOrder, "transfer_amount" | "total_amount">[]
      ).map(
        withOrderAmounts,
      );
      const typedPendingOrders = (
        pending as Omit<BackendOrder, "transfer_amount" | "total_amount">[]
      ).map(
        withOrderAmounts,
      );

      // Detect orders that just transitioned to COMPLETED for the buyer
      const currentUserId = userDataRef.current?.userId;
      if (currentUserId) {
        const prevMap = new Map(
          previousOrdersRef.current.map((o) => [o.order_id, o]),
        );
        for (const order of typedOrders) {
          if (
            order.buyer_id === currentUserId &&
            (order.status === "COMPLETED" || order.status === "MIA") &&
            order.runner_id &&
            !promptedOrderIds.current.has(order.order_id) &&
            !reviewedOrderIds.has(order.order_id)
          ) {
            const prev = prevMap.get(order.order_id);
            // Only prompt if the order just transitioned to COMPLETED or MIA
            if (prev && prev.status !== order.status) {
              promptedOrderIds.current.add(order.order_id);
              setReviewOrder(order);
              setReviewModalVisible(true);
              break;
            }
          }
        }
      }

      previousOrdersRef.current = typedOrders;
      setOrders(typedOrders);
      setPendingOrders(typedPendingOrders);
    } catch (error) {
      console.error("Failed to load orders:", error);
      Alert.alert(
        "Unable to load orders",
        error instanceof Error ? error.message : "Please try again later.",
      );
    }
  };

  const loadStores = async () => {
    try {
      const accessToken = await getAccessToken();
      const res = await fetch(`${API_BASE}/stores`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const stores = (await res.json()) as Store[];
      const mappedStores = stores.reduce<Record<string, Store>>((acc, store) => {
        acc[store.store_id] = store;
        return acc;
      }, {});

      setStoresById(mappedStores);
    } catch (error) {
      console.error("Failed to load stores:", error);
    }
  };

  const openOrderModal = async (order: BackendOrder) => {
    setSelectedOrder(order);
    setBuyerProfile(null);
    setRunnerProfile(null);
    setRunnerReviewsVisible(false);
    setModalVisible(true);
    const [buyer, runner] = await Promise.all([
      getUserProfile(order.buyer_id),
      order.runner_id ? getUserProfile(order.runner_id) : Promise.resolve(null),
    ]);
    setBuyerProfile(buyer);
    setRunnerProfile(runner);
  };

  const closeOrderModal = () => {
    setModalVisible(false);
    setSelectedOrder(null);
    setBuyerProfile(null);
    setRunnerProfile(null);
    setRunnerReviewsVisible(false);
    setReviewerProfiles({});
  };

  const openReviewModal = (order: BackendOrder) => {
    setReviewOrder(order);
    setReviewModalVisible(true);
  };

  const handleReviewSubmit = async (rating: number, description: string) => {
    if (!userData?.userId || !reviewOrder?.runner_id) return;
    try {
      await createReview({
        reviewee_id: reviewOrder.runner_id,
        reviewer_id: userData.userId,
        description,
        rating,
      });
      setReviewedOrderIds((prev) => {
        const updated = new Set(prev).add(reviewOrder.order_id);
        AsyncStorage.setItem("reviewedOrderIds", JSON.stringify([...updated]));
        return updated;
      });
      setReviewModalVisible(false);
      setReviewOrder(null);
      Alert.alert("Review Submitted", "Thanks for your feedback!");
    } catch (error) {
      console.error("Failed to submit review:", error);
      Alert.alert(
        "Review failed",
        error instanceof Error ? error.message : "Unable to submit review right now.",
      );
    }
  };

  const closeReviewModal = () => {
    setReviewModalVisible(false);
    setReviewOrder(null);
  };

  const openRunnerReviews = async (runnerId: string) => {
    setRunnerReviewsVisible(true);
    setRunnerReviewsLoading(true);
    setRunnerReviews([]);
    setReviewerProfiles({});
    try {
      const reviews: Review[] = await getReviews(runnerId) ?? [];
      setRunnerReviews(reviews);
      const uniqueIds = [...new Set(reviews.map((r) => r.reviewer_id))];
      const fetched = await Promise.all(uniqueIds.map((id) => getUserProfile(id)));
      const cache: Record<string, UserProfile | null> = {};
      uniqueIds.forEach((id, i) => { cache[id] = fetched[i]; });
      setReviewerProfiles(cache);
    } catch (error) {
      console.error("Failed to load runner reviews:", error);
    } finally {
      setRunnerReviewsLoading(false);
    }
  };

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
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.userName}>
              {userData?.name?.trim() || userData?.email || "Foodit User"}
            </Text>
          </View>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <View style={styles.tabBar}>
            <TabButton
              label="My Orders"
              count={
                myOrders.filter(
                  (order) =>
                    order.status === "PENDING" || order.status === "ACCEPTED",
                ).length
              }
              active={activeTab === "orders"}
              onPress={() => setActiveTab("orders")}
            />
            <TabButton
              label="Deliveries"
              count={acceptedDeliveries.length}
              active={activeTab === "deliveries"}
              onPress={() => setActiveTab("deliveries")}
            />
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {activeTab === "orders" ? (
            <OrdersTab
              orders={myOrders}
              onCancel={loadOrders}
              onPressOrder={openOrderModal}
            />
          ) : (
            <DeliveriesTab
              acceptedDeliveries={acceptedDeliveries}
              newJobs={pendingOrders.filter(
                (order) =>
                  order.status === "PENDING" &&
                  order.buyer_id !== userData?.userId,
              )}
              storesById={storesById}
              onAccept={acceptJob}
              onComplete={completeDelivery}
              onPressOrder={openOrderModal}
            />
          )}
        </View>
      </ScrollView>
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {selectedOrder && (
              <>
                {/* Drag handle */}
                <View style={styles.modalHandle} />

                {/* Header */}
                <View style={styles.modalHeader}>
                  {runnerReviewsVisible ? (
                    <Pressable onPress={() => setRunnerReviewsVisible(false)} style={styles.modalBackButton}>
                      <Text style={styles.modalBackButtonText}>← Back</Text>
                    </Pressable>
                  ) : null}
                  <Text style={styles.modalTitle}>
                    {runnerReviewsVisible ? "Runner Reviews" : "Order Details"}
                  </Text>
                  <Pressable onPress={closeOrderModal} style={styles.modalCloseX}>
                    <Text style={styles.modalCloseXText}>✕</Text>
                  </Pressable>
                </View>

                {/* Runner reviews panel */}
                {runnerReviewsVisible ? (
                  <>
                    {runnerReviewsLoading ? (
                      <View style={styles.reviewsLoading}>
                        <Text style={styles.reviewsLoadingText}>Loading reviews…</Text>
                      </View>
                    ) : runnerReviews.length === 0 ? (
                      <View style={styles.reviewsLoading}>
                        <Text style={styles.reviewsLoadingText}>No reviews yet</Text>
                      </View>
                    ) : (
                      <ScrollView showsVerticalScrollIndicator={false} style={styles.reviewsList}>
                        {runnerReviews.map((review) => {
                          const reviewer = reviewerProfiles[review.reviewer_id];
                          const reviewerName = reviewer?.name ?? "Anonymous";
                          return (
                            <View key={review.id} style={styles.reviewItem}>
                              {/* Reviewer row */}
                              <View style={styles.reviewerRow}>
                                {reviewer?.picture ? (
                                  <Image source={{ uri: reviewer.picture }} style={styles.reviewerAvatar} />
                                ) : (
                                  <View style={[styles.reviewerAvatar, styles.reviewerAvatarFallback]}>
                                    <Text style={styles.reviewerAvatarInitial}>
                                      {reviewerName.charAt(0).toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                                <View style={styles.reviewerInfo}>
                                  <Text style={styles.reviewerName}>{reviewerName}</Text>
                                  <Text style={styles.reviewDate}>
                                    {new Date(review.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                  </Text>
                                </View>
                                <View style={styles.reviewStars}>
                                  {[1,2,3,4,5].map((s) => (
                                    <Text key={s} style={[styles.reviewStar, s <= review.rating && styles.reviewStarFilled]}>★</Text>
                                  ))}
                                </View>
                              </View>
                              {!!review.description && (
                                <Text style={styles.reviewDescription}>{review.description}</Text>
                              )}
                            </View>
                          );
                        })}
                      </ScrollView>
                    )}
                  </>
                ) : (
                  <>

                {/* Status badge */}
                <View style={styles.modalStatusRow}>
                  <View style={[styles.modalStatusBadge, { backgroundColor: getStatusColor(selectedOrder.status).bg }]}>
                    <Text style={[styles.modalStatusText, { color: getStatusColor(selectedOrder.status).text }]}>
                      {selectedOrder.status}
                    </Text>
                  </View>
                </View>

                <View style={styles.modalDivider} />

                {/* Buyer & Runner */}
                <View style={styles.modalPeopleRow}>
                  <View style={styles.modalPersonCard}>
                    <Text style={styles.modalLabel}>Buyer</Text>
                    {buyerProfile?.picture ? (
                      <Image source={{ uri: buyerProfile.picture }} style={styles.modalAvatarLg} />
                    ) : (
                      <View style={[styles.modalAvatarLg, styles.modalAvatarFallback]}>
                        <Text style={styles.modalAvatarInitialLg}>
                          {(buyerProfile?.name ?? selectedOrder.buyer_id).charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.modalPersonName} numberOfLines={1}>
                      {buyerProfile?.name ?? selectedOrder.buyer_id}
                    </Text>
                  </View>

                  <View style={styles.modalPersonSeparator} />

                  <View style={styles.modalPersonCard}>
                    <Text style={styles.modalLabel}>Runner</Text>
                    {selectedOrder.runner_id ? (
                      <>
                        <Pressable onPress={() => openRunnerReviews(selectedOrder.runner_id!)}>
                          {runnerProfile?.picture ? (
                            <Image source={{ uri: runnerProfile.picture }} style={styles.modalAvatarLg} />
                          ) : (
                            <View style={[styles.modalAvatarLg, styles.modalAvatarFallback]}>
                              <Text style={styles.modalAvatarInitialLg}>
                                {(runnerProfile?.name ?? selectedOrder.runner_id).charAt(0).toUpperCase()}
                              </Text>
                            </View>
                          )}
                        </Pressable>
                        <Text style={styles.modalPersonName} numberOfLines={1}>
                          {runnerProfile?.name ?? selectedOrder.runner_id}
                        </Text>
                      </>
                    ) : (
                      <>
                        <View style={[styles.modalAvatarLg, styles.modalAvatarUnassigned]}>
                          <Text style={styles.modalAvatarInitialLg}>?</Text>
                        </View>
                        <Text style={[styles.modalPersonName, { color: Colors.textMuted }]}>Unassigned</Text>
                      </>
                    )}
                  </View>
                </View>

                <View style={styles.modalDivider} />

                {/* Store & Drop-off */}
                <View style={styles.modalSection}>
                  <Text style={styles.modalLabel}>Store</Text>
                  <Text style={styles.modalSectionValue}>
                    {storesById[selectedOrder.menu_store_id]?.name ?? selectedOrder.menu_store_id}
                  </Text>
                  {storesById[selectedOrder.menu_store_id]?.address && (
                    <Text style={styles.modalSectionSub}>
                      {storesById[selectedOrder.menu_store_id].address}
                    </Text>
                  )}
                </View>

                <View style={styles.modalSection}>
                  <Text style={styles.modalLabel}>Drop-off</Text>
                  <Text style={styles.modalSectionValue}>
                    {selectedOrder.drop_off?.address || "No drop-off"}
                  </Text>
                </View>

                {getOrderDescription(selectedOrder) ? (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>Notes</Text>
                    <Text style={styles.modalSectionValue}>
                      {getOrderDescription(selectedOrder)}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.modalDivider} />

                {/* Items */}
                <View style={styles.modalSection}>
                  <Text style={styles.modalLabel}>Items</Text>
                  {selectedOrder.items?.length ? (
                    selectedOrder.items.map((item, i) => (
                      <View key={i} style={styles.modalItemRow}>
                        <View style={styles.modalItemQtyBadge}>
                          <Text style={styles.modalItemQtyText}>{item.quantity}×</Text>
                        </View>
                        <Text style={styles.modalItemName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.modalItemPrice}>${(item.unit_price / 100).toFixed(2)}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.modalSectionValue}>No items</Text>
                  )}
                </View>

                <View style={styles.modalDivider} />

                {/* Cost summary */}
                <View style={styles.modalCostRow}>
                  <Text style={styles.modalCostLabel}>Food Cost</Text>
                  <Text style={styles.modalCostValue}>${(selectedOrder.food_cost / 100).toFixed(2)}</Text>
                </View>
                <View style={styles.modalCostRow}>
                  <Text style={styles.modalCostLabel}>Delivery Fee</Text>
                  <Text style={styles.modalCostValue}>${(selectedOrder.delivery_fee / 100).toFixed(2)}</Text>
                </View>
                <View style={styles.modalCostRow}>
                  <Text style={styles.modalCostLabel}>Platform Fee</Text>
                  <Text style={styles.modalCostValue}>${((selectedOrder.platform_fee ?? 0) / 100).toFixed(2)}</Text>
                </View>
                <View style={[styles.modalCostRow, styles.modalCostTotal]}>
                  <Text style={styles.modalCostTotalLabel}>Total</Text>
                  <Text style={styles.modalCostTotalValue}>
                    ${((selectedOrder.total_amount ?? 0) / 100).toFixed(2)}
                  </Text>
                </View>

                {/* Action buttons */}
                <View style={styles.modalActions}>
                  {selectedOrder.status === "PENDING" && (
                    <Pressable
                      style={styles.modalCancelButton}
                      onPress={() => {
                        closeOrderModal();
                        cancelManagedOrder(selectedOrder.order_id)
                          .then(loadOrders)
                          .catch((e) => Alert.alert("Cancel failed", e instanceof Error ? e.message : "Try again."));
                      }}
                    >
                      <Text style={styles.modalCancelButtonText}>Cancel Order</Text>
                    </Pressable>
                  )}
                  {(selectedOrder.status === "COMPLETED" || selectedOrder.status === "MIA") &&
                    selectedOrder.runner_id &&
                    !reviewedOrderIds.has(selectedOrder.order_id) && (
                    <Pressable
                      style={styles.modalReviewButton}
                      onPress={() => {
                        closeOrderModal();
                        openReviewModal(selectedOrder);
                      }}
                    >
                      <Text style={styles.modalReviewButtonText}>Leave Review</Text>
                    </Pressable>
                  )}
                </View>
                </>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
      <ReviewModal
        visible={reviewModalVisible}
        runnerId={reviewOrder?.runner_id ?? ""}
        onSubmit={handleReviewSubmit}
        onClose={closeReviewModal}
      />
    </SafeScreen>
  );
}

// Tab Button Component
function TabButton({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tabButton, active && styles.tabButtonActive]}
    >
      <Text
        style={[styles.tabButtonText, active && styles.tabButtonTextActive]}
      >
        {label}
      </Text>
      <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
        <Text
          style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

function OrdersTab({
  orders,
  onCancel,
  onPressOrder,
}: {
  orders: BackendOrder[];
  onCancel: () => Promise<void>;
  onPressOrder: (order: BackendOrder) => void;
}) {
  const activeOrders = orders.filter(
    (o) => o.status === "PENDING" || o.status === "ACCEPTED",
  );
  const completedOrders = orders.filter(
    (o) =>
      o.status === "COMPLETED" || o.status === "CANCELLED" || o.status === "MIA",
  );

  async function handleCancel(orderId: string) {
    try {
      await cancelManagedOrder(orderId);
      await onCancel();
      Alert.alert("Order Cancelled", "Your order has been cancelled.");
    } catch (error) {
      console.error("Failed to cancel order:", error);
      Alert.alert(
        "Cancel failed",
        error instanceof Error
          ? error.message
          : "Unable to cancel this order right now.",
      );
    }
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        title="No orders yet"
        description="Your food orders will appear here when you place them."
      />
    );
  }

  return (
    <View style={styles.tabContent}>
      {activeOrders.length > 0 && (
        <View style={styles.section}>
          <SectionHeader
            title="In Progress"
            subtitle={`${activeOrders.length} orders`}
          />
          <View style={styles.cardList}>
            {activeOrders.map((order) => {
              const firstItem = order.items?.[0];
              const description = getOrderDescription(order);
              const totalPaid = (order.total_amount ?? 0) / 100;

              return (
                <OrderCard
                  key={order.order_id}
                  foodName={firstItem?.name ?? "Order"}
                  description={description}
                  pricePaid={totalPaid}
                  status={order.status}
                  date={formatOrderDate(order.created_at)}
                  onPress={() => onPressOrder(order)}
                />
              );
            })}
          </View>
        </View>
      )}

      {completedOrders.length > 0 && (
        <View style={styles.section}>
          <SectionHeader
            title="Completed"
            subtitle={`${completedOrders.length} orders`}
          />
          <View style={styles.cardList}>
            {completedOrders.map((order) => {
              const firstItem = order.items?.[0];
              const description = getOrderDescription(order);
              const totalPaid = (order.total_amount ?? 0) / 100;

              return (
                <OrderCard
                  key={order.order_id}
                  foodName={firstItem?.name ?? "Order"}
                  description={description}
                  pricePaid={totalPaid}
                  status={order.status}
                  date={formatOrderDate(order.created_at)}
                  onPress={() => onPressOrder(order)}
                />
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

function DeliveriesTab({
  acceptedDeliveries,
  newJobs,
  storesById,
  onAccept,
  onComplete,
  onPressOrder,
}: {
  acceptedDeliveries: BackendOrder[];
  newJobs: BackendOrder[];
  storesById: Record<string, Store>;
  onAccept: (id: string) => void;
  onComplete: (id: string) => void;
  onPressOrder: (order: BackendOrder) => void;
}) {
  function getPickupLabel(storeId: string) {
    const directStore = storesById[storeId];
    if (directStore) {
      return `${directStore.name} • ${directStore.address}`;
    }

    const matchedStore = Object.values(storesById).find(
      (store) => store.store_id === storeId || store.place_id === storeId,
    );

    if (matchedStore) {
      return `${matchedStore.name} • ${matchedStore.address}`;
    }

    return storeId;
  }
  if (acceptedDeliveries.length === 0 && newJobs.length === 0) {
    return (
      <View style={styles.tabContent}>
        <EmptyState
          title="No active deliveries"
          description="You have not accepted any deliveries yet."
        />
        <View style={styles.section}>
          <SectionHeader title="Available Jobs" />
          <EmptyState
            title="No delivery jobs available"
            description="Check back later for new delivery opportunities."
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      {acceptedDeliveries.length > 0 && (
        <View style={styles.section}>
          <SectionHeader
            title="Active Deliveries"
            subtitle={`${acceptedDeliveries.length} in progress`}
          />
          <View style={styles.cardList}>
            {acceptedDeliveries.map((delivery) => {
              const firstItem = delivery.items?.[0];
              const description = getOrderDescription(delivery);
              const itemsSummary = getOrderItemsSummary(delivery);
              return (
                <Pressable
                  key={delivery.order_id}
                  onPress={() => onPressOrder(delivery)}
                >
                  <DeliveryCard
                    summary={firstItem?.name ?? "Delivery"}
                    description={description}
                    itemsSummary={itemsSummary}
                    deliveryFeeLabel="DELIVERY FEE"
                    pickup={getPickupLabel(delivery.menu_store_id)}
                    dropoff={delivery.drop_off?.address ?? "No drop-off"}
                    feeEarned={(delivery.transfer_amount ?? 0) / 100}
                    date={formatOrderDate(delivery.created_at)}
                    onComplete={() => onComplete(delivery.order_id)}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <SectionHeader
          title="Available Jobs"
          action={
            newJobs.length > 0 ? (
              <Badge
                label={`${newJobs.length} new`}
                variant="primary"
                size="sm"
              />
            ) : undefined
          }
        />
        {newJobs.length > 0 ? (
          <View style={styles.cardList}>
            {newJobs.map((job) => {
              const firstItem = job.items?.[0];
              const description = getOrderDescription(job);
              const itemsSummary = getOrderItemsSummary(job);
              return (
                <Pressable key={job.order_id} onPress={() => onPressOrder(job)}>
                  <DeliveryCard
                    summary={firstItem?.name ?? "New delivery request"}
                    description={description}
                    itemsSummary={itemsSummary}
                    deliveryFeeLabel="DELIVERY FEE"
                    pickup={getPickupLabel(job.menu_store_id)}
                    dropoff={job.drop_off?.address ?? "On-campus location"}
                    feeEarned={(job.transfer_amount ?? 0) / 100}
                    date={formatOrderDate(job.created_at)}
                    onAccept={() => onAccept(job.order_id)}
                  />
                </Pressable>
              );
            })}
          </View>
        ) : (
          <EmptyState
            title="No delivery jobs available"
            description="Check back later for new delivery opportunities."
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingBottom: Spacing.xxxl,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  greeting: {
    ...Typography.bodySmall,
  },
  userName: {
    ...Typography.h1,
  },
  // Tabs
  tabContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xs,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.sm,
  },
  tabButtonActive: {
    backgroundColor: Colors.primary,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: FontWeights.semibold,
    color: Colors.textSecondary,
  },
  tabButtonTextActive: {
    color: Colors.textInverse,
  },
  tabBadge: {
    backgroundColor: Colors.borderLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    minWidth: 20,
    alignItems: "center",
  },
  tabBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: FontWeights.bold,
    color: Colors.textSecondary,
  },
  tabBadgeTextActive: {
    color: Colors.textInverse,
  },

  // Content
  content: {
    paddingHorizontal: Spacing.xl,
  },
  tabContent: {
    gap: Spacing.xl,
  },
  section: {
    gap: Spacing.md,
  },
  cardList: {
    gap: Spacing.md,
  },
  orderCardWrapper: {
    gap: Spacing.sm,
  },
  secondaryActionButton: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  secondaryActionButtonText: {
    ...Typography.bodySmall,
    color: Colors.text,
    fontWeight: FontWeights.semibold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.md,
    ...Shadows.lg,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: Spacing.xs,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.text,
  },
  modalCloseX: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseXText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeights.semibold,
  },
  modalStatusRow: {
    flexDirection: "row",
  },
  modalStatusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  modalStatusText: {
    ...Typography.labelSmall,
    fontWeight: FontWeights.semibold,
  },
  modalDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
  },
  modalPeopleRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  modalPersonCard: {
    flex: 1,
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    minWidth: 0,
  },
  modalPersonSeparator: {
    width: 1,
    backgroundColor: Colors.borderLight,
  },
  modalAvatarLg: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  modalAvatarFallback: {
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  modalAvatarUnassigned: {
    backgroundColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  modalAvatarInitialLg: {
    fontSize: FontSizes.lg,
    color: Colors.textInverse,
    fontWeight: FontWeights.semibold,
  },
  modalPersonName: {
    ...Typography.labelSmall,
    color: Colors.text,
    fontWeight: FontWeights.medium,
    textAlign: "center",
    maxWidth: "100%",
  },
  modalSection: {
    gap: Spacing.xs,
  },
  modalLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  modalSectionValue: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: FontWeights.medium,
  },
  modalSectionSub: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  modalItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  modalItemQtyBadge: {
    backgroundColor: Colors.primaryMuted,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: "center",
  },
  modalItemQtyText: {
    fontSize: FontSizes.xs,
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  modalItemName: {
    flex: 1,
    ...Typography.body,
    color: Colors.text,
  },
  modalItemPrice: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
  modalCostRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalCostLabel: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  modalCostValue: {
    ...Typography.bodySmall,
    color: Colors.text,
    fontWeight: FontWeights.medium,
  },
  modalCostTotal: {
    marginTop: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  modalCostTotalLabel: {
    ...Typography.label,
    color: Colors.text,
    fontWeight: FontWeights.semibold,
  },
  modalCostTotalValue: {
    ...Typography.label,
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  modalCloseButton: {
    marginTop: Spacing.xs,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  modalCloseButtonText: {
    ...Typography.label,
    color: Colors.textInverse,
    fontWeight: FontWeights.semibold,
  },
  reviewButton: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  reviewButtonText: {
    ...Typography.bodySmall,
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  modalBackButton: {
    marginRight: Spacing.sm,
  },
  modalBackButtonText: {
    ...Typography.label,
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  modalActions: {
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  modalCancelButton: {
    backgroundColor: Colors.errorLight,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  modalCancelButtonText: {
    ...Typography.label,
    color: Colors.error,
    fontWeight: FontWeights.semibold,
  },
  modalReviewButton: {
    backgroundColor: Colors.primaryMuted,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  modalReviewButtonText: {
    ...Typography.label,
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  reviewerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  reviewerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  reviewerAvatarFallback: {
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  reviewerAvatarInitial: {
    ...Typography.bodySmall,
    color: Colors.textInverse,
    fontWeight: FontWeights.semibold,
  },
  reviewerInfo: {
    flex: 1,
    gap: 2,
  },
  reviewerName: {
    ...Typography.bodySmall,
    color: Colors.text,
    fontWeight: FontWeights.semibold,
  },
  reviewsLoading: {
    paddingVertical: Spacing.xl,
    alignItems: "center",
  },
  reviewsLoadingText: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
  },
  reviewsList: {
    maxHeight: 320,
  },
  reviewItem: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: Spacing.xs,
  },
  reviewItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reviewStars: {
    flexDirection: "row",
    gap: 2,
  },
  reviewStar: {
    fontSize: FontSizes.md,
    color: Colors.border,
  },
  reviewStarFilled: {
    color: "#FBBF24",
  },
  reviewDate: {
    ...Typography.caption,
    color: Colors.textMuted,
    textTransform: "none",
    letterSpacing: 0,
  },
  reviewDescription: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
});
