import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Animated,
  type StyleProp,
  type ViewStyle,
  type ImageStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ExpoLocation from 'expo-location';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  type LatLng,
} from 'react-native-maps';
import OrderTrackingCard from '@/components/chats/order-tracking-card';
import { getGoogleRoute } from '@/services/google-routes';
import { Colors } from '@/constants/theme';
import { getLocations } from '@/services/location-service';
import {
  LocationWebSocket,
  createLocationWebSocket,
  type LocationWebSocketStatus,
} from '@/services/location-websocket';
import type { LocationWSLocationMessage } from '@/types/location';
import { reportOrderMia } from '@/services/order-management-service';
import { submitReview } from '@/services/review-service';

export type ChatTrackingMapOrderInfo = {
  id: string;
  title: string;
  status: 'pending' | 'accepted' | 'completed' | 'cancelled' | 'mia';
  pickup: string;
  dropoff: string;
  pickupCoordinate: LatLng;
  dropoffCoordinate: LatLng;
  price: number;
  counterPrice?: number;
  buyer: {
    name: string;
    picture?: string | null;
  };
  runner: {
    name: string;
    picture?: string | null;
    rating: number;
    deliveries: number;
  };
};

type ChatTrackingMapViewProps = {
  orderInfo: ChatTrackingMapOrderInfo;
  orderId: string;
  userId: string;
  isBuyer?: boolean;
  runnerId?: string;
  onPressViewOrder?: () => void;
  onMiaSuccess?: () => void;
};

function getInitial(name?: string | null): string {
  return name?.trim().charAt(0).toUpperCase() || '?';
}

function AvatarMarker({
  name,
  picture,
  fallbackStyle,
  imageStyle,
}: {
  name: string;
  picture?: string | null;
  fallbackStyle: StyleProp<ViewStyle>;
  imageStyle: StyleProp<ImageStyle>;
}) {
  if (picture) {
    return (
      <View style={fallbackStyle}>
        <Image source={{ uri: picture }} style={imageStyle} />
      </View>
    );
  }

  return (
    <View style={fallbackStyle}>
      <Text style={styles.markerText}>{getInitial(name)}</Text>
    </View>
  );
}

