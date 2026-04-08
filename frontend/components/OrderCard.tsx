import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import {
  Colors,
  BorderRadius,
  Spacing,
  Typography,
  Shadows,
  StatusColors,
  FontWeights,
  FontSizes,
} from '@/constants/theme';
import { getOptionalText } from '@/utils/text';

export type OrderStatus =
  | 'Preparing'
  | 'On the way'
  | 'Arrived'
  | 'PENDING'
  | 'ACCEPTED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'MIA';

type OrderCardProps = {
  foodName: string;
  description?: string;
  pricePaid: number;
  status: OrderStatus;
  date?: string;
  onPress?: () => void;
};

const STATUS_MAP: Record<OrderStatus, keyof typeof StatusColors> = {
  Preparing: 'preparing',
  'On the way': 'in-transit',
  Arrived: 'delivered',
  PENDING: 'preparing',
  ACCEPTED: 'in-transit',
  COMPLETED: 'delivered',
  CANCELLED: 'cancelled',
  MIA: 'cancelled',
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  Preparing: 'Preparing',
  'On the way': 'On the way',
  Arrived: 'Arrived',
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  MIA: 'MIA',
};

export default function OrderCard({
  foodName,
  description,
  pricePaid,
  status,
  date,
  onPress,
}: OrderCardProps) {
  const statusKey = STATUS_MAP[status] ?? 'preparing';
  const statusStyle = StatusColors[statusKey];
  const notes = getOptionalText(description);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && onPress && styles.cardPressed,
      ]}
    >
      {/* Status accent strip */}
      <View style={[styles.accentStrip, { backgroundColor: statusStyle.text }]} />

      <View style={styles.content}>
        {/* Header: food name + status badge */}
        <View style={styles.headerRow}>
          <Text style={styles.foodName} numberOfLines={1}>{foodName}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: statusStyle.text }]} />
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {STATUS_LABEL[status]}
            </Text>
          </View>
        </View>

        {/* Description */}
        {!!notes && (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.description} numberOfLines={2}>
              {notes}
            </Text>
          </View>
        )}

        {/* Footer: date + price */}
        <View style={styles.footerRow}>
          <Text style={styles.dateText}>{date ?? ''}</Text>
          <Text style={styles.price}>${pricePaid.toFixed(2)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    overflow: 'hidden',
    ...Shadows.sm,
  },
  cardPressed: {
    backgroundColor: Colors.surfaceHover,
  },
  accentStrip: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  foodName: {
    flex: 1,
    ...Typography.h4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  description: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  notesSection: {
    gap: 2,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  notesLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  dateText: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
  },
  price: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    color: Colors.text,
  },
});
