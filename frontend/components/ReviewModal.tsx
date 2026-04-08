import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  FontWeights,
} from "@/constants/theme";

type ReviewModalProps = {
  visible: boolean;
  runnerId: string;
  onSubmit: (rating: number, description: string) => Promise<void>;
  onClose: () => void;
};

export default function ReviewModal({
  visible,
  runnerId,
  onSubmit,
  onClose,
}: ReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      await onSubmit(rating, description.trim());
      setRating(0);
      setDescription("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setRating(0);
    setDescription("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Rate Your Runner</Text>
          <Text style={styles.subtitle}>
            How was your delivery experience?
          </Text>

          {/* Star Rating */}
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable
                key={star}
                onPress={() => setRating(star)}
                style={styles.starButton}
              >
                <Text
                  style={[
                    styles.starText,
                    star <= rating && styles.starTextActive,
                  ]}
                >
                  ★
                </Text>
              </Pressable>
            ))}
          </View>
          {rating > 0 && (
            <Text style={styles.ratingLabel}>
              {rating === 1
                ? "Poor"
                : rating === 2
                  ? "Fair"
                  : rating === 3
                    ? "Good"
                    : rating === 4
                      ? "Great"
                      : "Excellent"}
            </Text>
          )}

          {/* Description */}
          <TextInput
            style={styles.input}
            placeholder="Leave a comment (optional)"
            placeholderTextColor={Colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              style={styles.skipButton}
              onPress={handleClose}
              disabled={submitting}
            >
              <Text style={styles.skipButtonText}>Skip</Text>
            </Pressable>
            <Pressable
              style={[
                styles.submitButton,
                rating === 0 && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={rating === 0 || submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={Colors.textInverse} />
              ) : (
                <Text style={styles.submitButtonText}>Submit Review</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  title: {
    ...Typography.h3,
    color: Colors.text,
  },
  subtitle: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  starsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  starButton: {
    padding: Spacing.xs,
  },
  starText: {
    fontSize: 36,
    color: Colors.border,
  },
  starTextActive: {
    color: "#F59E0B",
  },
  ratingLabel: {
    ...Typography.label,
    textAlign: "center",
    color: Colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.text,
    minHeight: 80,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  skipButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  skipButtonText: {
    ...Typography.bodySmall,
    fontWeight: FontWeights.semibold,
    color: Colors.textSecondary,
  },
  submitButton: {
    flex: 2,
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitButtonText: {
    ...Typography.bodySmall,
    fontWeight: FontWeights.semibold,
    color: Colors.textInverse,
  },
});
