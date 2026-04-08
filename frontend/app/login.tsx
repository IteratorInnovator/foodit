import { View, StyleSheet, Pressable, Platform, Image, Alert, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { SafeScreen } from '@/components/safe-screen';
import { GoogleIcon } from '@/components/google-icon';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { signInWithRedirect } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { checkAuthStatus } from '@/lib/auth-utils';
import * as Linking from 'expo-linking';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const { signedOut } = useLocalSearchParams<{ signedOut?: string }>();

  useEffect(() => {
    console.log('Login page mounted, signedOut param:', signedOut);

    // Skip auto-redirect if user just signed out
    let verifyTimer: ReturnType<typeof setTimeout> | undefined;
    if (signedOut !== 'true') {
      // Defer the initial auth check so route params can settle after replace('/login?signedOut=true')
      verifyTimer = setTimeout(() => {
        console.log('Running verifyAuth...');
        verifyAuth();
      }, 250);
    } else {
      console.log('Skipping verifyAuth because user just signed out');
    }

    // Handle incoming OAuth redirect URL
    const handleUrl = async (event: { url: string }) => {
      console.log('Received URL:', event.url);
      // Amplify will automatically handle the OAuth callback via Hub
    };

    // Check if app was opened with a URL (cold start)
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('Initial URL:', url);
      }
    });

    // Listen for URLs while app is open (warm start)
    const urlSubscription = Linking.addEventListener('url', handleUrl);

    // Listen for auth events
    const hubUnsubscribe = Hub.listen('auth', ({ payload }) => {
      switch (payload.event) {
        case 'signInWithRedirect':
          console.log('Sign in with redirect successful');
          verifyAuth();
          break;
        case 'signInWithRedirect_failure':
          console.error('Sign in with redirect failed', payload.data);
          setIsLoading(false);
          Alert.alert('Sign In Failed', 'There was an error signing in with Google. Please try again.');
          break;
        case 'customOAuthState':
          console.log('Custom OAuth state:', payload.data);
          break;
      }
    });

    return () => {
      if (verifyTimer) {
        clearTimeout(verifyTimer);
      }
      urlSubscription.remove();
      hubUnsubscribe();
    };
  }, [signedOut]);

  const verifyAuth = async () => {
    try {
      console.log('Checking auth status...');
      const authData = await checkAuthStatus();
      console.log('Auth check result:', authData);

      if (authData?.isAuthenticated) {
        console.log('User is authenticated, redirecting to tabs');
        router.replace('/(tabs)');
      } else {
        console.log('User is NOT authenticated, staying on login');
      }
    } catch (error) {
      console.log('Auth check error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      // signInWithRedirect will open the browser and redirect back
      // The Hub listener will handle the callback
      await signInWithRedirect({
        provider: 'Google',
      });
    } catch (error: any) {
      console.error('Error initiating Google sign in:', error);

      // If user is already signed in, just redirect to tabs
      if (error?.name?.includes('Authenticated') ||
          error?.message?.includes('authenticated') ||
          error?.message?.includes('signed in')) {
        console.log('User already authenticated, redirecting...');
        verifyAuth();
        return;
      }

      setIsLoading(false);
      Alert.alert(
        'Sign In Error',
        'Unable to start Google sign in. Please check your configuration.',
      );
    }
  };

  return (
    <SafeScreen edges={['top', 'bottom']}>
      {/* Top section - logo */}
      <View style={styles.topSection}>
        <Image
          source={require('@/assets/images/logo.png')}
          style={styles.heroLogo}
          resizeMode="contain"
        />
      </View>

      {/* Bottom content section */}
      <View style={styles.bottomSection}>
        <View style={styles.content}>
          {/* Logo + Welcome Header */}
          <View style={styles.headerRow}>
              <Image
                source={require('@/assets/images/logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            <View style={styles.textColumn}>
              <ThemedText style={styles.welcomeText}>Welcome to FoodIT!</ThemedText>
              <ThemedText style={styles.subtitle}>Your favorite meals, delivered fast</ThemedText>
            </View>
          </View>

          {/* Google Sign In Button */}
          <View style={styles.authSection}>
            <Pressable
              style={({ pressed }) => [
                styles.googleButton,
                pressed && styles.googleButtonPressed,
                isLoading && styles.googleButtonDisabled,
              ]}
              onPress={handleGoogleSignIn}
              disabled={isLoading}
            >
              {isLoading && (
                <ActivityIndicator
                  size="small"
                  color="#3c4043"
                  style={styles.buttonLoader}
                />
              )}
              <View style={[styles.googleIconContainer, isLoading && styles.hiddenContent]}>
                <GoogleIcon size={20} />
              </View>
              <ThemedText
                style={[
                  styles.googleButtonText,
                  isLoading && styles.hiddenContent,
                ]}
              >
                Continue with Google
              </ThemedText>
            </Pressable>

            <ThemedText style={styles.privacyText}>
              By continuing, you agree to our Terms of Service{'\n'}and Privacy Policy
            </ThemedText>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <ThemedText style={styles.footerText}>© 2026 Foodit. All rights reserved.</ThemedText>
        </View>
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroLogo: {
    width: 200,
    height: 200,
  },
  bottomSection: {
    justifyContent: 'flex-end',
  },
  content: {
    alignItems: 'flex-start',
    paddingHorizontal: 32,
    paddingBottom: 20,
    gap: 32,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 64,
    height: 64,
  },
  textColumn: {
    flex: 1,
    gap: 4,
  },
  welcomeText: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.7,
    lineHeight: 20,
  },
  authSection: {
    width: '100%',
    alignItems: 'flex-start',
    gap: 16,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#fff',
    borderColor: '#e0e0e0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  googleButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  googleButtonDisabled: {
    opacity: 0.5,
  },
  buttonLoader: {
    position: 'absolute',
  },
  hiddenContent: {
    opacity: 0,
  },
  googleIconContainer: {
    marginRight: 12,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3c4043',
  },
  privacyText: {
    fontSize: 12,
    opacity: 0.6,
    textAlign: 'center',
    lineHeight: 18,
    width: '100%',
    alignSelf: 'center',
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    opacity: 0.5,
  },
});
