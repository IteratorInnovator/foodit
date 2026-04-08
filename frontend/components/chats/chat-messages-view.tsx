import React from "react";
import {
    ActivityIndicator,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import type { UserProfile } from "@/types/user";

type MessageStatus = "sent" | "delivered" | "read";

type ChatMessage = {
    id: string;
    from: "you" | "runner";
    text: string;
    timestamp: Date;
    status?: MessageStatus;
};

type ChatMessagesViewProps = {
    messages: ChatMessage[];
    input: string;
    listRef: React.RefObject<ScrollView | null>;
    setInput: (value: string) => void;
    onSend: () => void;
    scrollToBottom: () => void;
    formatTime: (date: Date) => string;
    getStatusIcon: (status?: MessageStatus) => string;
    pressedStyle: object;
    colors: {
        textMuted: string;
    };
    hasMoreMessages?: boolean;
    isLoadingMoreMessages?: boolean;
    onLoadMore?: () => void;
    otherUser?: UserProfile | null;
};

export default function ChatMessagesView({
    messages,
    input,
    listRef,
    setInput,
    onSend,
    scrollToBottom,
    formatTime,
    getStatusIcon,
    pressedStyle,
    colors,
    hasMoreMessages = false,
    isLoadingMoreMessages = false,
    onLoadMore,
    otherUser,
}: ChatMessagesViewProps) {
    // Group messages by date
    const getDateLabel = (date: Date): string => {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) return "Today";
        if (date.toDateString() === yesterday.toDateString())
            return "Yesterday";
        return date.toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
        });
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
        >
            <ScrollView
                ref={listRef}
                style={styles.messageList}
                contentContainerStyle={styles.messageListContent}
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={scrollToBottom}
                showsVerticalScrollIndicator={false}
            >
                {/* Load More */}
                {hasMoreMessages && (
                    <View style={styles.loadMoreContainer}>
                        {isLoadingMoreMessages ? (
                            <View style={styles.loadingMore}>
                                <ActivityIndicator
                                    size="small"
                                    color={Colors.primary}
                                />
                                <Text style={styles.loadingMoreText}>
                                    Loading...
                                </Text>
                            </View>
                        ) : (
                            <Pressable
                                onPress={onLoadMore}
                                style={({ pressed }) => [
                                    styles.loadMoreButton,
                                    pressed && pressedStyle,
                                ]}
                            >
                                <IconSymbol
                                    name="arrow.up"
                                    size={14}
                                    color={Colors.primary}
                                />
                                <Text style={styles.loadMoreText}>
                                    Load older messages
                                </Text>
                            </Pressable>
                        )}
                    </View>
                )}

                {/* Date Separator */}
                {messages.length > 0 && (
                    <View style={styles.dateSeparator}>
                        <View style={styles.dateLine} />
                        <View style={styles.datePill}>
                            <Text style={styles.dateText}>
                                {getDateLabel(
                                    messages[0]?.timestamp || new Date(),
                                )}
                            </Text>
                        </View>
                        <View style={styles.dateLine} />
                    </View>
                )}

                {/* Messages */}
                {messages.map((m, index) => {
                    const isYou = m.from === "you";
                    const showAvatar =
                        !isYou &&
                        (index === 0 || messages[index - 1]?.from === "you");
                    const isLastInGroup =
                        index === messages.length - 1 ||
                        messages[index + 1]?.from !== m.from;

                    return (
                        <View
                            key={m.id}
                            style={[
                                styles.messageRow,
                                isYou
                                    ? styles.messageRowYou
                                    : styles.messageRowRunner,
                                !isLastInGroup && styles.messageRowGrouped,
                            ]}
                        >
                            {/* Other User Avatar */}
                            {!isYou && (
                                <View
                                    style={[
                                        styles.avatarContainer,
                                        !showAvatar && styles.avatarHidden,
                                    ]}
                                >
                                    {showAvatar && (
                                        otherUser?.picture ? (
                                            <Image
                                                source={{ uri: otherUser.picture }}
                                                style={styles.avatarImage}
                                                onError={(e) => {
                                                    console.error(`[ChatMessagesView] Avatar image failed to load for ${otherUser?.name}:`, e.nativeEvent.error);
                                                    console.error(`[ChatMessagesView] Image URL was: ${otherUser.picture}`);
                                                }}
                                            />
                                        ) : (
                                            <View style={styles.avatar}>
                                                <Text style={styles.avatarText}>
                                                    {otherUser?.name?.charAt(0)?.toUpperCase() || "?"}
                                                </Text>
                                            </View>
                                        )
                                    )}
                                </View>
                            )}

                            <View
                                style={[
                                    styles.messageContent,
                                    isYou && styles.messageContentYou,
                                ]}
                            >
                                <View
                                    style={[
                                        styles.bubble,
                                        isYou
                                            ? styles.bubbleYou
                                            : styles.bubbleRunner,
                                        isLastInGroup &&
                                            (isYou
                                                ? styles.bubbleYouLast
                                                : styles.bubbleRunnerLast),
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.bubbleText,
                                            isYou && styles.bubbleTextYou,
                                        ]}
                                    >
                                        {m.text}
                                    </Text>
                                </View>

                                {isLastInGroup && (
                                    <View
                                        style={[
                                            styles.messageMeta,
                                            isYou && styles.messageMetaYou,
                                        ]}
                                    >
                                        <Text style={styles.messageTime}>
                                            {formatTime(m.timestamp)}
                                        </Text>
                                        {isYou && m.status && (
                                            <Text
                                                style={[
                                                    styles.messageStatus,
                                                    m.status === "read" &&
                                                        styles.messageStatusRead,
                                                ]}
                                            >
                                                {getStatusIcon(m.status)}
                                            </Text>
                                        )}
                                    </View>
                                )}
                            </View>
                        </View>
                    );
                })}

                {/* Empty State */}
                {messages.length === 0 && (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIcon}>
                            <IconSymbol
                                name="bubble.left.and.bubble.right"
                                size={32}
                                color={Colors.textMuted}
                            />
                        </View>
                        <Text style={styles.emptyTitle}>No messages yet</Text>
                        <Text style={styles.emptySubtitle}>
                            Send a message to start the conversation
                        </Text>
                    </View>
                )}
            </ScrollView>

            {/* Input Bar */}
            <View style={styles.inputContainer}>
                <View style={styles.inputWrapper}>
                    <TextInput
                        value={input}
                        onChangeText={setInput}
                        placeholder="Message..."
                        placeholderTextColor={colors.textMuted}
                        style={styles.input}
                        returnKeyType="send"
                        onSubmitEditing={onSend}
                        multiline
                        maxLength={1000}
                    />
                    <Pressable
                        onPress={onSend}
                        disabled={!input.trim()}
                        style={({ pressed }) => [
                            styles.sendBtn,
                            !input.trim() && styles.sendBtnDisabled,
                            pressed && input.trim() && styles.sendBtnPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Send message"
                    >
                        <IconSymbol
                            name="arrow.up"
                            size={20}
                            color={input.trim() ? "#FFFFFF" : Colors.textMuted}
                        />
                    </Pressable>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    messageList: {
        flex: 1,
    },
    messageListContent: {
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.md,
        paddingBottom: Spacing.lg,
        flexGrow: 1,
    },

    // Load More
    loadMoreContainer: {
        alignItems: "center",
        marginBottom: Spacing.lg,
    },
    loadMoreButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.xs,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
        backgroundColor: Colors.primaryLight,
        borderRadius: BorderRadius.full,
    },
    loadMoreText: {
        fontSize: 13,
        fontWeight: "600",
        color: Colors.primary,
    },
    loadingMore: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.sm,
        paddingVertical: Spacing.sm,
    },
    loadingMoreText: {
        fontSize: 13,
        color: Colors.textMuted,
    },

    // Date Separator
    dateSeparator: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: Spacing.lg,
        marginTop: Spacing.sm,
    },
    dateLine: {
        flex: 1,
        height: 1,
        backgroundColor: Colors.borderLight,
    },
    datePill: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.full,
        marginHorizontal: Spacing.sm,
    },
    dateText: {
        fontSize: 12,
        fontWeight: "600",
        color: Colors.textMuted,
    },

    // Message Row
    messageRow: {
        flexDirection: "row",
        marginBottom: Spacing.xs,
        alignItems: "flex-end",
    },
    messageRowYou: {
        justifyContent: "flex-end",
    },
    messageRowRunner: {
        justifyContent: "flex-start",
    },
    messageRowGrouped: {
        marginBottom: 2,
    },

    // Avatar
    avatarContainer: {
        width: 28,
        marginRight: Spacing.xs,
    },
    avatarHidden: {
        opacity: 0,
    },
    avatar: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: Colors.primaryLight,
        alignItems: "center",
        justifyContent: "center",
    },
    avatarImage: {
        width: 28,
        height: 28,
        borderRadius: 14,
    },
    avatarText: {
        fontSize: 12,
        fontWeight: "700",
        color: Colors.primary,
    },

    // Message Content
    messageContent: {
        maxWidth: "75%",
    },
    messageContentYou: {
        alignItems: "flex-end",
    },

    // Bubble
    bubble: {
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
        borderRadius: 20,
    },
    bubbleYou: {
        backgroundColor: Colors.primary,
        borderBottomRightRadius: 20,
    },
    bubbleRunner: {
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
        borderBottomLeftRadius: 20,
    },
    bubbleYouLast: {
        borderBottomRightRadius: 4,
    },
    bubbleRunnerLast: {
        borderBottomLeftRadius: 4,
    },
    bubbleText: {
        fontSize: 15,
        lineHeight: 20,
        color: Colors.text,
    },
    bubbleTextYou: {
        color: "#FFFFFF",
    },

    // Message Meta
    messageMeta: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        marginTop: 4,
        paddingHorizontal: 4,
    },
    messageMetaYou: {
        justifyContent: "flex-end",
    },
    messageTime: {
        fontSize: 11,
        color: Colors.textMuted,
    },
    messageStatus: {
        fontSize: 11,
        color: Colors.textMuted,
    },
    messageStatusRead: {
        color: Colors.primary,
    },

    // Empty State
    emptyState: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: Spacing.xxxl,
    },
    emptyIcon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: Colors.surface,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: Spacing.md,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: Colors.text,
        marginBottom: Spacing.xs,
    },
    emptySubtitle: {
        fontSize: 14,
        color: Colors.textMuted,
        textAlign: "center",
    },

    // Input
    inputContainer: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        backgroundColor: Colors.background,
        borderTopWidth: 1,
        borderTopColor: Colors.borderLight,
    },
    inputWrapper: {
        flexDirection: "row",
        alignItems: "flex-end",
        backgroundColor: Colors.surface,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: Colors.border,
        paddingLeft: Spacing.md,
        paddingRight: 4,
        paddingVertical: 4,
        minHeight: 48,
    },
    input: {
        flex: 1,
        fontSize: 16,
        color: Colors.text,
        maxHeight: 100,
        paddingVertical: Platform.OS === "ios" ? 10 : 8,
    },
    sendBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: Colors.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    sendBtnDisabled: {
        backgroundColor: Colors.borderLight,
    },
    sendBtnPressed: {
        opacity: 0.8,
    },
});