export default function ChatTrackingMapView({
  orderInfo,
  orderId,
  userId,
  isBuyer,
  runnerId,
  onPressViewOrder,
  onMiaSuccess,
}: ChatTrackingMapViewProps) {
  const mapRef = useRef<MapView | null>(null);
  const wsRef = useRef<LocationWebSocket | null>(null);
  const locationSubscriptionRef =
    useRef<ExpoLocation.LocationSubscription | null>(null);

  const [routeCoordinates, setRouteCoordinates] = useState<LatLng[]>([]);
  const [etaText, setEtaText] = useState('Runner assigned');
  const [connectionStatus, setConnectionStatus] =
    useState<LocationWebSocketStatus>('disconnected');
  const [socketRole, setSocketRole] = useState<'buyer' | 'runner' | null>(null);
  const [isTrackingLocation, setIsTrackingLocation] = useState(false);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [pickupCoordinate, setPickupCoordinate] = useState(orderInfo.pickupCoordinate);
  const [dropoffCoordinate, setDropoffCoordinate] = useState(orderInfo.dropoffCoordinate);
  const [runnerCoordinate, setRunnerCoordinate] = useState<LatLng | null>(null);

  // Card sheet state
  const [cardSheetVisible, setCardSheetVisible] = useState(false);

  // MIA + review modal state
  const [miaLoading, setMiaLoading] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  const handleLocationUpdate = useCallback((location: LocationWSLocationMessage) => {
    if (location.role === 'runner') {
      setRunnerCoordinate({
        latitude: location.lat,
        longitude: location.lng,
      });
    }
  }, []);

  const handleConnectionChange = useCallback((status: LocationWebSocketStatus) => {
    setConnectionStatus(status);
  }, []);

  const handleReportMia = useCallback(() => {
    Alert.alert(
      'Report Runner as MIA',
      'Are you sure? Your order will be cancelled and a full refund will be issued.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report MIA',
          style: 'destructive',
          onPress: async () => {
            setMiaLoading(true);
            try {
              await reportOrderMia(orderId);
              setReviewModalVisible(true);
            } catch (err) {
              Alert.alert('Error', 'Failed to report MIA. Please try again.');
            } finally {
              setMiaLoading(false);
            }
          },
        },
      ],
    );
  }, [orderId, onMiaSuccess]);

  const handleSubmitReview = useCallback(async () => {
    if (!runnerId || reviewRating === 0) return;
    setReviewSubmitting(true);
    try {
      await submitReview(userId, runnerId, reviewText, reviewRating);
    } catch {
      // review failure is non-critical — let the user dismiss anyway
    } finally {
      setReviewSubmitting(false);
      setReviewModalVisible(false);
      setReviewRating(0);
      setReviewText('');
      onMiaSuccess?.();
    }
  }, [runnerId, reviewRating, reviewText, userId, onMiaSuccess]);

  useEffect(() => {
    if (isTrackingLocation) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      );
      animation.start();
      return () => animation.stop();
    }
  }, [isTrackingLocation, pulseAnim]);

  useEffect(() => {
    setPickupCoordinate(orderInfo.pickupCoordinate);
    setDropoffCoordinate(orderInfo.dropoffCoordinate);
  }, [orderInfo.pickupCoordinate, orderInfo.dropoffCoordinate]);

  useEffect(() => {
    let isMounted = true;

    async function initLocation() {
      let sessionReady = false;
      let latestLocationData: Awaited<ReturnType<typeof getLocations>> | null = null;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const locationData = await getLocations(orderId);
          if (!isMounted) return;

          latestLocationData = locationData;

          if (locationData.status === 'active') {
            sessionReady = true;
            break;
          }
        } catch (error) {
          if (!isMounted) return;

          console.log(
            `Location session not ready yet (attempt ${attempt + 1}/5):`,
            error,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (!isMounted) return;

      setHasActiveSession(sessionReady);

      if (latestLocationData?.runner) {
        setRunnerCoordinate({
          latitude: latestLocationData.runner.lat,
          longitude: latestLocationData.runner.lng,
        });
      }

      if (!sessionReady) {
        console.warn(
          `Location session not active for order ${orderId}; skipping websocket connect`,
        );
        return;
      }

      const ws = createLocationWebSocket(orderId, userId, {
        onLocationUpdate: handleLocationUpdate,
        onConnectionChange: handleConnectionChange,
        onConnected: (response) => {
          if (!isMounted) return;
          setSocketRole(response.role);
        },
        onError: (error) => {
          console.error('Location WebSocket error:', error);
        },
      });

      wsRef.current = ws;
      ws.connect();
    }

    if (orderId && userId) {
      void initLocation();
    }

    return () => {
      isMounted = false;
      setSocketRole(null);
      setHasActiveSession(false);
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove();
        locationSubscriptionRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current = null;
      }
    };
  }, [orderId, userId, handleLocationUpdate, handleConnectionChange]);

  useEffect(() => {
    let cancelled = false;

    async function startLocationTracking() {
      // Only runners share their location
      if (
        !orderId ||
        !userId ||
        socketRole !== 'runner' ||
        !hasActiveSession ||
        connectionStatus !== 'connected'
      ) {
        locationSubscriptionRef.current?.remove();
        locationSubscriptionRef.current = null;
        setIsTrackingLocation(false);
        return;
      }

      if (locationSubscriptionRef.current) {
        return;
      }

      try {
        const permission =
          await ExpoLocation.requestForegroundPermissionsAsync();

        if (!permission.granted || cancelled) {
          return;
        }

        const applyOwnLocation = (position: ExpoLocation.LocationObject | ExpoLocation.LocationObjectCoords) => {
          const coords = 'coords' in position ? position.coords : position;
          const nextCoordinate = {
            latitude: coords.latitude,
            longitude: coords.longitude,
          };

          setRunnerCoordinate(nextCoordinate);

          wsRef.current?.sendLocationUpdate(
            nextCoordinate.latitude,
            nextCoordinate.longitude,
          );
        };

        const isTransientLocationError = (error: unknown) => {
          const message =
            error instanceof Error ? error.message : String(error ?? '');
          const normalizedMessage = message.toLowerCase();

          return (
            normalizedMessage.includes('google play services') ||
            normalizedMessage.includes('service disconnection') ||
            normalizedMessage.includes('connection to google play services was lost')
          );
        };

        const seedOwnLocation = async () => {
          const tryCurrentPosition = async () => {
            const currentPosition = await ExpoLocation.getCurrentPositionAsync({
              accuracy: ExpoLocation.Accuracy.Balanced,
            });

            if (!cancelled) {
              applyOwnLocation(currentPosition);
            }
          };

          try {
            await tryCurrentPosition();
            return;
          } catch (error) {
            if (isTransientLocationError(error)) {
              console.warn(
                '[LocationTracking] Current location seed hit a transient Android location services error. Retrying once.',
                error,
              );
              await new Promise((resolve) => setTimeout(resolve, 1000));

              try {
                await tryCurrentPosition();
                return;
              } catch (retryError) {
                console.warn(
                  '[LocationTracking] Current location retry failed. Falling back to last known location if available.',
                  retryError,
                );
              }
            }

            try {
              const lastKnownPosition =
                await ExpoLocation.getLastKnownPositionAsync();

              if (lastKnownPosition && !cancelled) {
                applyOwnLocation(lastKnownPosition);
                return;
              }
            } catch (lastKnownError) {
              console.warn(
                '[LocationTracking] Failed to read last known location during seed.',
                lastKnownError,
              );
            }

            console.warn(
              '[LocationTracking] Unable to seed current location. Live updates may still start when the location provider recovers.',
              error,
            );
          }
        };

        await seedOwnLocation();

        locationSubscriptionRef.current =
          await ExpoLocation.watchPositionAsync(
            {
              accuracy: ExpoLocation.Accuracy.Balanced,
              timeInterval: 3000,
              distanceInterval: 5,
            },
            (position) => {
              const nextCoordinate = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              };

              setRunnerCoordinate(nextCoordinate);

              wsRef.current?.sendLocationUpdate(
                nextCoordinate.latitude,
                nextCoordinate.longitude,
              );
            },
          );

        setIsTrackingLocation(true);
      } catch (error) {
        console.error('[LocationTracking] Failed to start live location tracking:', error);
      }
    }

    void startLocationTracking();

    return () => {
      cancelled = true;
    };
  }, [connectionStatus, hasActiveSession, orderId, socketRole, userId]);

  const displayedDropoffCoordinate =
    routeCoordinates.length > 0
      ? routeCoordinates[routeCoordinates.length - 1]
      : dropoffCoordinate;

  const displayedRunnerCoordinate = runnerCoordinate;

  // Detect arrival: runner within ~40m of dropoff
  const hasArrived = useMemo(() => {
    if (!runnerCoordinate) return false;
    const dLat = runnerCoordinate.latitude - dropoffCoordinate.latitude;
    const dLng = runnerCoordinate.longitude - dropoffCoordinate.longitude;
    // ~0.00036 deg ≈ 40m
    return Math.sqrt(dLat * dLat + dLng * dLng) < 0.00036;
  }, [runnerCoordinate, dropoffCoordinate]);

  const displayedEtaText = hasArrived ? 'Arrived' : etaText;

  const runnerMarkerTitle =
    socketRole === 'runner' ? 'You' : orderInfo.runner.name;

  const initialRegion = useMemo(() => {
    const coordinates = [
      pickupCoordinate,
      dropoffCoordinate,
      runnerCoordinate,
    ].filter((coordinate): coordinate is LatLng => Boolean(coordinate));

    const latitude =
      coordinates.reduce((sum, coordinate) => sum + coordinate.latitude, 0) /
      coordinates.length;
    const longitude =
      coordinates.reduce((sum, coordinate) => sum + coordinate.longitude, 0) /
      coordinates.length;
    const latitudes = coordinates.map((coordinate) => coordinate.latitude);
    const longitudes = coordinates.map((coordinate) => coordinate.longitude);
    const latitudeSpan = Math.max(...latitudes) - Math.min(...latitudes);
    const longitudeSpan = Math.max(...longitudes) - Math.min(...longitudes);

    return {
      latitude,
      longitude,
      latitudeDelta: Math.max(latitudeSpan * 1.8, 0.008),
      longitudeDelta: Math.max(longitudeSpan * 1.8, 0.008),
    };
  }, [pickupCoordinate, dropoffCoordinate, runnerCoordinate]);

  useEffect(() => {
    let isMounted = true;

    async function fetchRoutes() {
      try {
        // Handle terminal statuses
        if (orderInfo.status === 'completed') {
          if (!isMounted) return;
          setRouteCoordinates([]);
          setEtaText('Delivered');
          return;
        }

        if (orderInfo.status === 'cancelled') {
          if (!isMounted) return;
          setRouteCoordinates([]);
          setEtaText('Cancelled');
          return;
        }

        if (orderInfo.status === 'mia') {
          if (!isMounted) return;
          setRouteCoordinates([]);
          setEtaText('Runner MIA');
          return;
        }

        if (orderInfo.status === 'pending') {
          if (!isMounted) return;
          setRouteCoordinates([]);
          setEtaText('Finding a runner');
          return;
        }

        // Status is 'accepted' - fetch routes and ETA
        const routeOrigin = runnerCoordinate ?? pickupCoordinate;

        const [displayRouteResult, etaRouteResult] = await Promise.all([
          getGoogleRoute({
            origin: pickupCoordinate,
            destination: dropoffCoordinate,
          }),
          getGoogleRoute({
            origin: routeOrigin,
            destination: dropoffCoordinate,
          }),
        ]);

        if (!isMounted) return;

        setRouteCoordinates(displayRouteResult.coordinates);
        setEtaText(etaRouteResult.etaText);

        console.log(
          '[RouteCoords] Polyline points for runner simulation:',
          JSON.stringify(
            displayRouteResult.coordinates.map((c) => ({ lat: c.latitude, lng: c.longitude })),
            null,
            2,
          ),
        );
      } catch (error) {
        console.error('Failed to fetch Google route', error);

        if (!isMounted) return;

        setRouteCoordinates([]);

        if (orderInfo.status === 'completed') {
          setEtaText('Delivered');
        } else if (orderInfo.status === 'cancelled') {
          setEtaText('Cancelled');
        } else if (orderInfo.status === 'mia') {
          setEtaText('Runner MIA');
        } else if (orderInfo.status === 'pending') {
          setEtaText('Finding a runner');
        } else {
          setEtaText('Runner assigned');
        }
      }
    }

    void fetchRoutes();

    return () => {
      isMounted = false;
    };
  }, [dropoffCoordinate, orderInfo.status, pickupCoordinate, runnerCoordinate]);

  useEffect(() => {
    if (routeCoordinates.length === 0) {
      return;
    }

    const coordinatesToFit = [
      displayedRunnerCoordinate,
      ...routeCoordinates,
      displayedDropoffCoordinate,
    ].filter((coordinate): coordinate is LatLng => Boolean(coordinate));

    const timeout = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coordinatesToFit, {
        edgePadding: {
          top: 100,
          right: 40,
          bottom: 320,
          left: 40,
        },
        animated: true,
      });
    }, 250);

    return () => clearTimeout(timeout);
  }, [routeCoordinates, displayedDropoffCoordinate, displayedRunnerCoordinate]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        <Marker coordinate={pickupCoordinate} title="Pickup" zIndex={1}>
          <View style={[styles.marker, styles.pickupMarker]}>
            <Text style={styles.markerText}>P</Text>
          </View>
        </Marker>

        <Marker coordinate={displayedDropoffCoordinate} title="Drop-off" zIndex={2}>
          <View style={[styles.marker, styles.dropoffMarker]}>
            <Text style={styles.markerText}>D</Text>
          </View>
        </Marker>

        {displayedRunnerCoordinate ? (
          <Marker coordinate={displayedRunnerCoordinate} title={runnerMarkerTitle} zIndex={3}>
            <AvatarMarker
              name={socketRole === 'runner' ? 'You' : orderInfo.runner.name}
              picture={orderInfo.runner.picture}
              fallbackStyle={
                orderInfo.runner.picture
                  ? styles.runnerAvatarMarker
                  : [styles.marker, styles.runnerMarker]
              }
              imageStyle={styles.runnerMarkerImage}
            />
          </Marker>
        ) : null}

        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={Colors.primary}
            strokeWidth={5}
          />
        )}
      </MapView>

      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topRightContainer}>
          <View style={styles.legendCard}>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, styles.pickupMarker]} />
              <Text style={styles.legendText}>Pickup</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, styles.dropoffMarker]} />
              <Text style={styles.legendText}>Drop-off</Text>
            </View>
          </View>


