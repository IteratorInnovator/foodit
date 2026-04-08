import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';

export type OrderInfoCardOrderInfo = {
  id: string;
  title: string;
  pickup: string;
  dropoff: string;
  runner: {
    name: string;
    rating: number;
    deliveries: number;
  };
};

type OrderInfoCardProps = {
  orderInfo: OrderInfoCardOrderInfo;
};

export default function OrderInfoCard({ orderInfo }: OrderInfoCardProps) {
  return (
    <View style={styles.orderCard}>
      <View style={styles.orderRow}>
        <View style={styles.runnerInfo}>
          <View style={styles.runnerAvatar}>
            <Text style={styles.runnerAvatarText}>
              {orderInfo.runner.name.charAt(0)}
            </Text>
          </View>

          <View>
            <Text style={styles.runnerName}>{orderInfo.runner.name}</Text>
            <Text style={styles.runnerMeta}>
              {orderInfo.runner.rating} ★ · {orderInfo.runner.deliveries} deliveries
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.locationRow}>
        <View style={styles.locationItem}>
          <View style={[styles.locationDot, styles.pickupDot]} />
          <View style={styles.locationText}>
            <Text style={styles.locationLabel}>Pickup</Text>
            <Text style={styles.locationValue}>{orderInfo.pickup}</Text>
          </View>
        </View>

        <View style={styles.locationDivider} />

        <View style={styles.locationItem}>
          <View style={[styles.locationDot, styles.dropoffDot]} />
          <View style={styles.locationText}>
            <Text style={styles.locationLabel}>Drop-off</Text>
            <Text style={styles.locationValue}>{orderInfo.dropoff}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  orderCard: {
    margin: 16,
    marginBottom: 12,
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },

  runnerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  runnerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  runnerAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
  },

  runnerName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },

  runnerMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  locationItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  locationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  pickupDot: {
    backgroundColor: '#F97316',
  },

  dropoffDot: {
    backgroundColor: Colors.success,
  },

  locationText: {
    flex: 1,
  },

  locationLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },

  locationValue: {
    fontSize: 12,
    color: Colors.text,
    marginTop: 2,
  },

  locationDivider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.border,
  },
});
