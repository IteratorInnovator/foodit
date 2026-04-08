import * as SecureStore from 'expo-secure-store';
import type { KeyValueStorageInterface } from 'aws-amplify/utils';

/**
 * Custom storage adapter for AWS Amplify that uses Expo SecureStore
 * instead of AsyncStorage for secure token storage.
 */
export const secureStorageAdapter: KeyValueStorageInterface = {
  async setItem(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error('SecureStore setItem error:', error);
      throw error;
    }
  },

  async getItem(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error('SecureStore getItem error:', error);
      return null;
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error('SecureStore removeItem error:', error);
    }
  },

  async clear(): Promise<void> {
    // SecureStore doesn't have a clear all method, so we need to track and clear known keys
    // Amplify uses specific key prefixes for auth tokens
    const amplifyKeys = [
      'CognitoIdentityServiceProvider',
      'amplify-signin-with-hostedUI',
    ];

    // Note: SecureStore doesn't support listing all keys
    // Amplify will handle clearing its own keys through removeItem calls during signOut
    console.log('SecureStore clear called - Amplify will handle individual key removal');
  },
};
