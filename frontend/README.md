# Foodit Frontend

A cross-platform mobile application built with [Expo](https://expo.dev) (SDK 54), [React Native](https://reactnative.dev), and [Expo Router](https://docs.expo.dev/router/introduction/) for file-based routing.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js** (v18 or later) - [Download](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** - [Download](https://git-scm.com/)
- **EAS CLI** (for building and deploying) - installed in the steps below

For mobile development, you will also need one or more of:

- **Android Studio** (for Android emulator) - [Setup guide](https://docs.expo.dev/workflow/android-studio-emulator/)
- **Xcode** (for iOS simulator, macOS only) - [Setup guide](https://docs.expo.dev/workflow/ios-simulator/)
- **Expo Go** app on a physical device - [Download](https://expo.dev/go)

## Getting Started

### 1. Clone the repository

```bash
git clone https://gitlab.com/esd-g6-team1-tanzu/foodit-frontend.git
cd foodit-frontend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the development server

```bash
npm start
```

This runs `expo start` and opens the Expo developer tools in your terminal. From there you can:

- Press **a** to open in an Android emulator
- Press **i** to open in an iOS simulator (macOS only)
- Scan the QR code with the **Expo Go** app on your physical device

You can also start directly for a specific platform:

```bash
npm run android    # Start and open on Android emulator
npm run ios        # Start and open on iOS simulator
```

---

## Running with Android Studio

### Option A: Run via Expo CLI
```bash
# Generate/update native Android project (if needed)
npx expo prebuild --platform android

# Run on connected device or emulator
npx expo run:android
```

### Option B: Open in Android Studio

1. **Generate the native project** (if not already done):
   ```bash
   npx expo prebuild --platform android
   ```

2. **Open Android Studio**

3. Select **File > Open** and navigate to:
   ```
   frontend/android
   ```

4. **Wait for Gradle sync** to complete (this may take a few minutes on first run)

5. **Select your device/emulator** from the toolbar dropdown

6. Click the **Run** button (green play icon) or press `Shift+F10`

### Android Studio Requirements

- Android Studio Hedgehog (2023.1.1) or newer
- Android SDK 34+ (install via **Tools > SDK Manager**)
- Android Emulator or physical device with USB debugging enabled

### Troubleshooting Android

```bash
# Clean and rebuild
cd android && ./gradlew clean && cd ..
npx expo prebuild --platform android --clean

# Check connected devices
adb devices

# Clear Metro bundler cache
npx expo start --clear
```

---

## Running with Xcode (macOS only)

### Option A: Run via Expo CLI
```bash
# Generate native iOS project (required for first run)
npx expo prebuild --platform ios

# Install CocoaPods dependencies
cd ios && pod install && cd ..

# Run on simulator or connected device
npx expo run:ios
```

### Option B: Open in Xcode

1. **Generate the native project and install pods**:
   ```bash
   npx expo prebuild --platform ios
   cd ios && pod install && cd ..
   ```

2. **Open Xcode**

3. Select **File > Open** and navigate to:
   ```
   frontend/ios/fooditfrontend.xcworkspace
   ```
   > **Important:** Open the `.xcworkspace` file, NOT the `.xcodeproj`

4. **Select your target device/simulator** from the toolbar dropdown

5. Click the **Run** button (play icon) or press `Cmd+R`

### Xcode Requirements

- macOS with Xcode 15+
- iOS Simulator or physical device with Apple Developer account
- CocoaPods (`sudo gem install cocoapods`)

### Troubleshooting iOS

```bash
# Reinstall CocoaPods dependencies
cd ios && pod deintegrate && pod install && cd ..

# Clean rebuild
npx expo prebuild --platform ios --clean

# Clear Xcode derived data
rm -rf ~/Library/Developer/Xcode/DerivedData

# Clear Metro bundler cache
npx expo start --clear
```

---

### 4. Project structure

```
foodit-frontend/
├── app/                # App screens and layouts (file-based routing)
│   ├── (tabs)/         # Tab-based navigation group
│   ├── _layout.tsx     # Root layout
│   └── modal.tsx       # Modal screen
├── assets/             # Static assets (images, fonts)
├── components/         # Reusable UI components
├── constants/          # App-wide constants
├── hooks/              # Custom React hooks
├── scripts/            # Utility scripts
├── app.json            # Expo app configuration
├── eas.json            # EAS Build & Submit configuration
├── tsconfig.json       # TypeScript configuration
└── eslint.config.js    # ESLint configuration
```

## Linting

Run ESLint to check for code quality issues:

```bash
npm run lint
```

## Building for Production

This project uses [EAS Build](https://docs.expo.dev/build/introduction/) for creating production binaries.

### 1. Install EAS CLI

```bash
npm install -g eas-cli
```

### 2. Log in to your Expo account

```bash
eas login
```

### 3. Build profiles

The project has three build profiles configured in `eas.json`:

| Profile         | Description                                       | Distribution |
| --------------- | ------------------------------------------------- | ------------ |
| `development`   | Debug build with dev client for local development | Internal     |
| `preview`       | Internal testing build                            | Internal     |
| `production`    | Release build for app stores                      | Store        |

### 4. Create a build

```bash
# Development build (includes dev client)
eas build --profile development --platform android
eas build --profile development --platform ios

# Preview build (internal testing)
eas build --profile preview --platform android
eas build --profile preview --platform ios

# Production build (app store release)
eas build --profile production --platform android
eas build --profile production --platform ios
```

To build for all platforms at once, use `--platform all`:

```bash
eas build --profile production --platform all
```

## Deploying to App Stores

### Submit to stores

After a successful production build, submit it to the app stores:

```bash
# Submit to Google Play Store
eas submit --platform android

# Submit to Apple App Store
eas submit --platform ios
```

