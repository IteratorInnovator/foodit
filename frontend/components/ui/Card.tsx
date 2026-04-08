import React from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle } from 'react-native';
import {
  Colors,
  Spacing,
  BorderRadius,
  Shadows,
  Typography,
  ComponentTokens,
} from '@/constants/theme';

interface CardProps {
  children: React.ReactNode;
  variant?: 'elevated' | 'outlined' | 'flat';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onPress?: () => void;
  style?: ViewStyle;
}

export function Card({
  children,
  variant = 'elevated',
  padding = 'md',
  onPress,
  style,
}: CardProps) {
  const getVariantStyles = (): ViewStyle => {
    switch (variant) {
      case 'elevated':
        return {
          backgroundColor: Colors.surface,
          ...Shadows.sm,
        };
      case 'outlined':
        return {
          backgroundColor: Colors.surface,
          borderWidth: 1,
          borderColor: Colors.border,
        };
      case 'flat':
        return {
          backgroundColor: Colors.surfaceHover,
        };
    }
  };

  const getPaddingStyles = (): ViewStyle => {
    switch (padding) {
      case 'none':
        return { padding: 0 };
      case 'sm':
        return { padding: Spacing.md };
      case 'md':
        return { padding: ComponentTokens.card.padding };
      case 'lg':
        return { padding: Spacing.xl };
    }
  };

  const cardStyles = [
    styles.container,
    getVariantStyles(),
    getPaddingStyles(),
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          ...cardStyles,
          pressed && styles.pressed,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={cardStyles}>{children}</View>;
}

// Card Header component
interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  style?: ViewStyle;
}

export function CardHeader({ title, subtitle, action, style }: CardHeaderProps) {
  return (
    <View style={[styles.header, style]}>
      <View style={styles.headerContent}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
      </View>
      {action && <View style={styles.headerAction}>{action}</View>}
    </View>
  );
}

// Card Footer component
interface CardFooterProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function CardFooter({ children, style }: CardFooterProps) {
  return (
    <View style={[styles.footer, style]}>
      {children}
    </View>
  );
}

// KPI Card for dashboard metrics
interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
  };
  icon?: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning';
  onPress?: () => void;
  style?: ViewStyle;
}

export function KPICard({
  title,
  value,
  subtitle,
  trend,
  icon,
  variant = 'default',
  onPress,
  style,
}: KPICardProps) {
  const getAccentColor = () => {
    switch (variant) {
      case 'primary':
        return Colors.primary;
      case 'success':
        return Colors.success;
      case 'warning':
        return Colors.warning;
      default:
        return Colors.text;
    }
  };

  const getTrendColor = () => {
    if (!trend) return Colors.textMuted;
    switch (trend.direction) {
      case 'up':
        return Colors.success;
      case 'down':
        return Colors.error;
      default:
        return Colors.textMuted;
    }
  };

  const getTrendArrow = () => {
    if (!trend) return '';
    switch (trend.direction) {
      case 'up':
        return '↑';
      case 'down':
        return '↓';
      default:
        return '→';
    }
  };

  const content = (
    <>
      <View style={styles.kpiHeader}>
        <Text style={styles.kpiTitle}>{title}</Text>
        {icon && <View style={styles.kpiIcon}>{icon}</View>}
      </View>
      <Text style={[styles.kpiValue, { color: getAccentColor() }]}>
        {value}
      </Text>
      <View style={styles.kpiFooter}>
        {subtitle && <Text style={styles.kpiSubtitle}>{subtitle}</Text>}
        {trend && (
          <Text style={[styles.kpiTrend, { color: getTrendColor() }]}>
            {getTrendArrow()} {Math.abs(trend.value)}%
          </Text>
        )}
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.kpiContainer,
          pressed && styles.pressed,
          style,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.kpiContainer, style]}>{content}</View>;
}

const styles = StyleSheet.create({
  container: {
    borderRadius: ComponentTokens.card.borderRadius,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.95,
    transform: [{ scale: 0.99 }],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerContent: {
    flex: 1,
    gap: Spacing.xxs,
  },
  headerTitle: {
    ...Typography.h4,
  },
  headerSubtitle: {
    ...Typography.bodySmall,
  },
  headerAction: {
    marginLeft: Spacing.md,
  },
  footer: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },

  // KPI Card styles
  kpiContainer: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    ...Shadows.sm,
  },
  kpiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  kpiTitle: {
    ...Typography.caption,
  },
  kpiIcon: {
    opacity: 0.6,
  },
  kpiValue: {
    ...Typography.metric,
    marginBottom: Spacing.xs,
  },
  kpiFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kpiSubtitle: {
    ...Typography.bodySmall,
  },
  kpiTrend: {
    fontSize: 12,
    fontWeight: '600',
  },
});
