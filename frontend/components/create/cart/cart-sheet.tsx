import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Button } from '@/components/ui';
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  FontWeights,
} from '@/constants/theme';
import LocationSearchInput, { SelectedLocation } from './location-search-input';

const PLATFORM_FEE = 0.1;

export type CartLine = {
  storeId: string;
  itemId: string;
  name: string;
  price: number;
  qty: number;
};

type Props = {
  cart: CartLine[];
  storeName: string;
  subtotal: number;
  deliveryFee: number | null;
  isCalculatingFee: boolean;
  feeError: string | null;
  location: string;
  notes: string;

  onClose: () => void;
  onClear: () => void;
  onIncrease: (itemId: string) => void;
  onDecrease: (itemId: string) => void;
  onSelectLocation: (loc: string) => void;
  onSelectDropoff: (loc: SelectedLocation) => void;
  onChangeNotes: (text: string) => void;
  onPlaceOrder: () => void;
};

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export function CartSheet({
  cart,
  storeName,
  subtotal,
  deliveryFee,
  isCalculatingFee,
  feeError,
  location,
  notes,
  onClose,
  onClear,
  onIncrease,
  onDecrease,
  onSelectLocation,
  onSelectDropoff,
  onChangeNotes,
  onPlaceOrder,
}: Props) {
  const total = subtotal + (deliveryFee ?? 0) + PLATFORM_FEE;
  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Order</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Store row */}
        <View style={styles.storeRow}>
          <Text style={styles.storeName} numberOfLines={1}>
            {storeName || 'Store'}
          </Text>
          <Pressable onPress={onClear} hitSlop={8}>
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        </View>

        {/* Items */}
        {cart.length === 0 ? (
          <Text style={styles.empty}>Your cart is empty.</Text>
        ) : (
          cart.map((l, index) => (
            <View
              key={l.itemId}
              style={[
                styles.itemRow,
                index === cart.length - 1 && styles.itemRowLast,
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{l.name}</Text>
                <Text style={styles.itemPrice}>{money(l.price)}</Text>
              </View>

              <View style={styles.qtyWrap}>
                <Pressable
                  style={styles.qtyCircle}
                  onPress={() => onDecrease(l.itemId)}
                >
                  <Text style={styles.qtyCircleText}>−</Text>
                </Pressable>

                <Text style={styles.qtyNumber}>{l.qty}</Text>

                <Pressable
                  style={styles.qtyCircle}
                  onPress={() => onIncrease(l.itemId)}
                >
                  <Text style={styles.qtyCircleText}>+</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        {/* Drop-off */}
        <Text style={[styles.sectionTitle, styles.dropoffTitle]}>Drop-off Location</Text>

        <LocationSearchInput
          value={location}
          onChangeValue={onSelectLocation}
          onSelectSuggestion={(place) => {
            const formatted = place.address
              ? `${place.name}\n${place.address}`
              : place.name;

            onSelectLocation(formatted);
            onSelectDropoff(place);
          }}
          placeholder="Search for your drop-off location"
        />

        {/* Notes */}
        <Text style={[styles.sectionTitle, styles.notesTitle]}>Notes for runner (optional)</Text>
        <TextInput
          placeholder="E.g., no chilli, call me when you're here..."
          placeholderTextColor={Colors.textMuted}
          value={notes}
          onChangeText={onChangeNotes}
          style={styles.notesInput}
        />

        {/* Order Summary */}
        <View style={styles.summarySection}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>{money(subtotal)}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Delivery Fee</Text>
            {isCalculatingFee ? (
              <ActivityIndicator size="small" color={Colors.textMuted} />
            ) : feeError ? (
              <Text style={styles.summaryValueError}>{feeError}</Text>
            ) : deliveryFee !== null ? (
              <Text style={styles.summaryValue}>{money(deliveryFee)}</Text>
            ) : (
              <Text style={styles.summaryValueMuted}>Select location</Text>
            )}
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Platform Fee</Text>
            <Text style={styles.summaryValue}>{money(PLATFORM_FEE)}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total</Text>
            {deliveryFee !== null ? (
              <Text style={styles.totalValue}>{money(total)}</Text>
            ) : (
              <Text style={styles.totalValueMuted}>--</Text>
            )}
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Sticky Footer */}
      <View style={styles.footer}>
        <Button
          title="Place Order"
          disabled={!cart.length}
          onPress={onPlaceOrder}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },

  header: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitle: {
    ...Typography.h4,
    flex: 1,
  },
  close: { fontSize: 18, color: Colors.textMuted },

  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 16,
    flexGrow: 1,
  },

  storeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  storeName: {
    fontSize: 16,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
    flex: 1,
  },
  clear: {
    fontSize: 16,
    fontWeight: FontWeights.semibold,
    color: '#E11D48',
  },

  empty: {
    ...Typography.body,
    color: Colors.textMuted,
  },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  itemRowLast: {
    borderBottomWidth: 0,
  },
  itemName: {
    fontSize: 18,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  itemPrice: {
    marginTop: 6,
    fontSize: 14,
    color: Colors.textMuted,
  },

  qtyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginLeft: 12,
  },
  qtyCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyCircleText: { fontSize: 20 },
  qtyNumber: {
    fontSize: 16,
    fontWeight: FontWeights.semibold,
  },

  sectionTitle: {
    marginBottom: 10,
    fontSize: 16,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  dropoffTitle: {
    marginTop: 20,
  },
  notesTitle: {
    marginTop: 24,
  },

  notesInput: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    color: Colors.text,
  },

  summarySection: {
    marginTop: 22,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 15,
    color: Colors.textMuted,
  },
  summaryValue: {
    fontSize: 15,
    color: Colors.text,
  },
  summaryValueMuted: {
    fontSize: 15,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  summaryValueError: {
    fontSize: 15,
    color: '#E11D48',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: FontWeights.semibold,
    color: Colors.text,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: FontWeights.bold,
    color: Colors.text,
  },
  totalValueMuted: {
    fontSize: 18,
    fontWeight: FontWeights.bold,
    color: Colors.textMuted,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
});