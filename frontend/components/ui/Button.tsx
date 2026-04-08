import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  PressableProps,
} from 'react-native';
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSizes,
  FontWeights,
  ComponentTokens,
  Shadows,
} from '@/constants/theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
}

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  style,
  onPress,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const getVariantStyles = (): { container: ViewStyle; text: TextStyle } => {
    switch (variant) {
      case 'primary':
        return {
          container: {
            backgroundColor: isDisabled ? Colors.border : Colors.primary,
          },
          text: {
            color: Colors.textInverse,
          },
        };
      case 'secondary':
        return {
          container: {
            backgroundColor: Colors.surface,
            borderWidth: 1,
            borderColor: isDisabled ? Colors.borderLight : Colors.border,
          },
          text: {
            color: isDisabled ? Colors.textMuted : Colors.text,
          },
        };
      case 'ghost':
        return {
          container: {
            backgroundColor: 'transparent',
          },
          text: {
            color: isDisabled ? Colors.textMuted : Colors.primary,
          },
        };
      case 'danger':
        return {
          container: {
            backgroundColor: isDisabled ? Colors.border : Colors.error,
          },
          text: {
            color: Colors.textInverse,
          },
        };
    }
  };

  const getSizeStyles = (): { container: ViewStyle; text: TextStyle } => {
    const heights = ComponentTokens.button.height;
    const paddings = ComponentTokens.button.paddingHorizontal;

    switch (size) {
      case 'sm':
        return {
          container: {
            height: heights.sm,
            paddingHorizontal: paddings.sm,
          },
          text: {
            fontSize: FontSizes.sm,
          },
        };
      case 'md':
        return {
          container: {
            height: heights.md,
            paddingHorizontal: paddings.md,
          },
          text: {
            fontSize: FontSizes.md,
          },
        };
      case 'lg':
        return {
          container: {
            height: heights.lg,
            paddingHorizontal: paddings.lg,
          },
          text: {
            fontSize: FontSizes.lg,
          },
        };
    }
  };

  const variantStyles = getVariantStyles();
  const sizeStyles = getSizeStyles();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        variantStyles.container,
        sizeStyles.container,
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
      disabled={isDisabled}
      onPress={onPress}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'secondary' || variant === 'ghost' ? Colors.text : Colors.textInverse}
        />
      ) : (
        <>
          {leftIcon}
          <Text
            style={[
              styles.text,
              variantStyles.text,
              sizeStyles.text,
              leftIcon ? styles.textWithLeftIcon : undefined,
              rightIcon ? styles.textWithRightIcon : undefined,
            ]}
          >
            {title}
          </Text>
          {rightIcon}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ComponentTokens.button.borderRadius,
    ...Shadows.xs,
  },
  fullWidth: {
    width: '100%',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  text: {
    fontWeight: FontWeights.semibold,
  },
  textWithLeftIcon: {
    marginLeft: Spacing.sm,
  },
  textWithRightIcon: {
    marginRight: Spacing.sm,
  },
});
