import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  Alert,
  Image,
  RefreshControl,
} from "react-native";
import { SafeScreen } from "@/components/safe-screen";
import { Button } from "@/components/ui";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { StoreCard } from "@/components/create/store-card";
import { MenuItemCard } from "@/components/create/menu-item-card";
import { CartSheet } from "@/components/create/cart/cart-sheet";
import { SelectedLocation } from "@/components/create/cart/location-search-input";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { getGoogleRoute } from "@/services/google-routes";
import { calculateDeliveryFee } from "@/utils/delivery-fee";
import { getOptionalText } from "@/utils/text";
import { getAccessToken, getStoredUserData } from "@/lib/auth-utils";
import {
  checkoutOrder,
  type CheckoutOrderPayload,
} from "@/services/order-management-service";

const API_BASE = process.env.EXPO_PUBLIC_API_URL!;

type MenuItem = { id: string; name: string; price: number };
type Store = {
  id: string;
  name: string;
  cuisine: string;
  imageUrl: string;
  address: string;
  lat: number;
  lng: number;
  placeId: string;
  menu: MenuItem[];
};
type CartLine = {
  storeId: string;
  itemId: string;
  name: string;
  price: number;
  qty: number;
};

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export default function CreateScreen() {
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [activeModal, setActiveModal] = useState<null | "cart" | "qty">(null);
  const [qtyItem, setQtyItem] = useState<MenuItem | null>(null);
  const [qtyValue, setQtyValue] = useState(1);
  const [location, setLocation] = useState<string>("");
  const [dropoffLocation, setDropoffLocation] =
    useState<SelectedLocation | null>(null);
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null);
  const [isCalculatingFee, setIsCalculatingFee] = useState(false);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadStores = useCallback(async () => {
    try {
      setLoadingStores(true);
      const accessToken = await getAccessToken();
      const res = await fetch(`${API_BASE}/stores`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const data = await res.json();

      const mapped: Store[] = data.map((s: any) => ({
        id: s.store_id,
        name: s.name,
        cuisine: s.cuisine,
        imageUrl: s.image_url,
        address: s.address,
        lat: Number(s.lat),
        lng: Number(s.lng),
        placeId: s.place_id,
        menu: [],
      }));

      setStores(mapped);
    } catch (err) {
      console.error("Failed to load stores", err);
    } finally {
      setLoadingStores(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStores();
    setRefreshing(false);
  }, [loadStores]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  const subtotal = useMemo(
    () => cart.reduce((s, l) => s + l.qty * l.price, 0),
    [cart],
  );

  const cartStoreName = useMemo(() => {
    if (cart.length === 0) return "";
    const store = stores.find((s) => s.id === cart[0].storeId);
    return store?.name ?? "";
  }, [cart, stores]);

  async function openStore(store: Store) {
    try {
      const accessToken = await getAccessToken();
      const res = await fetch(`${API_BASE}/stores/${store.id}/items`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const data = await res.json();

      const menu: MenuItem[] = data.map((i: any) => ({
        id: i.item_id,
        name: i.name,
        price: i.price,
      }));

      setSelectedStore({ ...store, menu });
    } catch (err) {
      console.error("Failed to load menu", err);
    }
  }

  function openQty(item: MenuItem) {
    setQtyItem(item);
    setQtyValue(1);
    setActiveModal("qty");
  }

  function confirmQty() {
    if (!selectedStore || !qtyItem) return;

    // Prevent adding from another store
    if (cart.length > 0 && cart[0].storeId !== selectedStore.id) {
      Alert.alert(
        "Different store selected",
        "You can only order from one store at a time. Please clear your cart first.",
      );
      setActiveModal(null);
      return;
    }

    setCart((prev) => {
      const idx = prev.findIndex(
        (l) => l.itemId === qtyItem.id && l.storeId === selectedStore.id,
      );

      if (idx === -1) {
        return [
          ...prev,
          {
            storeId: selectedStore.id,
            itemId: qtyItem.id,
            name: qtyItem.name,
            price: qtyItem.price,
            qty: qtyValue,
          },
        ];
      }

      const next = [...prev];
      next[idx].qty += qtyValue;
      return next;
    });

    setActiveModal(null);
  }

  async function placeOrder() {
    if (!cart.length) {
      Alert.alert(
        "Cart is empty",
        "Please add at least one item before placing your order.",
      );
      return;
    }

    if (
      deliveryFee == null ||
      deliveryFee <= 0 ||
      !dropoffLocation ||
      dropoffLocation.lat == null ||
      dropoffLocation.lng == null ||
      !location.trim()
    ) {
      Alert.alert(
        "Delivery location required",
        "Please select a valid drop-off location first.",
      );
      return;
    }

    try {
      const storedUser = await getStoredUserData();
      const buyerId = storedUser?.userId?.trim();

      if (!buyerId) {
        Alert.alert(
          "User not found",
          "Please sign in again before placing your order.",
        );
        return;
      }

      if (!cart[0]?.storeId?.trim()) {
        Alert.alert("Store missing", "Unable to determine the selected store.");
        return;
      }

      const platformFee = 0.1;
      const foodCostCents = toCents(subtotal);
      const deliveryFeeCents = toCents(deliveryFee);
      const platformFeeCents = toCents(platformFee);

      if (
        !Number.isFinite(foodCostCents) ||
        !Number.isFinite(deliveryFeeCents) ||
        !Number.isFinite(platformFeeCents) ||
        foodCostCents <= 0 ||
        deliveryFeeCents <= 0 ||
        platformFeeCents < 0
      ) {
        Alert.alert(
          "Invalid order amount",
          "Please review your cart totals and try again.",
        );
        return;
      }

      const items = cart.map((line) => ({
        menu_item_id: line.itemId,
        name: line.name.trim(),
        quantity: line.qty,
        unit_price: toCents(line.price),
      }));

      if (
        items.some(
          (item) =>
            !item.menu_item_id.trim() ||
            !item.name ||
            !Number.isInteger(item.quantity) ||
            item.quantity <= 0 ||
            !Number.isFinite(item.unit_price) ||
            item.unit_price <= 0,
        )
      ) {
        Alert.alert(
          "Invalid cart items",
          "One or more cart items has invalid data.",
        );
        return;
      }

      const payload: CheckoutOrderPayload = {
        buyer_id: buyerId,
        menu_store_id: cart[0].storeId.trim(),
        items,
        description: getOptionalText(notes),
        food_cost: foodCostCents,
        delivery_fee: deliveryFeeCents,
        platform_fee: platformFeeCents,
        drop_off: {
          latitude: dropoffLocation.lat,
          longitude: dropoffLocation.lng,
          address: location.trim(),
        },
      };

      console.log("Sending order payload:", payload);

      const createdOrder = await checkoutOrder(payload);
      console.log("Order response data:", createdOrder);

      console.log("Created order:", createdOrder);
      Alert.alert("Order Placed");

      setCart([]);
      setNotes("");
      setDeliveryFee(null);
      setDropoffLocation(null);
      setLocation("");
      setActiveModal(null);
    } catch (err) {
      console.error("Failed to place order", err);
      Alert.alert(
        "Order failed",
        err instanceof Error
          ? err.message
          : "Something went wrong while placing your order.",
      );
    }
  }

  function clearCart() {
    setCart([]);
  }

  function increaseCartItem(itemId: string) {
    setCart((prev) =>
      prev.map((item) =>
        item.itemId === itemId ? { ...item, qty: item.qty + 1 } : item,
      ),
    );
  }

  function decreaseCartItem(itemId: string) {
    setCart((prev) =>
      prev
        .map((item) =>
          item.itemId === itemId ? { ...item, qty: item.qty - 1 } : item,
        )
        .filter((item) => item.qty > 0),
    );
  }

  async function handleSelectDropoff(selectedLoc: SelectedLocation) {
    setDropoffLocation(selectedLoc);
    setFeeError(null);

    // Check if cart is empty
    if (cart.length === 0) {
      setDeliveryFee(null);
      setFeeError("Add items to cart first");
      return;
    }

    // Get the store for the current cart
    const cartStore = stores.find((s) => s.id === cart[0].storeId);

    if (!cartStore) {
      setDeliveryFee(null);
      setFeeError("Store not found");
      return;
    }

    if (selectedLoc.lat == null || selectedLoc.lng == null) {
      setDeliveryFee(null);
      setFeeError("Invalid location");
      return;
    }

    try {
      setIsCalculatingFee(true);
      const route = await getGoogleRoute({
        origin: { latitude: cartStore.lat, longitude: cartStore.lng },
        destination: { latitude: selectedLoc.lat, longitude: selectedLoc.lng },
      });
      const fee = calculateDeliveryFee(route.distanceMeters);
      setDeliveryFee(fee);
    } catch (err) {
      console.error("Failed to calculate delivery fee", err);
      setDeliveryFee(null);
      setFeeError("Failed to calculate fee");
    } finally {
      setIsCalculatingFee(false);
    }
  }

  return (
    <SafeScreen>
      <View style={styles.screensContainer}>
        {/* Stores List */}
        <View
          style={[
            styles.screen,
            selectedStore ? styles.screenHidden : styles.screenVisible,
          ]}
        >
          <ScrollView
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
            <View style={styles.header}>
              <Text style={styles.pageTitle}>Food</Text>
              <Text style={styles.pageSubtitle}>Satisfy Your Cravings</Text>
            </View>

            <View style={styles.body}>
              {loadingStores ? (
                <>
                  {[1, 2, 3].map((i) => (
                    <View key={i} style={styles.storeCardWrap}>
                      <View style={styles.skeletonCard}>
                        <View style={styles.skeletonImage} />
                        <View style={styles.skeletonContent}>
                          <View style={styles.skeletonTitle} />
                          <View style={styles.skeletonSubtitle} />
                          <View style={styles.skeletonAddress} />
                        </View>
                      </View>
                    </View>
                  ))}
                </>
              ) : (
                stores.map((store) => (
                  <View key={store.id} style={styles.storeCardWrap}>
                    <StoreCard
                      name={store.name}
                      cuisine={store.cuisine}
                      imageUrl={store.imageUrl}
                      address={store.address}
                      onPress={() => openStore(store)}
                    />
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </View>

        {/* Menu View */}
        <View
          style={[
            styles.screen,
            selectedStore ? styles.screenVisible : styles.screenHidden,
          ]}
        >
          {selectedStore && (
            <ScrollView
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
              <View style={styles.header}>
                <Pressable onPress={() => setSelectedStore(null)}>
                  <Text style={styles.backText}>← Back to stores</Text>
                </Pressable>
                <Text style={styles.pageTitle}>{selectedStore.name}</Text>
                <Text style={styles.pageSubtitle}>{selectedStore.cuisine}</Text>
                <Text style={styles.storeAddress} numberOfLines={2}>
                  {selectedStore.address}
                </Text>
                <Image
                  source={{
                    uri: `https://maps.googleapis.com/maps/api/staticmap?center=${selectedStore.lat},${selectedStore.lng}&zoom=16&size=600x200&scale=2&markers=color:red%7C${selectedStore.lat},${selectedStore.lng}&key=${process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}`,
                  }}
                  style={styles.mapThumbnail}
                />
              </View>

              <View style={styles.body}>
                {selectedStore.menu.map((item, idx) => (
                  <View
                    key={item.id}
                    style={[
                      styles.menuCardWrap,
                      idx === selectedStore.menu.length - 1 &&
                        styles.menuCardWrapLast,
                    ]}
                  >
                    <MenuItemCard item={item} onAdd={openQty} />
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </View>

      {/* Floating cart */}
      <Pressable
        style={styles.fab}
        onPress={() => {
          setActiveModal("cart");
        }}
        accessibilityRole="button"
        accessibilityLabel="Open order cart"
      >
        <IconSymbol name="bag.fill" size={30} color={Colors.textMuted} />
        {cart.length > 0 && <View style={styles.fabDot} />}
      </Pressable>

      {/* Modal */}
      <Modal visible={activeModal !== null} transparent animationType="slide">
        <Pressable
          style={styles.backdrop}
          onPress={() => setActiveModal(null)}
        />

        <View style={styles.sheet}>
          {activeModal === "qty" && qtyItem && (
            <View style={styles.qtySheetContent}>
              <View style={styles.qtyHeader}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.modalTitle}>Select quantity</Text>
                  <Text style={styles.qtyItemName} numberOfLines={1}>
                    {qtyItem.name}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setActiveModal(null)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Close quantity"
                >
                  <Text style={styles.cartClose}>✕</Text>
                </Pressable>
              </View>

              <View style={styles.qtyRow}>
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() => setQtyValue((q) => Math.max(1, q - 1))}
                >
                  <Text style={styles.qtyBtnText}>−</Text>
                </Pressable>
                <Text style={styles.qtyValue}>{qtyValue}</Text>
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() => setQtyValue((q) => q + 1)}
                >
                  <Text style={styles.qtyBtnText}>+</Text>
                </Pressable>
              </View>

              <View style={styles.qtyActionRow}>
                <Button title="Add to Cart" onPress={confirmQty} />
              </View>
            </View>
          )}

          {activeModal === "cart" && (
            <CartSheet
              cart={cart}
              storeName={cartStoreName || "Store"}
              subtotal={subtotal}
              deliveryFee={deliveryFee}
              isCalculatingFee={isCalculatingFee}
              feeError={feeError}
              location={location}
              notes={notes}
              onClose={() => {
                setActiveModal(null);
              }}
              onClear={clearCart}
              onIncrease={increaseCartItem}
              onDecrease={decreaseCartItem}
              onSelectLocation={(loc) => {
                setLocation(loc);
              }}
              onSelectDropoff={handleSelectDropoff}
              onChangeNotes={setNotes}
              onPlaceOrder={placeOrder}
            />
          )}
        </View>
      </Modal>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  screensContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  screen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background,
  },
  screenVisible: {
    zIndex: 1,
  },
  screenHidden: {
    zIndex: 0,
    opacity: 0,
  },
  scrollContent: {
    paddingBottom: Spacing.xxxl,
  },

  // Header
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  body: {
    paddingHorizontal: Spacing.xl,
  },
  storeCardWrap: {
    marginBottom: Spacing.lg,
  },
  pageTitle: {
    ...Typography.h1,
  },
  pageSubtitle: {
    ...Typography.bodySmall,
    marginTop: Spacing.xs,
  },
  storeAddress: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  mapThumbnail: {
    height: 150,
    width: "100%",
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },

  backText: { marginBottom: 12, color: Colors.primary },

  menuCardWrap: {
    marginBottom: Spacing.lg,
  },
  menuCardWrapLast: {
    marginBottom: 0,
  },

  fab: {
    position: "absolute",
    right: 24,
    bottom: 24,
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: "center",
    zIndex: 10,
    justifyContent: "center",
    elevation: 6,
  },
  fabDot: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#E11D48",
    borderWidth: 2,
    borderColor: Colors.surface,
  },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "85%",
    overflow: "hidden",
  },

  modalTitle: { ...Typography.h4 },

  qtySheetContent: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 24,
  },
  qtyHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  qtyItemName: {
    marginTop: 6,
    fontSize: 14,
    color: Colors.textMuted,
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  qtyActionRow: {
    marginTop: 4,
  },
  qtyBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceHover,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnText: { fontSize: 22 },
  qtyValue: { marginHorizontal: 20, fontSize: 18 },

  cartClose: {
    fontSize: 18,
    color: Colors.textMuted,
  },

  skeletonCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  skeletonImage: {
    height: 140,
    width: "100%",
    backgroundColor: Colors.border,
  },
  skeletonContent: {
    padding: Spacing.lg,
  },
  skeletonTitle: {
    height: 20,
    width: "60%",
    backgroundColor: Colors.border,
    borderRadius: BorderRadius.sm,
  },
  skeletonSubtitle: {
    height: 14,
    width: "40%",
    backgroundColor: Colors.borderLight,
    borderRadius: BorderRadius.xs,
    marginTop: Spacing.sm,
  },
  skeletonAddress: {
    height: 14,
    width: "80%",
    backgroundColor: Colors.borderLight,
    borderRadius: BorderRadius.xs,
    marginTop: Spacing.sm,
  },
});
