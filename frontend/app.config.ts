import 'dotenv/config';

export default ({ config }: any) => {
  const variant = process.env.APP_VARIANT || 'default';

  const isDev2 = variant === 'dev2';

  return {
    expo: {
      name: isDev2 ? 'FoodIt2' : 'foodit-frontend',
      slug: 'foodit-frontend',
      version: '1.0.0',
      orientation: 'portrait',
      scheme: isDev2 ? 'foodit2' : 'foodit',
      userInterfaceStyle: 'automatic',
      newArchEnabled: true,

      ios: {
        bundleIdentifier: isDev2
          ? 'com.harryngkokjing.fooditfrontend.dev2'
          : 'com.harryngkokjing.fooditfrontend',
        supportsTablet: true,
        config: {
          googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        },
      },

      android: {
        adaptiveIcon: {},
        edgeToEdgeEnabled: true,
        predictiveBackGestureEnabled: false,
        package: isDev2
          ? 'com.harryngkokjing.fooditfrontend.dev2'
          : 'com.harryngkokjing.fooditfrontend',
        config: {
          googleMaps: {
            apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
          },
        },
      },

      web: {
        output: 'static',
      },

      plugins: [
        'expo-router',
        [
          'expo-splash-screen',
          {
            image: './assets/images/logo.png',
            imageWidth: 200,
            resizeMode: 'contain',
            backgroundColor: '#ffffff',
            dark: {
              backgroundColor: '#000000',
            },
          },
        ],
        'expo-secure-store',
      ],

      experiments: {
        typedRoutes: true,
        reactCompiler: true,
      },

      extra: {
        router: {},
        eas: {
          projectId: '134a3d69-9d75-484a-bd3d-359704b55f6c',
        },
      },
    },
  };
};