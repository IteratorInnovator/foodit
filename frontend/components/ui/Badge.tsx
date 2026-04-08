import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSizes,
  FontWeights,
  StatusColors,
  ComponentTokens,
} from '@/constants/theme';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
type BadgeSize = 'sm' | 'md';

// Status-based types for order/delivery statuses
type StatusType = keyof typeof StatusColors;

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  style?: ViewStyle;
}

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  size?: BadgeSize;
  style?: ViewStyle;
}

export function Badge({
  label,
  variant = 'default',
  size = 'md',
  dot = false,
  style,
}: BadgeProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return {
          bg: Colors.primaryLight,
          text: Colors.primary,
          dot: Colors.primary,
        };
      case 'success':
        return {
          bg: Colors.successLight,
          text: Colors.success,
          dot: Colors.success,
        };
      case 'warning':
        return {
          bg: Colors.warningLight,
          text: Colors.warning,
          dot: Colors.warning,
        };
      case 'error':
        return {
          bg: Colors.errorLight,
          text: Colors.error,
          dot: Colors.error,
        };
      case 'info':
        return {
          bg: Colors.infoLight,
          text: Colors.info,
          dot: Colors.info,
        };
      default:
        return {
          bg: Colors.borderLight,
          text: Colors.textSecondary,
          dot: Colors.textMuted,
        };
    }
  };

  const variantStyles = getVariantStyles();
  const isSmall = size === 'sm';

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: variantStyles.bg },
        isSmall && styles.containerSmall,
        style,
      ]}
    >
      {dot && (
        <View
          style={[
            styles.dot,
            { backgroundColor: variantStyles.dot },
            isSmall && styles.dotSmall,
          ]}
        />
      )}
      <Text
        style={[
          styles.text,
          { color: variantStyles.text },
          isSmall && styles.textSmall,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function StatusBadge({ status, label, size = 'md', style }: StatusBadgeProps) {
  const statusStyle = StatusColors[status] || StatusColors.pending;
  const isSmall = size === 'sm';

  const displayLabel = label || formatStatusLabel(status);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: statusStyle.bg },
        isSmall && styles.containerSmall,
        style,
      ]}
    >
      <View
        style={[
          styles.dot,
          { backgroundColor: statusStyle.text },
          isSmall && styles.dotSmall,
        ]}
      />
      <Text
        style={[
          styles.text,
          { color: statusStyle.text },
          isSmall && styles.textSmall,
        ]}
      >
        {displayLabel}
      </Text>
    </View>
  );
}

function formatStatusLabel(status: string): string {
  return status
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Count badge for notifications, tabs, etc.
interface CountBadgeProps {
  count: number;
  variant?: 'primary' | 'error' | 'default';
  max?: number;
  style?: ViewStyle;
}

export function CountBadge({
  count,
  variant = 'primary',
  max = 99,
  style,
}: CountBadgeProps) {
  if (count <= 0) return null;

  const displayCount = count > max ? `${max}+` : count.toString();

  const getBgColor = () => {
    switch (variant) {
      case 'primary':
        return Colors.primary;
      case 'error':
        return Colors.error;
      default:
        return Colors.textSecondary;
    }
  };

  return (
    <View style={[styles.countContainer, { backgroundColor: getBgColor() }, style]}>
      <Text style={styles.countText}>{displayCount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ComponentTokens.badge.paddingHorizontal,
    paddingVertical: ComponentTokens.badge.paddingVertical + 2,
    borderRadius: BorderRadius.sm,
    alignSelf: 'flex-start',
    gap: Spacing.xs,
  },
  containerSmall: {
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: Spacing.xxs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotSmall: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  text: {
    fontSize: ComponentTokens.badge.fontSize,
    fontWeight: FontWeights.semibold,
  },
  textSmall: {
    fontSize: FontSizes.xs - 1,
  },
  countContainer: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
  countText: {
    fontSize: FontSizes.xs - 1,
    fontWeight: FontWeights.bold,
    color: Colors.textInverse,
  },
});
