import { useState, useCallback, useEffect } from "react";
import {
    ActivityIndicator,
    StyleSheet,
    ScrollView,
    Pressable,
    View,
    Text,
    RefreshControl,
    Image,
} from "react-native";
import { SafeScreen } from "@/components/safe-screen";
import { LoadingState } from "@/components/ui";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { router } from "expo-router";
import {
    Colors,
    Spacing,
    BorderRadius,
    Typography,
    FontWeights,
} from "@/constants/theme";
import {
    useChatContext,
    type ChatRowMetadata,
} from "@/contexts/ChatContext";
import { getStoredUserData } from "@/lib/auth-utils";
import type { ChatRoomByUser } from "@/types/chat";

export default function ChatsScreen() {
    const [refreshing, setRefreshing] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);

    const {
        activeChatRooms,
        closedChatRooms,
        roomMetadataById,
        isLoadingRooms,
        isLoadingMoreRooms,
        hasMoreRooms,
        roomsError,
        refreshChatRooms,
        loadMoreChatRooms,
    } = useChatContext();
    const chatRooms = [...activeChatRooms, ...closedChatRooms];

    useEffect(() => {
        async function loadUserId() {
            const userData = await getStoredUserData();
            if (userData?.userId) {
                setUserId(userData.userId);
            }
        }
        loadUserId();
    }, []);

    useEffect(() => {
        if (userId) {
            refreshChatRooms(userId);
        }
    }, [userId, refreshChatRooms]);

    const onRefresh = useCallback(async () => {
        if (!userId) return;
        setRefreshing(true);
        try {
            await refreshChatRooms(userId);
        } finally {
            setRefreshing(false);
        }
    }, [userId, refreshChatRooms]);

    function openChat(chatRoomId: string) {
        router.push(`/chat/${chatRoomId}`);
    }

    const hasChats = chatRooms.length > 0;

    if (isLoadingRooms && !hasChats && !refreshing) {
        return (
            <SafeScreen>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <Text style={styles.pageTitle}>Messages</Text>
                    </View>
                    <LoadingState message="Loading conversations..." />
                </View>
            </SafeScreen>
        );
    }

    return (
        <SafeScreen>
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={Colors.primary}
                        colors={[Colors.primary]}
                    />
                }
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.pageTitle}>Messages</Text>
                </View>

                {/* Error State */}
                {roomsError && (
                    <Pressable
                        onPress={onRefresh}
                        style={styles.errorContainer}
                    >
                        <IconSymbol
                            name="exclamationmark.triangle"
                            size={20}
                            color={Colors.error}
                        />
                        <Text style={styles.errorText}>{roomsError}</Text>
                        <Text style={styles.retryText}>Tap to retry</Text>
                    </Pressable>
                )}

                {!hasChats && !roomsError ? (
                    <View style={styles.emptyContainer}>
                        <View style={styles.emptyIcon}>
                            <IconSymbol
                                name="bubble.left.and.bubble.right"
                                size={40}
                                color={Colors.textMuted}
                            />
                        </View>
                        <Text style={styles.emptyTitle}>No messages yet</Text>
                        <Text style={styles.emptySubtitle}>
                            Your order conversations will appear here
                        </Text>
                    </View>
                ) : (
                    <View style={styles.content}>
                        <View style={styles.chatList}>
                            {chatRooms.map((room, index) => (
                                <ChatRow
                                    key={room.chat_room_id}
                                    room={room}
                                    metadata={roomMetadataById[room.chat_room_id]}
                                    onPress={() => openChat(room.chat_room_id)}
                                    isLast={index === chatRooms.length - 1}
                                />
                            ))}
                        </View>

                        {/* Load More */}
                        {hasMoreRooms && (
                            <View style={styles.loadMoreContainer}>
                                {isLoadingMoreRooms ? (
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
                                        onPress={loadMoreChatRooms}
                                        style={({ pressed }) => [
                                            styles.loadMoreButton,
                                            pressed && styles.loadMorePressed,
                                        ]}
                                    >
                                        <Text style={styles.loadMoreButtonText}>
                                            Load more
                                        </Text>
                                        <IconSymbol
                                            name="chevron.down"
                                            size={16}
                                            color={Colors.primary}
                                        />
                                    </Pressable>
                                )}
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>
        </SafeScreen>
    );
}

function ChatRow({
    room,
    metadata,
    onPress,
    isLast,
}: {
    room: ChatRoomByUser;
    metadata?: ChatRowMetadata;
    onPress: () => void;
    isLast: boolean;
}) {
    const formatTimestamp = (dateStr: string): string => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return "Now";
        if (diffMins < 60) return `${diffMins}m`;
        if (diffHours < 24) return `${diffHours}h`;
        if (diffDays === 1) return "Yesterday";
        if (diffDays < 7) return `${diffDays}d`;

        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
        });
    };

    const isActive = room.status === "open";
    const isMetadataLoading = !metadata;
    const display = metadata;

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                styles.chatRow,
                pressed && styles.chatRowPressed,
                !isLast && styles.chatRowBorder,
            ]}
        >
            {/* Avatar */}
            <View style={[styles.avatar, isActive && styles.avatarActive]}>
                {isMetadataLoading ? (
                    <View style={styles.avatarSkeleton} />
                ) : display?.picture ? (
                    <Image
                        source={{ uri: display.picture }}
                        style={styles.avatarImage}
                    />
                ) : (
                    <Text
                        style={[
                            styles.avatarInitial,
                            isActive && styles.avatarInitialActive,
                        ]}
                    >
                        {display?.initial}
                    </Text>
                )}
            </View>

            {/* Content */}
            <View style={styles.chatContent}>
                <View style={styles.chatHeader}>
                    {isMetadataLoading ? (
                        <>
                            <View
                                style={[
                                    styles.textSkeleton,
                                    styles.titleSkeleton,
                                ]}
                            />
                            <View
                                style={[
                                    styles.textSkeleton,
                                    styles.timeSkeleton,
                                ]}
                            />
                        </>
                    ) : (
                        <>
                            <Text
                                style={[
                                    styles.chatTitle,
                                    !isActive && styles.chatTitleInactive,
                                ]}
                                numberOfLines={1}
                            >
                                {display?.title}
                            </Text>
                            <Text
                                style={[
                                    styles.chatTime,
                                    isActive && styles.chatTimeActive,
                                ]}
                            >
                                {formatTimestamp(room.created_at)}
                            </Text>
                        </>
                    )}
                </View>
                {isMetadataLoading ? (
                    <>
                        <View
                            style={[
                                styles.textSkeleton,
                                styles.metaSkeleton,
                            ]}
                        />
                        <View
                            style={[
                                styles.textSkeleton,
                                styles.previewSkeleton,
                            ]}
                        />
                    </>
                ) : (
                    <>
                        <Text style={styles.chatMeta} numberOfLines={1}>
                            {display?.meta}
                        </Text>
                        <Text style={styles.chatPreview} numberOfLines={1}>
                            {display?.preview}
                        </Text>
                    </>
                )}
            </View>

            {/* Arrow */}
            <IconSymbol
                name="chevron.right"
                size={16}
                color={Colors.textMuted}
            />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    scrollContent: {
        paddingBottom: Spacing.xxxl,
    },

    // Header
    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: Spacing.xl,
        paddingTop: Spacing.xl,
        paddingBottom: Spacing.lg,
        gap: Spacing.sm,
    },
    pageTitle: {
        fontSize: 28,
        fontWeight: "700",
        color: Colors.text,
    },
    headerBadge: {
        backgroundColor: Colors.primary,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
        borderRadius: BorderRadius.full,
        minWidth: 24,
        alignItems: "center",
    },
    headerBadgeText: {
        fontSize: 13,
        fontWeight: "700",
        color: "#FFFFFF",
    },

    // Error
    errorContainer: {
        marginHorizontal: Spacing.xl,
        padding: Spacing.lg,
        backgroundColor: Colors.error + "10",
        borderRadius: BorderRadius.lg,
        alignItems: "center",
        gap: Spacing.xs,
    },
    errorText: {
        ...Typography.body,
        color: Colors.error,
        textAlign: "center",
    },
    retryText: {
        ...Typography.bodySmall,
        color: Colors.primary,
        fontWeight: FontWeights.semibold,
    },

    // Empty
    emptyContainer: {
        alignItems: "center",
        paddingTop: Spacing.xxxl * 2,
        paddingHorizontal: Spacing.xl,
    },
    emptyIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: Colors.surface,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: Spacing.lg,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: "600",
        color: Colors.text,
        marginBottom: Spacing.xs,
    },
    emptySubtitle: {
        fontSize: 15,
        color: Colors.textMuted,
        textAlign: "center",
    },

    // Content
    content: {
        paddingHorizontal: Spacing.lg,
        gap: Spacing.xl,
    },
    chatList: {
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.xl,
        overflow: "hidden",
    },

    // Chat Row
    chatRow: {
        flexDirection: "row",
        alignItems: "center",
        padding: Spacing.md,
        gap: Spacing.md,
    },
    chatRowPressed: {
        backgroundColor: Colors.surfaceHover,
    },
    chatRowBorder: {
        borderBottomWidth: 1,
        borderBottomColor: Colors.borderLight,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: Colors.borderLight,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },
    avatarActive: {
        backgroundColor: Colors.primaryLight,
    },
    avatarImage: {
        width: "100%",
        height: "100%",
    },
    avatarSkeleton: {
        width: "100%",
        height: "100%",
        borderRadius: 24,
        backgroundColor: Colors.borderLight,
    },
    avatarInitial: {
        fontSize: 18,
        fontWeight: FontWeights.bold,
        color: Colors.textSecondary,
    },
    avatarInitialActive: {
        color: Colors.primary,
    },
    chatContent: {
        flex: 1,
        gap: 4,
    },
    chatHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: Spacing.sm,
    },
    chatTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: Colors.text,
        flex: 1,
    },
    chatTitleInactive: {
        color: Colors.textSecondary,
    },
    chatMeta: {
        fontSize: 13,
        color: Colors.textSecondary,
        fontWeight: FontWeights.medium,
    },
    chatTime: {
        fontSize: 13,
        color: Colors.textMuted,
    },
    chatTimeActive: {
        color: Colors.primary,
        fontWeight: "600",
    },
    chatPreview: {
        fontSize: 14,
        color: Colors.textMuted,
    },
    textSkeleton: {
        backgroundColor: Colors.borderLight,
        borderRadius: BorderRadius.sm,
        height: 12,
    },
    titleSkeleton: {
        flex: 1,
        maxWidth: "60%",
        height: 16,
    },
    timeSkeleton: {
        width: 40,
        height: 12,
    },
    metaSkeleton: {
        width: "45%",
    },
    previewSkeleton: {
        width: "70%",
    },

    // Load More
    loadMoreContainer: {
        alignItems: "center",
        paddingVertical: Spacing.md,
    },
    loadMoreButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.xs,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.lg,
    },
    loadMorePressed: {
        opacity: 0.7,
    },
    loadMoreButtonText: {
        fontSize: 15,
        color: Colors.primary,
        fontWeight: FontWeights.semibold,
    },
    loadingMore: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.sm,
        paddingVertical: Spacing.md,
    },
    loadingMoreText: {
        fontSize: 15,
        color: Colors.textMuted,
    },
});
