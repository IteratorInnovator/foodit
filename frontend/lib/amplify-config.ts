import type { ResourcesConfig } from 'aws-amplify';
import { Amplify } from 'aws-amplify';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import { secureStorageAdapter } from './secure-storage-adapter';

const EXPO_PUBLIC_IP_ADDRESS = process.env.EXPO_PUBLIC_IP_ADDRESS || '127.0.0.1';

const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: 'ap-southeast-1_oMqPf53ag',
      userPoolClientId: '7325rcqvatrgsivism46je6foe',
      loginWith: {
        oauth: {
          domain: 'ap-southeast-1omqpf53ag.auth.ap-southeast-1.amazoncognito.com',
          scopes: ['openid', 'email', 'profile'],
          redirectSignIn: ['foodit://'],
          redirectSignOut: ['foodit://'],
          responseType: 'code',
        },
      },
    },
  },
} satisfies ResourcesConfig;

export function configureAmplify() {
  // Set SecureStore as the storage adapter BEFORE configuring Amplify
  cognitoUserPoolsTokenProvider.setKeyValueStorage(secureStorageAdapter);

  Amplify.configure(amplifyConfig);
}

export default amplifyConfig;
