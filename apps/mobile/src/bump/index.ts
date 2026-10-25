import { requireOptionalNativeModule, type EventSubscription } from 'expo';
import { Platform } from 'react-native';

export type BumpState = {
  stage: 'searching' | 'paired' | 'matched' | 'ambiguous' | 'error';
  message?: string;
  verification?: string;
  code?: string;
  isHost?: boolean;
};
interface FriendBump {
  start(code: string): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'onState', listener: (state: BumpState) => void): EventSubscription;
}
const native = Platform.OS === 'ios' ? requireOptionalNativeModule<FriendBump>('FriendBump') : null;
export const bumpAvailable = Boolean(native);
export async function startBump(code: string, onState: (state: BumpState) => void): Promise<() => void> {
  if (!native) throw new Error('Phone bumping needs the iPhone development build. Use a code for now.');
  const subscription = native.addListener('onState', onState);
  try { await native.start(code); }
  catch (error) { subscription.remove(); throw error; }
  return () => { subscription.remove(); native.stop().catch(() => {}); };
}
