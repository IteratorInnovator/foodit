import React from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius, Typography } from '@/constants/theme';

export type StoreCardProps = {
  name: string;
  cuisine: string;
  imageUrl: string;
  address: string;
  onPress: () => void;
};

export function StoreCard({ name, cuisine, imageUrl, address, onPress }: StoreCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.storeCard, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
    >
      <Image source={{ uri: imageUrl }} style={styles.storeImage} />

      <View style={styles.storeInfo}>
        <Text style={styles.storeName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.storeMeta} numberOfLines={1}>
          {cuisine}
        </Text>
        <Text style={styles.storeAddress} numberOfLines={1}>
          {address}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  storeCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.96,
  },
  storeImage: {
    height: 140,
    width: '100%',
  },
  storeInfo: {
    padding: Spacing.lg,
  },
  storeName: {
    ...Typography.h4,
  },
  storeMeta: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  storeAddress: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
});