// components/menu-item-card.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Button, Card } from '@/components/ui';
import { Colors, Spacing, Typography, FontWeights } from '@/constants/theme';

export type MenuItem = {
  id: string;
  name: string;
  price: number;
};

export type MenuItemCardProps = {
  item: MenuItem;
  onAdd: (item: MenuItem) => void;
  disabled?: boolean;
};

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export function MenuItemCard({ item, onAdd, disabled = false }: MenuItemCardProps) {
  return (
    <Card padding="lg" variant="outlined">
      <View style={styles.row}>
        <View style={styles.left}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.price}>{money(item.price)}</Text>
        </View>

        <Button title="Add" size="md" onPress={() => onAdd(item)} disabled={disabled} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  left: {
    flex: 1,
  },
  name: {
    ...Typography.body,
    fontWeight: FontWeights.semibold,
  },
  price: {
    marginTop: Spacing.xs,
    color: Colors.textMuted,
  },
});


