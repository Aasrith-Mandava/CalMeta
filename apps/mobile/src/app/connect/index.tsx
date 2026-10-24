import type { ConnectCode, ConnectResult } from '@200h/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Body, Button, Card, Field, Heading, Row, Screen, Title } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cancelNfc, nfcAvailable, readConnectCode, writeConnectTag } from '@/nfc';
import { colors, space } from '@/theme';

// Tap to connect: swap profiles with someone you just met.
// Share = get a short-lived code and write it to an NFC tag (or show it).
// Receive = scan their tag (or type the code). Either way you land on their profile.

export default function Connect() {
  const [nfc, setNfc] = useState<boolean | null>(null);
  const [share, setShare] = useState<ConnectCode>();
  const [typed, setTyped] = useState('');
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    nfcAvailable().then(setNfc);
    return cancelNfc;
  }, []);

  async function attempt(action: () => Promise<void>) {
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setStatus(undefined);
      setError(errorMessage(e));
    }
  }

  const redeem = (code: string) =>
    attempt(async () => {
      const result = await api<ConnectResult>('/connect/redeem', { body: { code } });
      router.replace(`/friend/${result.user.id}`);
    });

  const getCode = () => attempt(async () => setShare(await api<ConnectCode>('/connect/code', { method: 'POST' })));

  const writeTag = (url: string) =>
    attempt(async () => {
      setStatus('Hold the tag to the top of your phone…');
      await writeConnectTag(url);
      setStatus('Tag ready. They can tap it with their phone for the next 10 minutes.');
    });

  const scan = () =>
    attempt(async () => {
      setStatus('Hold your phone near their tag…');
      const code = await readConnectCode();
      if (!code) throw new Error("That isn't a 200 Hours tag");
      await redeem(code);
    });

  return (
    <Screen edges={['bottom']}>
      <Heading>Share your profile</Heading>
      {share ? (
        <Card>
          <Body muted>Your code</Body>
          <Title style={styles.code}>{share.code}</Title>
          <Body muted>Expires in 10 minutes</Body>
          {nfc ? <Button title="Write to NFC tag" onPress={() => writeTag(share.url)} /> : null}
        </Card>
      ) : (
        <Button title="Get my code" onPress={getCode} />
      )}

      <Heading>Connect with someone</Heading>
      {nfc ? <Button variant="secondary" title="Scan their tag" onPress={scan} /> : null}
      <Row>
        <View style={styles.fill}>
          <Field
            placeholder="Or type their code"
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>
        <Button title="Connect" onPress={() => redeem(typed)} disabled={typed.trim().length < 4} />
      </Row>

      {nfc === false ? (
        <Body muted>NFC needs a development build on a real phone (not Expo Go or a simulator). Codes work everywhere.</Body>
      ) : null}
      {status ? <Body muted>{status}</Body> : null}
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  code: { letterSpacing: space.sm },
});
