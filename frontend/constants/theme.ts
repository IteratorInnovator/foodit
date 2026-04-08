import { Platform, TextStyle, ViewStyle } from 'react-native';

/**
 * FoodIT B2B Design System
 * Professional, data-first design tokens for enterprise operations platform
 */

// ============================================================================
// COLOR SYSTEM
// ============================================================================

const palette = {
  // Neutrals - Professional gray scale
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',

  // Primary - Professional blue (trust, reliability)
  primary50: '#EFF6FF',
  primary100: '#DBEAFE',
  primary200: '#BFDBFE',
  primary300: '#93C5FD',
  primary400: '#60A5FA',
  primary500: '#3B82F6',
  primary600: '#2563EB',
  primary700: '#1D4ED8',
  primary800: '#1E40AF',
  primary900: '#1E3A8A',

  // Success - Green
  success50: '#F0FDF4',
  success100: '#DCFCE7',
  success200: '#BBF7D0',
  success500: '#22C55E',
  success600: '#16A34A',
  success700: '#15803D',

  // Warning - Amber
  warning50: '#FFFBEB',
  warning100: '#FEF3C7',
  warning200: '#FDE68A',
  warning500: '#F59E0B',
  warning600: '#D97706',
  warning700: '#B45309',

  // Error - Red
  error50: '#FEF2F2',
  error100: '#FEE2E2',
  error200: '#FECACA',
  error500: '#EF4444',
  error600: '#DC2626',
  error700: '#B91C1C',

  // Info - Cyan
  info50: '#ECFEFF',
  info100: '#CFFAFE',
  info200: '#A5F3FC',
  info500: '#06B6D4',
  info600: '#0891B2',
  info700: '#0E7490',

  // White
  white: '#FFFFFF',
};

export const Colors = {
  // Core UI colors
  text: palette.gray900,
  textSecondary: palette.gray600,
  textMuted: palette.gray400,
  textInverse: palette.white,

  background: palette.gray50,
  backgroundAlt: palette.white,
  surface: palette.white,
  surfaceHover: palette.gray50,
  surfacePressed: palette.gray100,

  // Brand / Primary
  primary: palette.primary600,
  primaryHover: palette.primary700,
  primaryPressed: palette.primary800,
  primaryLight: palette.primary50,
  primaryMuted: palette.primary100,

  // Semantic colors
  success: palette.success600,
  successLight: palette.success50,
  successMuted: palette.success100,

  warning: palette.warning500,
  warningLight: palette.warning50,
  warningMuted: palette.warning100,

  error: palette.error600,
  errorLight: palette.error50,
  errorMuted: palette.error100,

  info: palette.info600,
  infoLight: palette.info50,
  infoMuted: palette.info100,

  // Borders
  border: palette.gray200,
  borderLight: palette.gray100,
  borderFocus: palette.primary500,
  borderError: palette.error500,

  // Interactive
  link: palette.primary600,
  linkHover: palette.primary700,

  // Icons
  icon: palette.gray500,
  iconMuted: palette.gray400,
  iconActive: palette.primary600,

  // Tab bar
  tabIconDefault: palette.gray400,
  tabIconSelected: palette.primary600,
  tint: palette.primary600,

  // Shadows
  shadowColor: 'rgba(0, 0, 0, 0.1)',
  shadowColorLight: 'rgba(0, 0, 0, 0.05)',

  // Overlays
  overlay: 'rgba(17, 24, 39, 0.5)',
  overlayLight: 'rgba(17, 24, 39, 0.3)',

  // Accents for data visualization
  accent1: palette.primary500,
  accent2: palette.success500,
  accent3: palette.warning500,
  accent4: palette.error500,
  accent5: palette.info500,

  // Legacy compatibility
  cardShadow: 'rgba(0, 0, 0, 0.08)',
};

// ============================================================================
// SPACING SYSTEM (8px base)
// ============================================================================

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  xxxxl: 64,
} as const;

// ============================================================================
// BORDER RADIUS
// ============================================================================

export const BorderRadius = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

// ============================================================================
// SHADOWS (Elevation system)
// ============================================================================

export const Shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  } as ViewStyle,

  xs: {
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 1,
  } as ViewStyle,

  sm: {
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  } as ViewStyle,

  md: {
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  } as ViewStyle,

  lg: {
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 8,
  } as ViewStyle,

  xl: {
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 12,
  } as ViewStyle,
};

// ============================================================================
// TYPOGRAPHY SYSTEM
// ============================================================================

export const FontSizes = {
  xs: 11,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 20,
  xxxl: 24,
  display: 32,
} as const;

