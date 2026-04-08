// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'plus': 'add',
  'plus.circle.fill': 'add-circle',
  'bag.fill': 'shopping-bag',
  'bag': 'shopping-bag',
  'person.fill': 'person',
  'message.fill': 'chat',
  'bubble.left.and.bubble.right.fill': 'chat',
  'map.fill': 'map',
  // Activity & Wallet icons
  'clock.fill': 'schedule',
  'clock': 'schedule',
  'creditcard.fill': 'credit-card',
  'creditcard': 'credit-card',
  'arrow.up': 'arrow-upward',
  'arrow.down': 'arrow-downward',
  'dollarsign.circle.fill': 'attach-money',
  'building.columns': 'account-balance',
  'arrow.uturn.backward': 'undo',
  'figure.walk': 'directions-walk',
  'checkmark.circle.fill': 'check-circle',
  'xmark.circle.fill': 'cancel',
  'star.fill': 'star',
  'location.fill': 'location-on',
  'cart.fill': 'shopping-cart',
  'receipt': 'receipt',
  'wallet.pass': 'account-balance-wallet',
  // Activity tab icon
  'chart.bar.fill': 'bar-chart',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
