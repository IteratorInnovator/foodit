import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

type AppHeaderProps = {
  title: string;
  onPressProfile: () => void;
};

export default function AppHeader({ title, onPressProfile }: AppHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      <Pressable
        onPress={onPressProfile}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Open profile"
      >
        <Text style={styles.icon}>👤</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 56,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E5EA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
  },
  iconButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  icon: {
    fontSize: 18,
  },
  pressed: {
    opacity: 0.6,
  },
});
