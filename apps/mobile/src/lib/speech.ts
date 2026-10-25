import { requireOptionalNativeModule } from 'expo';
import type { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

// Expo Go has no speech module; keep onboarding usable with typed text.
export const speech = requireOptionalNativeModule<typeof ExpoSpeechRecognitionModule>('ExpoSpeechRecognition');
