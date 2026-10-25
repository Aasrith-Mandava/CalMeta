import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { speech } from './speech';

export function useVoiceInput(value: string, onChange: (text: string) => void) {
  const [state, setState] = useState<'idle' | 'requesting' | 'listening' | 'stopping'>('idle');
  const [error, setError] = useState<string>();
  const active = useRef(false);
  const focused = useRef(false);
  const request = useRef(0);
  const prefix = useRef('');

  useFocusEffect(useCallback(() => {
    focused.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscriptions = speech ? [
      speech.addListener('start', () => {
        setState('listening');
        timer = setTimeout(() => {
          setState('stopping');
          speech?.stop();
        }, 60_000);
      }),
      speech.addListener('result', (event) => {
        const transcript = event.results[0]?.transcript;
        if (transcript) onChange(`${prefix.current}${transcript}`.slice(0, 2000));
      }),
      speech.addListener('end', () => {
        clearTimeout(timer);
        active.current = false;
        setState('idle');
      }),
      speech.addListener('error', (event) => {
        clearTimeout(timer);
        active.current = false;
        setState('idle');
        if (event.error !== 'aborted') {
          setError(event.error === 'no-speech'
            ? 'No speech heard. Try again or type below.'
            : 'Voice input stopped. Check microphone permissions or type below.');
        }
      }),
    ] : [];
    return () => {
      focused.current = false;
      request.current += 1;
      active.current = false;
      setState('idle');
      clearTimeout(timer);
      subscriptions.forEach((subscription) => subscription.remove());
      speech?.abort();
    };
  }, [onChange]));

  async function toggle() {
    if (state === 'listening') {
      setState('stopping');
      speech?.stop();
      return;
    }
    if (active.current) return;
    const requestId = ++request.current;
    setError(undefined);
    try {
      if (!speech?.isRecognitionAvailable()) {
        setError('Voice input is unavailable here. Use a speech-enabled browser or a mobile development build, or type below.');
        return;
      }
      active.current = true;
      setState('requesting');
      const permission = await speech.requestPermissionsAsync();
      if (!focused.current || requestId !== request.current) return;
      if (!permission.granted) {
        active.current = false;
        setState('idle');
        setError('Allow microphone and speech recognition access in settings, or type below.');
        return;
      }
      prefix.current = value.trim() ? `${value.trim()} ` : '';
      speech.start({ lang: 'en-US', interimResults: true, continuous: false });
    } catch {
      if (!focused.current || requestId !== request.current) return;
      active.current = false;
      setState('idle');
      setError('Could not start voice input. Try again or type below.');
    }
  }

  return { state, error, toggle, busy: state !== 'idle' };
}
