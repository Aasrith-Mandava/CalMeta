import {
  INTEREST_LABELS,
  INTERESTS,
  SLOT_LABELS,
  SLOTS,
  type ExtractInterestsResult,
  type Interest,
  type OnboardingInput,
  type PublicProfile,
  type Slot,
} from '@200h/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Body, Button, Chip, Field, Heading, IconButton, Row, Screen, Title } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, space } from '@/theme';

// Screen 1 — About you. Tap interests or say them out loud. Two questions only.

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

export default function AboutYou() {
  const { signIn } = useSession();
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [interests, setInterests] = useState<Interest[]>([]);
  const [availability, setAvailability] = useState<Slot[]>([]);
  const [busy, setBusy] = useState<'tagging' | 'saving' | null>(null);
  const [error, setError] = useState<string>();

  // TODO(voice): feed a speech-to-text transcript (e.g. expo-speech-recognition) into `about`.
  async function tagFromText() {
    setBusy('tagging');
    try {
      const tags = await api<ExtractInterestsResult>('/ai/interests', { body: { text: about } });
      setInterests((current) => [...new Set([...current, ...tags.interests])]);
      setAvailability((current) => [...new Set([...current, ...tags.availability])]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function findMyCrew() {
    setBusy('saving');
    try {
      const input: OnboardingInput = { name, interests, availability };
      const me = await api<PublicProfile>('/users', { body: input });
      await signIn(me.id);
      router.replace('/onboarding/crew');
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  async function continueAsDemoUser() {
    await signIn('u_alex');
    router.replace('/home');
  }

  return (
    <Screen
      footer={
        <>
          <Button
            title="Find my crew"
            onPress={findMyCrew}
            loading={busy === 'saving'}
            disabled={!name.trim() || interests.length === 0 || availability.length === 0}
          />
          {__DEV__ ? <Button variant="ghost" title="Dev: continue as Alex (seed data)" onPress={continueAsDemoUser} /> : null}
        </>
      }>
      <Title>About you</Title>
      <Field placeholder="First name" value={name} onChangeText={setName} autoCapitalize="words" />

      <Row style={styles.sayIt}>
        <View style={styles.fill}>
          <Field
            placeholder="Or just say it: new in SF, I climb and love board games, free weeknights"
            value={about}
            onChangeText={setAbout}
            multiline
          />
        </View>
        <IconButton
          label={busy === 'tagging' ? '…' : 'AI'}
          accessibilityLabel="Suggest tags from what I wrote"
          onPress={tagFromText}
          disabled={!about.trim() || busy !== null}
        />
      </Row>

      <Row wrap>
        {INTERESTS.map((i) => (
          <Chip key={i} label={INTEREST_LABELS[i]} selected={interests.includes(i)} onPress={() => setInterests(toggle(interests, i))} />
        ))}
      </Row>

      <Heading>Free when?</Heading>
      <Row wrap>
        {SLOTS.map((s) => (
          <Chip key={s} label={SLOT_LABELS[s]} selected={availability.includes(s)} onPress={() => setAvailability(toggle(availability, s))} />
        ))}
      </Row>

      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sayIt: { alignItems: 'flex-start', gap: space.sm },
  fill: { flex: 1 },
});
