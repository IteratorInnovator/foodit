import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Colors,
  BorderRadius,
  Spacing,
  Typography,
  FontWeights,
  FontSizes,
  Shadows,
} from '@/constants/theme';
import { Button } from '@/components/ui';
import { getOptionalText } from '@/utils/text';

type DeliveryCardProps = {
  summary: string;
  description?: string;
  itemsSummary?: string;
  deliveryFeeLabel?: string;
  pickup: string;
  dropoff: string;
  feeEarned: number;
  distance?: number;
  date?: string;
  isNewJob?: boolean;
  onAccept?: () => void;
  onComplete?: () => void;
};

function splitLocation(value: string) {
  const [primary, ...rest] = value.split(' • ');
  return {
    primary: primary?.trim() || value,
    secondary: rest.join(' • ').trim(),
  };
}

export default function DeliveryCard({
  summary,
  description,
  itemsSummary,
  pickup,
  dropoff,
  feeEarned,
  distance,
  date,
  onAccept,
  onComplete,
}: DeliveryCardProps) {
  const pickupParts = splitLocation(pickup);
  const dropoffParts = splitLocation(dropoff);
  const notes = getOptionalText(description);

  return (
    <View style={styles.card}>
      <View style={styles.accentStrip} />

      <View style={styles.content}>
        {/* Header: title + fee */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title} numberOfLines={1}>{summary}</Text>
            <View style={styles.headerMeta}>
              {!!date && <Text style={styles.dateText}>{date}</Text>}
              {!!distance && (
                <>
                  {!!date && <Text style={styles.metaSeparator}>·</Text>}
                  <Text style={styles.dateText}>{distance.toFixed(1)} km</Text>
                </>
              )}
            </View>
          </View>
          <View style={styles.feeBadge}>
            <Text style={styles.feeLabel}>EARNED</Text>
            <Text style={styles.feeText}>${feeEarned.toFixed(2)}</Text>
          </View>
        </View>

        {!!itemsSummary && (
          <View style={styles.chipsRow}>
            <View style={styles.chip}>
              <Text style={styles.chipText} numberOfLines={1}>{itemsSummary}</Text>
            </View>
          </View>
        )}

        {!!notes && (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.descriptionText} numberOfLines={2}>
              {notes}
            </Text>
          </View>
        )}

        {/* Route */}
        <View style={styles.route}>
          <View style={styles.timeline}>
            <View style={styles.dotFilled} />
            <View style={styles.routeLine} />
            <View style={styles.dotOutline} />
          </View>
          <View style={styles.routeDetails}>
            <View style={styles.locationRow}>
              <Text style={styles.locationLabel}>PICKUP</Text>
              <Text style={styles.locationValue} numberOfLines={1}>{pickupParts.primary}</Text>
              {!!pickupParts.secondary && (
                <Text style={styles.locationSub} numberOfLines={1}>{pickupParts.secondary}</Text>
              )}
            </View>
            <View style={styles.locationRow}>
              <Text style={styles.locationLabel}>DROP-OFF</Text>
              <Text style={styles.locationValue} numberOfLines={1}>{dropoffParts.primary}</Text>
              {!!dropoffParts.secondary && (
                <Text style={styles.locationSub} numberOfLines={1}>{dropoffParts.secondary}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Actions */}
        {(onAccept || onComplete) && (
          <View style={styles.actions}>
            {onAccept && (
              <Button title="Accept Delivery" variant="primary" size="md" fullWidth onPress={onAccept} />
            )}
            {onComplete && (
              <Button title="Mark Complete" variant="secondary" size="md" fullWidth onPress={onComplete} />
            )}
          </View>
        )}
      </View>
    </View>
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
  accentStrip: {
    width: 4,
    backgroundColor: Colors.success,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  headerLeft: {
    flex: 1,
    gap: Spacing.xxs,
  },
  title: {
    ...Typography.h4,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  dateText: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
  },
  metaSeparator: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
  },
  feeBadge: {
    backgroundColor: Colors.successLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    alignItems: 'flex-end',
    gap: 2,
  },
  feeLabel: {
    ...Typography.caption,
    color: Colors.success,
  },
  feeText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    color: Colors.success,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  chip: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs + 1,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    maxWidth: '100%',
  },
  chipText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
  descriptionText: {
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
  route: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  timeline: {
    width: 12,
    alignItems: 'center',
    paddingVertical: 3,
  },
  dotFilled: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  routeLine: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
  dotOutline: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Colors.success,
    backgroundColor: Colors.surface,
  },
  routeDetails: {
    flex: 1,
    gap: Spacing.md,
  },
  locationRow: {
    gap: 2,
  },
  locationLabel: {
    ...Typography.caption,
  },
  locationValue: {
    ...Typography.label,
    color: Colors.text,
  },
  locationSub: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  actions: {
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
});
