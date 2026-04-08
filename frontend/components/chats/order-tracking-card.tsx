import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';

export type OrderTrackingCardOrderInfo = {
  id: string;
  title: string;
  status: 'pending' | 'accepted' | 'completed' | 'cancelled' | 'mia';
  pickup: string;
  dropoff: string;
  price: number;
  counterPrice?: number;
  runner: {
    name: string;
    picture?: string | null;
    rating: number;
    deliveries: number;
  };
};

type OrderTrackingCardProps = {
  orderInfo: OrderTrackingCardOrderInfo;
  etaText?: string;
  onPressViewOrder?: () => void;
  showMiaButton?: boolean;
  onReportMia?: () => void;
};

export default function OrderTrackingCard({
  orderInfo,
  etaText,
  onPressViewOrder,
  showMiaButton,
  onReportMia,
}: OrderTrackingCardProps) {
  const displayedPrice =
    typeof orderInfo.counterPrice === 'number'
      ? orderInfo.counterPrice
      : orderInfo.price;

  return (
    <View style={styles.bottomCard}>
      <Text style={styles.title}>{orderInfo.title}</Text>
      <Text style={styles.status}>{etaText ?? 'Runner assigned'}</Text>

      <View style={styles.routeInfoBlock}>
        <Text style={styles.label}>Pickup</Text>
        <Text style={styles.value}>{orderInfo.pickup}</Text>
      </View>

      <View style={styles.routeInfoBlock}>
        <Text style={styles.label}>Drop-off</Text>
        <Text style={styles.value}>{orderInfo.dropoff}</Text>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryLabel}>Runner</Text>
          <View style={styles.runnerSummary}>
            {orderInfo.runner.picture ? (
              <Image
                source={{ uri: orderInfo.runner.picture }}
                style={styles.runnerAvatarImage}
              />
            ) : (
              <View style={styles.runnerAvatarFallback}>
                <Text style={styles.runnerAvatarFallbackText}>
                  {(orderInfo.runner.name || 'A').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.summaryValue} numberOfLines={1} ellipsizeMode="tail">
              {orderInfo.runner?.name ?? 'Assigned Runner'}
            </Text>
          </View>
        </View>

        <View style={styles.summaryPill}>
          <Text style={styles.summaryLabel}>Offer</Text>
          <Text style={styles.summaryValue}>${displayedPrice.toFixed(2)}</Text>
        </View>
      </View>

      {showMiaButton && orderInfo.status === 'accepted' && (
        <Pressable
          style={({ pressed }) => [styles.miaButton, pressed && styles.miaButtonPressed]}
          onPress={onReportMia}
          accessibilityRole="button"
          accessibilityLabel="Report runner as missing in action"
        >
          <Text style={styles.miaButtonText}>Report Runner as MIA</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomCard: {
    marginTop: 'auto',
    backgroundColor: Colors.surface,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 8,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 6,
  },
  status: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: 14,
  },
  routeInfoBlock: {
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  value: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  summaryPill: {
    flex: 1,
    backgroundColor: Colors.primaryLight,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    flexShrink: 1,
  },
  runnerSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  runnerAvatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface,
  },
  runnerAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runnerAvatarFallbackText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  miaButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    alignItems: 'center',
  },
  miaButtonPressed: {
    backgroundColor: '#fee2e2',
  },
  miaButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#dc2626',
  },
});
