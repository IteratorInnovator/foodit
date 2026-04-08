import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
} from 'react-native';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { Button } from './Button';

// Empty State
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
  style?: ViewStyle;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, style]}>
      {icon && <View style={styles.icon}>{icon}</View>}
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      {action && (
        <View style={styles.action}>
          <Button
            title={action.label}
            variant="secondary"
            size="md"
            onPress={action.onPress}
          />
        </View>
      )}
    </View>
  );
}

// Loading State
interface LoadingStateProps {
  message?: string;
  size?: 'small' | 'large';
  style?: ViewStyle;
}

export function LoadingState({
  message = 'Loading...',
  size = 'large',
  style,
}: LoadingStateProps) {
  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size={size} color={Colors.primary} />
      {message && <Text style={styles.loadingText}>{message}</Text>}
    </View>
  );
}

// Error State
interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  style?: ViewStyle;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  style,
}: ErrorStateProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.errorIcon}>
        <Text style={styles.errorIconText}>!</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{message}</Text>
      {onRetry && (
        <View style={styles.action}>
          <Button
            title="Try Again"
            variant="primary"
            size="md"
            onPress={onRetry}
          />
        </View>
      )}
    </View>
  );
}

// Skeleton Loading
interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = 4,
  style,
}: SkeletonProps) {
  return (
    <View
      style={[
        styles.skeleton,
        {
          width: width as any,
          height,
          borderRadius,
        },
        style,
      ]}
    />
  );
}

// Section Header
interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  style?: ViewStyle;
}

export function SectionHeader({
  title,
  subtitle,
  action,
  style,
}: SectionHeaderProps) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionHeaderContent}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      </View>
      {action && <View>{action}</View>}
    </View>
  );
}

// Divider
interface DividerProps {
  spacing?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

export function Divider({ spacing = 'md', style }: DividerProps) {
  const getSpacing = () => {
    switch (spacing) {
      case 'sm':
        return Spacing.sm;
      case 'lg':
        return Spacing.xl;
      default:
        return Spacing.lg;
    }
  };

  return (
    <View
      style={[
        styles.divider,
        { marginVertical: getSpacing() },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxxl,
    paddingHorizontal: Spacing.xl,
  },
  icon: {
    marginBottom: Spacing.lg,
    opacity: 0.5,
  },
  title: {
    ...Typography.h4,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  description: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  action: {
    marginTop: Spacing.xl,
  },
  loadingText: {
    ...Typography.bodySmall,
    marginTop: Spacing.md,
  },
  errorIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  errorIconText: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.error,
  },
  skeleton: {
    backgroundColor: Colors.borderLight,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  sectionHeaderContent: {
    flex: 1,
  },
  sectionTitle: {
    ...Typography.h4,
  },
  sectionSubtitle: {
    ...Typography.bodySmall,
    marginTop: Spacing.xxs,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
  },
});