export const FontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const LineHeights = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
} as const;

export const Typography = {
  // Display
  displayLarge: {
    fontSize: FontSizes.display,
    fontWeight: FontWeights.bold,
    lineHeight: FontSizes.display * LineHeights.tight,
    color: Colors.text,
    letterSpacing: -0.5,
  } as TextStyle,

  // Headings
  h1: {
    fontSize: FontSizes.xxxl,
    fontWeight: FontWeights.bold,
    lineHeight: FontSizes.xxxl * LineHeights.tight,
    color: Colors.text,
    letterSpacing: -0.3,
  } as TextStyle,

  h2: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.semibold,
    lineHeight: FontSizes.xxl * LineHeights.tight,
    color: Colors.text,
  } as TextStyle,

  h3: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.semibold,
    lineHeight: FontSizes.xl * LineHeights.normal,
    color: Colors.text,
  } as TextStyle,

  h4: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    lineHeight: FontSizes.lg * LineHeights.normal,
    color: Colors.text,
  } as TextStyle,

  // Body
  bodyLarge: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.regular,
    lineHeight: FontSizes.lg * LineHeights.normal,
    color: Colors.text,
  } as TextStyle,

  body: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.regular,
    lineHeight: FontSizes.md * LineHeights.normal,
    color: Colors.text,
  } as TextStyle,

  bodySmall: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.regular,
    lineHeight: FontSizes.sm * LineHeights.normal,
    color: Colors.textSecondary,
  } as TextStyle,

  // Labels
  label: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    lineHeight: FontSizes.md * LineHeights.normal,
    color: Colors.text,
  } as TextStyle,

  labelSmall: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    lineHeight: FontSizes.sm * LineHeights.normal,
    color: Colors.textSecondary,
  } as TextStyle,

  // Captions
  caption: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.medium,
    lineHeight: FontSizes.xs * LineHeights.normal,
    color: Colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  } as TextStyle,

  // Numbers / Data
  metric: {
    fontSize: FontSizes.xxxl,
    fontWeight: FontWeights.bold,
    lineHeight: FontSizes.xxxl * LineHeights.tight,
    color: Colors.text,
    letterSpacing: -0.5,
  } as TextStyle,

  metricSmall: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.semibold,
    lineHeight: FontSizes.xl * LineHeights.tight,
    color: Colors.text,
  } as TextStyle,
};

// ============================================================================
// COMPONENT TOKENS
// ============================================================================

export const ComponentTokens = {
  // Buttons
  button: {
    height: {
      sm: 32,
      md: 40,
      lg: 48,
    },
    paddingHorizontal: {
      sm: Spacing.md,
      md: Spacing.lg,
      lg: Spacing.xl,
    },
    borderRadius: BorderRadius.md,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },

  // Inputs
  input: {
    height: 44,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    fontSize: FontSizes.md,
  },

  // Cards
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },

  // Badges
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    borderRadius: BorderRadius.sm,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },

  // Tables
  table: {
    rowHeight: 52,
    headerHeight: 44,
    cellPaddingHorizontal: Spacing.lg,
    cellPaddingVertical: Spacing.md,
  },

  // Navigation
  tabBar: {
    height: 56,
    iconSize: 24,
    labelFontSize: FontSizes.xs,
  },
};

// ============================================================================
// STATUS COLORS MAP
// ============================================================================

export const StatusColors = {
  preparing: {
    bg: Colors.warningLight,
    text: palette.warning700,
    border: palette.warning200,
  },
  'in-transit': {
    bg: Colors.infoLight,
    text: palette.info700,
    border: palette.info200,
  },
  delivered: {
    bg: Colors.successLight,
    text: palette.success700,
    border: palette.success200,
  },
  cancelled: {
    bg: Colors.errorLight,
    text: palette.error700,
    border: palette.error200,
  },
  pending: {
    bg: palette.gray100,
    text: palette.gray700,
    border: palette.gray200,
  },
  active: {
    bg: Colors.primaryLight,
    text: palette.primary700,
    border: palette.primary200,
  },
};

// ============================================================================
// FONTS (Platform-specific)
// ============================================================================

export const Fonts = Platform.select({
  ios: {
    sans: 'System',
    mono: 'Menlo',
  },
  android: {
    sans: 'Roboto',
    mono: 'monospace',
  },
  default: {
    sans: 'System',
    mono: 'monospace',
  },
});

// ============================================================================
// TRANSITIONS / ANIMATIONS
// ============================================================================

export const Transitions = {
  fast: 150,
  normal: 250,
  slow: 400,
};
