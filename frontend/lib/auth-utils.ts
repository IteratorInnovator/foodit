import * as SecureStore from 'expo-secure-store';
import { getCurrentUser, fetchAuthSession, signOut as amplifySignOut } from 'aws-amplify/auth';

/**
 * Decode JWT payload without verification (for extracting profile data)
 */
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Decode base64url to base64
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = atob(base64);
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.log('Error decoding JWT:', error);
    return null;
  }
}

// Secure storage keys
const STORAGE_KEYS = {
  USER_ID: 'auth_user_id',
  EMAIL: 'auth_user_email',
  NAME: 'auth_user_name',
  PICTURE: 'auth_user_picture',
  ACCESS_TOKEN: 'auth_access_token',
  LAST_AUTH_CHECK: 'auth_last_check',
};

/**
 * Check if user is authenticated
 * Returns user data if authenticated, null otherwise
 */
export async function checkAuthStatus() {
  try {
    // Let Amplify restore or refresh the local session as needed.
    const session = await fetchAuthSession();

    // No valid tokens = not authenticated
    if (!session.tokens?.accessToken) {
      console.log('No valid tokens found');
      return null;
    }

    const user = await getCurrentUser();

    if (user) {
      // Try to store session data
      try {
        await SecureStore.setItemAsync(
          STORAGE_KEYS.ACCESS_TOKEN,
          session.tokens.accessToken.toString()
        );
        await SecureStore.setItemAsync(STORAGE_KEYS.USER_ID, user.userId);
        if (user.signInDetails?.loginId) {
          await SecureStore.setItemAsync(STORAGE_KEYS.EMAIL, user.signInDetails.loginId);
        }

        // Decode ID token to get profile info (name, picture from Google)
        if (session.tokens?.idToken) {
          const idTokenPayload = decodeJwtPayload(session.tokens.idToken.toString());
          if (idTokenPayload) {
            if (idTokenPayload.name) {
              await SecureStore.setItemAsync(STORAGE_KEYS.NAME, idTokenPayload.name);
            }
            if (idTokenPayload.picture) {
              await SecureStore.setItemAsync(STORAGE_KEYS.PICTURE, idTokenPayload.picture);
            }
            if (idTokenPayload.email) {
              await SecureStore.setItemAsync(STORAGE_KEYS.EMAIL, idTokenPayload.email);
            }
          }
        }

        await SecureStore.setItemAsync(STORAGE_KEYS.LAST_AUTH_CHECK, new Date().toISOString());
      } catch (storageError) {
        console.log('SecureStore not available:', storageError);
      }

      return {
        userId: user.userId,
        email: user.signInDetails?.loginId,
        isAuthenticated: true,
      };
    }

    return null;
  } catch (error) {
    console.log('User not authenticated:', error);
    return null;
  }
}

/**
 * Get stored user data from secure storage
 */
export async function getStoredUserData() {
  try {
    const userId = await SecureStore.getItemAsync(STORAGE_KEYS.USER_ID);
    const email = await SecureStore.getItemAsync(STORAGE_KEYS.EMAIL);
    const name = await SecureStore.getItemAsync(STORAGE_KEYS.NAME);
    const picture = await SecureStore.getItemAsync(STORAGE_KEYS.PICTURE);

    if (userId) {
      return {
        userId,
        email,
        name,
        picture,
      };
    }

    return null;
  } catch (error) {
    console.error('Error getting stored user data:', error);
    return null;
  }
}

/**
 * Sign out user and clear all stored auth data
 */
export async function signOut() {
  console.log('=== SIGN OUT STARTED ===');

  // Use local sign out for reliability in Hosted UI app flows.
  try {
    console.log('Calling amplifySignOut...');
    await amplifySignOut();
    console.log('amplifySignOut completed');
  } catch (error) {
    console.log('Amplify sign out error:', error);
    throw error;
  }

  // Clear SecureStore (app-specific auth data)
  console.log('Clearing SecureStore...');
  await Promise.all([
    SecureStore.deleteItemAsync(STORAGE_KEYS.USER_ID).catch(() => {}),
    SecureStore.deleteItemAsync(STORAGE_KEYS.EMAIL).catch(() => {}),
    SecureStore.deleteItemAsync(STORAGE_KEYS.NAME).catch(() => {}),
    SecureStore.deleteItemAsync(STORAGE_KEYS.PICTURE).catch(() => {}),
    SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_TOKEN).catch(() => {}),
    SecureStore.deleteItemAsync(STORAGE_KEYS.LAST_AUTH_CHECK).catch(() => {}),
  ]);

  console.log('=== SIGN OUT COMPLETED ===');
  return { success: true };
}

/**
 * Get access token from secure storage
 */
export async function getAccessToken() {
  try {
    const storedToken = await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
    if (storedToken) {
      console.log("access token:", storedToken);
      return storedToken;
    }

    const session = await fetchAuthSession();
    const sessionToken = session.tokens?.accessToken?.toString() ?? null;
    if (sessionToken) {
      await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, sessionToken);
    }

    console.log("access token:", sessionToken);
    return sessionToken;
  } catch (error) {
    console.error('Error getting access token:', error);
    return null;
  }
}

/**
 * Clear all auth data (useful for debugging)
 */
export async function clearAuthData() {
  await Promise.all([
    SecureStore.deleteItemAsync(STORAGE_KEYS.USER_ID).catch(() => {}),
    SecureStore.deleteItemAsync(STORAGE_KEYS.EMAIL).catch(() => {}),
    SecureStore.deleteItemAsync(STORAGE_KEYS.NAME).catch(() => {}),
    SecureStore.deleteItemAsync(STORAGE_KEYS.PICTURE).catch(() => {}),
    SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_TOKEN).catch(() => {}),
    SecureStore.deleteItemAsync(STORAGE_KEYS.LAST_AUTH_CHECK).catch(() => {}),
  ]);
}
