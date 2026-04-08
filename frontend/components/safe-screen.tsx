import { StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';

type SafeScreenProps = ViewProps & {
  backgroundColor?: string;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
};

export function SafeScreen({
  children,
  style,
  backgroundColor = Colors.background,
  edges = ['top'],
  ...otherProps
}: SafeScreenProps) {
  const insets = useSafeAreaInsets();

  const paddingStyle = {
    paddingTop: edges.includes('top') ? insets.top : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
    paddingLeft: edges.includes('left') ? insets.left : 0,
    paddingRight: edges.includes('right') ? insets.right : 0,
  };

  return (
    <View style={[styles.container, { backgroundColor }, paddingStyle, style]} {...otherProps}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
