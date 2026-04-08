import { SafeScreen } from "@/components/safe-screen";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { signOut, getStoredUserData } from "@/lib/auth-utils";
import { FontAwesome } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View, Image, ActivityIndicator, RefreshControl } from "react-native";
import { UserProfile } from "@/types/user";
import { Review, ReviewerProfile } from "@/types/review";
import { getReviews, getReviewerProfile } from "@/services/review-service";

export default function ProfileScreen() {
    const [isSigningOut, setIsSigningOut] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingReviews, setIsLoadingReviews] = useState(true);
    const [reviews, setReviews] = useState<Review[]>([]);
    const [reviewerProfiles, setReviewerProfiles] = useState<Record<string, ReviewerProfile>>({});
    const [profile, setProfile] = useState<UserProfile>({
        name: "",
        email: "",
        picture: null,
    });
    const [refreshing, setRefreshing] = useState(false);

    const fetchReviews = useCallback(async (userId: string) => {
        try {
            setIsLoadingReviews(true);
            const data: Review[] = (await getReviews(userId)) ?? [];
            setReviews(data);

            // Fetch reviewer profiles for each review
            const uniqueReviewerIds = [...new Set(data.map(r => r.reviewer_id))];
            const profiles: Record<string, ReviewerProfile> = {};

            await Promise.all(
                uniqueReviewerIds.map(async (reviewerId) => {
                    const profile = await getReviewerProfile(reviewerId);
                    if (profile) {
                        profiles[reviewerId] = profile;
                    }
                })
            );

            setReviewerProfiles(profiles);
        } catch (error) {
            console.error("Error fetching reviews:", error);
        } finally {
            setIsLoadingReviews(false);
        }
    }, []);

    const loadUserProfile = useCallback(async () => {
        try {
            setIsLoading(true);

            // Get stored user data from SecureStore (includes data decoded from ID token)
            const storedData = await getStoredUserData();

            if (storedData) {
                setProfile({
                    name: storedData.name || "",
                    email: storedData.email || "",
                    picture: storedData.picture || null,
                });

                if (storedData.userId) {
                    await fetchReviews(storedData.userId);
                } else {
                    setReviews([]);
                    setReviewerProfiles({});
                }
            }
        } catch (error) {
            console.error("Error loading user profile:", error);
        } finally {
            setIsLoading(false);
        }
    }, [fetchReviews]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadUserProfile().finally(() => {
            setRefreshing(false);
        });
    }, [loadUserProfile]);

    useEffect(() => {
        loadUserProfile();
    }, [loadUserProfile]);

    const avgRating = useMemo(() => {
        if (reviews.length === 0) return 0;
        const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
        return sum / reviews.length;
    }, [reviews]);

    function formatDate(iso: string) {
        // Keep it simple + stable: YYYY-MM-DD -> DD Mon YYYY
        const [y, m, d] = iso.split("-").map((x) => Number(x));
        const months = [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
        ];
        const mm = months[(m || 1) - 1] ?? "Jan";
        return `${String(d).padStart(2, "0")} ${mm} ${y}`;
    }

    function renderStars(n: number) {
        const clamped = Math.max(0, Math.min(5, n));
        const fullCount = Math.floor(clamped);
        const hasHalf = clamped > fullCount;
        const emptyCount = 5 - fullCount - (hasHalf ? 1 : 0);

        const stars = [];
        for (let i = 0; i < fullCount; i++) {
            stars.push(<FontAwesome key={`full-${i}`} name="star" size={12} color="#f59e0b" />);
        }
        if (hasHalf) {
            stars.push(<FontAwesome key="half" name="star-half-full" size={12} color="#f59e0b" />);
        }
        for (let i = 0; i < emptyCount; i++) {
            stars.push(<FontAwesome key={`empty-${i}`} name="star-o" size={12} color="#f59e0b" />);
        }
        return <View style={{ flexDirection: "row", gap: 2 }}>{stars}</View>;
    }

    function onChangePhoto() {
        Alert.alert(
            "Change photo (mock)",
            "Wire this to an image picker later.",
        );
    }

    const handleSignOut = () => {
        Alert.alert("Sign Out", "Are you sure you want to sign out?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Sign Out",
                style: "destructive",
                onPress: async () => {
                    try {
                        setIsSigningOut(true);
                        console.log("Calling signOut...");
                        await signOut();
                        console.log("signOut done, navigating to login...");
                        router.replace("/login?signedOut=true");
                    } catch (error) {
                        console.error("Error signing out:", error);
                        Alert.alert(
                            "Error",
                            "Failed to sign out. Please try again.",
                        );
                        setIsSigningOut(false);
                    }
                },
            },
        ]);
    };

    return (
        <SafeScreen>
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#18a999"
                        colors={["#18a999"]}
                    />
                }
            >
                <ThemedView style={styles.content}>
                    {/* Profile card */}
                    <ThemedView style={styles.heroSection}>
                        <View style={styles.heroHeaderBg} />
                        <View style={styles.profileCard}>
                            <View style={styles.profileCardTopRow}>
                                <Pressable
                                    onPress={onChangePhoto}
                                    style={({ pressed }) => [
                                        styles.avatar,
                                        pressed ? styles.pressed : null,
                                    ]}
                                    accessibilityRole="button"
                                    accessibilityLabel="Change profile picture"
                                >
                                    {isLoading ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : profile.picture ? (
                                        <Image
                                            source={{ uri: profile.picture }}
                                            style={styles.avatarImage}
                                            onError={(e) => {
                                                console.error(`[Profile] User avatar failed to load for ${profile.name}:`, e.nativeEvent.error);
                                                console.error(`[Profile] Image URL was: ${profile.picture}`);
                                            }}
                                        />
                                    ) : (
                                        <ThemedText style={styles.avatarIcon}>
                                            👤
                                        </ThemedText>
                                    )}
                                </Pressable>

                                <View style={styles.profileMeta}>
                                    {isLoading ? (
                                        <ActivityIndicator size="small" color="#18a999" />
                                    ) : (
                                        <>
                                            <ThemedText style={styles.profileName}>
                                                {profile.name || "Your name"}
                                            </ThemedText>
                                            <ThemedText style={styles.profileEmail}>
                                                {profile.email || "Add your email"}
                                            </ThemedText>
                                        </>
                                    )}
                                </View>
                            </View>

                            <View style={styles.profileRatingRow}>
                                {isLoadingReviews ? (
                                    <ActivityIndicator size="small" color="#18a999" />
                                ) : (
                                    <>
                                        <ThemedText style={styles.profileRatingValue}>
                                            {avgRating.toFixed(1)}
                                        </ThemedText>
                                        {renderStars(avgRating)}
                                        <View style={styles.profileRatingMetaWrap}>
                                            <ThemedText style={styles.profileRatingSub}>
                                                {reviews.length} review
                                                {reviews.length === 1 ? "" : "s"}
                                            </ThemedText>
                                        </View>
                                    </>
                                )}
                            </View>
                        </View>
                    </ThemedView>

                    {/* Sign out */}
                    <ThemedView style={styles.section}>
                        <Pressable
                            style={({ pressed }) => [
                                styles.signOutLink,
                                pressed && styles.signOutLinkPressed,
                                isSigningOut && styles.signOutLinkDisabled,
                            ]}
                            onPress={handleSignOut}
                            disabled={isSigningOut}
                        >
                            <ThemedText style={styles.signOutLinkText}>
                                {isSigningOut ? "Signing out..." : "Sign out"}
                            </ThemedText>
                        </Pressable>
                    </ThemedView>

                    {/* Reviews */}
                    <ThemedView style={styles.section}>
                        <ThemedText type="subtitle">Reviews</ThemedText>

                        {isLoadingReviews ? (
                            <ActivityIndicator size="small" color="#18a999" />
                        ) : reviews.length === 0 ? (
                            <View style={styles.emptyState}>
                                <View style={styles.emptyStateIcon}>
                                    <ThemedText style={styles.emptyStateIconText}>
                                        ☆
                                    </ThemedText>
                                </View>
                                <ThemedText style={styles.emptyStateTitle}>
                                    No reviews yet
                                </ThemedText>
                                <ThemedText style={styles.emptyStateSubtitle}>
                                    Complete deliveries to start receiving reviews from other users
                                </ThemedText>
                            </View>
                        ) : (
                            reviews.map((r) => {
                                const reviewer = reviewerProfiles[r.reviewer_id];
                                const reviewerName = reviewer?.name || "Unknown User";
                                const reviewerPicture = reviewer?.picture;

                                return (
                                    <ThemedView
                                        key={r.id}
                                        style={styles.reviewCard}
                                    >
                                        <View style={styles.reviewHeaderRow}>
                                            <View style={styles.reviewerRow}>
                                                <View style={styles.reviewerAvatar}>
                                                    {reviewerPicture ? (
                                                        <Image
                                                            source={{ uri: reviewerPicture }}
                                                            style={styles.reviewerAvatarImage}
                                                            onError={(e) => {
                                                                console.error(`[Profile] Reviewer avatar failed to load for ${reviewerName}:`, e.nativeEvent.error);
                                                                console.error(`[Profile] Image URL was: ${reviewerPicture}`);
                                                            }}
                                                        />
                                                    ) : (
                                                        <ThemedText
                                                            style={
                                                                styles.reviewerAvatarText
                                                            }
                                                        >
                                                            {reviewerName
                                                                .trim()[0]
                                                                ?.toUpperCase() ?? "U"}
                                                        </ThemedText>
                                                    )}
                                                </View>
                                                <View>
                                                    <ThemedText
                                                        style={styles.reviewerName}
                                                    >
                                                        {reviewerName}
                                                    </ThemedText>
                                                    <View style={styles.reviewMetaRow}>
                                                        {renderStars(r.rating)}
                                                        <ThemedText style={styles.reviewMeta}>
                                                            - {formatDate(r.created_at.split("T")[0])}
                                                        </ThemedText>
                                                    </View>
                                                </View>
                                            </View>
                                        </View>

                                        <ThemedText style={styles.reviewBody}>
                                            {r.description}
                                        </ThemedText>
                                    </ThemedView>
                                );
                            })
                        )}
                    </ThemedView>
                </ThemedView>
            </ScrollView>
        </SafeScreen>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
        paddingBottom: 28,
    },
    section: {
        marginBottom: 16,
        gap: 12,
    },
    text: {
        opacity: 0.8,
        lineHeight: 22,
    },

    // Empty state
    emptyState: {
        alignItems: "center",
        paddingVertical: 32,
        paddingHorizontal: 24,
        gap: 12,
    },
    emptyStateIcon: {
        width: 64,
        height: 64,
        borderRadius: 999,
        backgroundColor: "rgba(17, 17, 17, 0.05)",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 4,
    },
    emptyStateIconText: {
        fontSize: 28,
        color: "#9ca3af",
    },
    emptyStateTitle: {
        fontSize: 16,
        fontWeight: "800",
        color: "#374151",
    },
    emptyStateSubtitle: {
        fontSize: 14,
        fontWeight: "600",
        color: "#9ca3af",
        textAlign: "center",
        lineHeight: 20,
    },

    // Profile hero card
    heroSection: {
        marginBottom: 14,
        marginHorizontal: -20,
    },
    heroHeaderBg: {
        height: 108,
        backgroundColor: "#d8e6e9",
    },
    profileCard: {
        marginHorizontal: 20,
        marginTop: -70,
        borderRadius: 22,
        padding: 18,
        backgroundColor: "#f9f9f9",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(17, 17, 17, 0.08)",
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 3,
    },
    profileCardTopRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    avatar: {
        width: 52,
        height: 52,
        borderRadius: 999,
        backgroundColor: "#18a999",
        alignItems: "center",
        justifyContent: "center",
    },
    avatarIcon: {
        color: "#fff",
        fontSize: 26,
    },
    avatarImage: {
        width: 52,
        height: 52,
        borderRadius: 999,
    },
    profileMeta: {
        flex: 1,
        gap: 4,
    },
    profileName: {
        fontSize: 18,
        fontWeight: "900",
        color: "#111",
    },
    profileEmail: {
        fontSize: 14,
        color: "#374151",
        fontWeight: "700",
    },
    profileJoined: {
        fontSize: 12,
        color: "#6b7280",
        fontWeight: "600",
    },
    profileRatingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: "rgba(17, 17, 17, 0.12)",
    },
    profileRatingValue: {
        fontSize: 18,
        fontWeight: "900",
        color: "#111",
    },
    profileRatingStars: {
        fontSize: 13,
        fontWeight: "900",
        color: "#f59e0b",
        letterSpacing: 0.4,
    },
    profileRatingMetaWrap: {
        marginLeft: "auto",
    },
    profileRatingSub: {
        fontSize: 13,
        color: "#6b7280",
        fontWeight: "700",
    },

    // Reviews
    reviewCard: {
        borderRadius: 16,
        padding: 14,
        backgroundColor: "rgba(128, 128, 128, 0.06)",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(17, 17, 17, 0.10)",
        marginBottom: 12,
        gap: 10,
    },
    reviewHeaderRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
    },
    reviewerRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    reviewerAvatar: {
        width: 34,
        height: 34,
        borderRadius: 999,
        backgroundColor: "rgba(17, 17, 17, 0.08)",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(17, 17, 17, 0.18)",
    },
    reviewerAvatarText: {
        fontSize: 13,
        fontWeight: "900",
    },
    reviewerAvatarImage: {
        width: 34,
        height: 34,
        borderRadius: 999,
    },
    reviewerName: {
        fontSize: 14,
        fontWeight: "900",
    },
    reviewMeta: {
        fontSize: 12,
        opacity: 0.75,
        fontWeight: "700",
    },
    reviewMetaRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    reviewBody: {
        fontSize: 13,
        fontWeight: "700",
        lineHeight: 18,
        opacity: 0.9,
    },

    // Sign out
    signOutLink: {
        alignSelf: "flex-end",
        paddingVertical: 6,
        paddingHorizontal: 2,
    },
    signOutLinkPressed: {
        opacity: 0.65,
    },
    signOutLinkDisabled: {
        opacity: 0.45,
    },
    signOutLinkText: {
        fontSize: 14,
        fontWeight: "700",
        color: "#6b7280",
        textDecorationLine: "underline",
    },

    pressed: {
        opacity: 0.7,
    },
});