{connectionStatus === 'connected' && isTrackingLocation && (
            <View style={styles.statusCard}>
              <Animated.View
                style={[styles.statusIndicator, { opacity: pulseAnim }]}
              />
              <Text style={styles.statusText}>Sharing location</Text>
            </View>
          )}
        </View>

        <Pressable onPress={() => setCardSheetVisible(true)} style={styles.orderPill}>
          <View style={styles.orderPillHandle} />
          <Text style={styles.orderPillText} numberOfLines={1}>
            {displayedEtaText} · {orderInfo.title}
          </Text>
        </Pressable>
      </SafeAreaView>

      <Modal
        visible={cardSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCardSheetVisible(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setCardSheetVisible(false)} />
        <View style={styles.sheetContainer}>
          <Pressable onPress={() => setCardSheetVisible(false)} style={styles.collapseHandle}>
            <View style={styles.collapseBar} />
          </Pressable>
          <OrderTrackingCard
            orderInfo={orderInfo}
            etaText={displayedEtaText}
            onPressViewOrder={onPressViewOrder}
            showMiaButton={isBuyer}
            onReportMia={handleReportMia}
          />
        </View>
      </Modal>

      <Modal
        visible={reviewModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReviewModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Refund Issued</Text>
            <Text style={styles.modalSubtitle}>
              Your runner was reported as MIA. A full refund has been processed to your account.
            </Text>

            <View style={styles.runnerInfoCard}>
              {orderInfo.runner.picture ? (
                <Image
                  source={{ uri: orderInfo.runner.picture }}
                  style={styles.runnerModalAvatar}
                />
              ) : (
                <View style={styles.runnerModalAvatarFallback}>
                  <Text style={styles.runnerModalAvatarText}>
                    {getInitial(orderInfo.runner.name)}
                  </Text>
                </View>
              )}
              <Text style={styles.runnerInfoName} numberOfLines={1} ellipsizeMode="tail">
                {orderInfo.runner.name}
              </Text>
            </View>

            <Text style={styles.rateLabel}>Rate this runner</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable key={star} onPress={() => setReviewRating(star)}>
                  <Text style={[styles.star, reviewRating >= star && styles.starFilled]}>★</Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={styles.reviewInput}
              placeholder="Leave a comment (optional)"
              placeholderTextColor={Colors.textMuted}
              value={reviewText}
              onChangeText={setReviewText}
              multiline
              maxLength={300}
            />

            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                reviewRating === 0 && styles.submitBtnDisabled,
                pressed && styles.submitBtnPressed,
              ]}
              onPress={handleSubmitReview}
              disabled={reviewRating === 0 || reviewSubmitting}
            >
              {reviewSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {reviewRating === 0 ? 'Select a rating' : 'Submit Review'}
                </Text>
              )}
            </Pressable>

            <Pressable
              style={styles.skipBtn}
              onPress={() => { setReviewModalVisible(false); onMiaSuccess?.(); }}
            >
              <Text style={styles.skipBtnText}>Skip</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  topRightContainer: {
    position: 'absolute',
    right: 16,
    top: 16,
    gap: 10,
  },
  legendCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  statusCard: {
    backgroundColor: 'rgba(34, 197, 94, 0.96)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  statusText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '700',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginRight: 8,
  },
  legendText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  marker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  runnerAvatarMarker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.surface,
    backgroundColor: Colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  runnerMarkerImage: {
    width: '100%',
    height: '100%',
  },
  pickupMarker: {
    backgroundColor: '#F97316',
  },
  runnerMarker: {
    backgroundColor: Colors.primary,
  },
  dropoffMarker: {
    backgroundColor: Colors.success,
  },
  markerText: {
    color: Colors.textInverse,
    fontSize: 13,
    fontWeight: '800',
  },
  // MIA review modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    gap: 12,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  runnerInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    gap: 12,
    minWidth: 0,
  },
  runnerModalAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  runnerModalAvatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runnerModalAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  runnerInfoName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    flexShrink: 1,
  },
  rateLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 8,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  star: {
    fontSize: 36,
    color: '#d1d5db',
  },
  starFilled: {
    color: '#fbbf24',
  },
  reviewInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnDisabled: {
    backgroundColor: Colors.textMuted,
  },
  submitBtnPressed: {
    opacity: 0.85,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  skipBtnText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  collapseHandle: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  collapseBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
    opacity: 0.4,
  },
  orderPill: {
    marginTop: 'auto',
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 8,
    gap: 6,
  },
  orderPillHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
    opacity: 0.4,
  },
  orderPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  sheetBackdrop: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 12,
  },
});
