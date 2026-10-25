import type { ConnectCode, ConnectLobby, TapMoment } from '@200h/shared';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { bumpAvailable, startBump, type BumpState } from '@/bump';
import { Orbit, Reveal } from '@/components/connect/orbit';
import { Body, Button, Card, Field, Heading, Row, Screen, Title } from '@/components/ui';
import { api, errorMessage, useApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cancelNfc, nfcAvailable, readConnectCode, writeConnectTag } from '@/nfc';
import { colors, space } from '@/theme';

export default function ConnectRoute() {
  const { userId } = useSession();
  if (!userId) return <Redirect href="/onboarding" />;
  return <Connect />;
}

function Connect() {
  const [nfc, setNfc] = useState(false);
  const [share, setShare] = useState<ConnectCode>();
  const [typed, setTyped] = useState('');
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const stopBump = useRef<(() => void) | undefined>(undefined);
  const bumpGeneration = useRef(0);
  const [bump, setBump] = useState<BumpState>();
  const current = useApi<TapMoment | null>('/connect/current');

  const stop = useCallback(() => {
    bumpGeneration.current++;
    stopBump.current?.(); stopBump.current = undefined;
    cancelNfc();
  }, []);
  useFocusEffect(useCallback(() => () => stop(), [stop]));
  useEffect(() => { let alive = true; nfcAvailable().then((supported) => { if (alive) setNfc(supported); }); return () => { alive = false; }; }, []);

  async function attempt(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(undefined); setStatus(undefined);
    try { await action(); }
    catch (e) { setError(errorMessage(e)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function freshCode(): Promise<ConnectCode> {
    const invitation = await api<ConnectCode>('/connect/code', { method: 'POST' });
    setShare(invitation);
    return invitation;
  }
  const prepareBump = () => attempt(async () => {
    stop(); setBump(undefined);
    const generation = bumpGeneration.current;
    const invitation = await freshCode();
    if (generation !== bumpGeneration.current) return;
    const cleanup = await startBump(invitation.code, (event) => {
      if (generation !== bumpGeneration.current) return;
      setBump(event);
      if (event.stage === 'matched' && event.code && !event.isHost) {
        router.push(`/connect/${event.code}`);
      }
    });
    if (generation !== bumpGeneration.current) cleanup();
    else stopBump.current = cleanup;
  });
  const scan = () => attempt(async () => {
    stop(); setBump(undefined); setStatus('Hold your phone near the invitation tag…');
    const code = await readConnectCode();
    if (!code) throw new Error('This tag does not contain a 200 Hours invitation.');
    setStatus(undefined); router.push(`/connect/${code}`);
  });
  const shareCode = () => attempt(async () => { stop(); setBump(undefined); await freshCode(); });
  const writeTag = (url: string) => attempt(async () => {
    stop(); setBump(undefined); setStatus('Hold the NFC card or sticker near the top of your phone…');
    await writeConnectTag(url);
    setStatus('Invitation written. Ask the other person to open Scan a tag.');
  });
  const searching = bump?.stage === 'searching' || bump?.stage === 'paired';
  return (
    <Screen edges={['bottom']}>
      <Orbit joined={bump?.stage === 'matched'} />
      <Reveal><Title>One hello. A first chapter.</Title></Reveal>
      <Body muted>Find your common ground, spend a little time together, and make room for the next meeting.</Body>
      {current.data ? <Card><Heading>Continue with {current.data.other.name}</Heading><Body muted>Your First 20 is still here.</Body><Button title="Return to your hangout" onPress={() => router.replace(`/moment/${current.data!.id}`)} /></Card> : null}
      {bumpAvailable ? (
        <Card dark>
          <Heading onDark>Meet with a bump</Heading>
          <Body onDark muted>Both open this screen, get ready, then gently bump your phones together.</Body>
          {bump?.verification ? <Body onDark>Pair symbols: {bump.verification}</Body> : null}
          {bump?.message ? <Body onDark>{bump.message}</Body> : null}
          {bump?.stage === 'matched' ? <Body onDark>Found each other. Waiting for the invitation to be accepted…</Body> : null}
          {searching ? <Button variant="light" title="Stop looking" onPress={() => { stop(); setBump(undefined); }} /> : <Button variant="light" title="Ready to bump" loading={busy} disabled={Boolean(current.data)} onPress={prepareBump} />}
        </Card>
      ) : <Body muted>Phone bumping is available in the iPhone development build. An invitation code works here.</Body>}
      <Heading>Share an invitation</Heading>
      {share ? <Invitation key={share.code} invitation={share} nfc={nfc} busy={busy} onRefresh={shareCode} onWrite={writeTag} /> : <Button variant="secondary" title="Get an invitation code" loading={busy} disabled={Boolean(current.data)} onPress={shareCode} />}
      <Heading>Receive an invitation</Heading>
      {nfc ? <Button variant="secondary" title="Scan an NFC tag" loading={busy} onPress={scan} /> : null}
      <Row>
        <View style={styles.fill}><Field placeholder="Enter their 6-letter code" accessibilityLabel="Invitation code" value={typed} onChangeText={setTyped} maxLength={6} autoCapitalize="characters" autoCorrect={false} /></View>
        <Button title="Preview" disabled={busy || !/^[A-Z0-9]{6}$/i.test(typed.trim())} onPress={() => { stop(); router.push(`/connect/${typed.trim().toUpperCase()}`); }} />
      </Row>
      {status ? <Body muted>{status}</Body> : null}
      {error ? <Body style={styles.error}>{error}</Body> : null}
    </Screen>
  );
}

function Invitation({ invitation, nfc, busy, onRefresh, onWrite }: {
  invitation: ConnectCode; nfc: boolean; busy: boolean; onRefresh: () => void; onWrite: (url: string) => void;
}) {
  const query = useApi<ConnectLobby>(`/connect/code/${invitation.code}`, { pollMs: 2000 });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (query.data?.moment && ['pending', 'active'].includes(query.data.moment.status)) router.replace(`/moment/${query.data.moment.id}`);
  }, [query.data]);
  const remaining = Math.max(0, Math.ceil((Date.parse(query.data?.expiresAt ?? invitation.expiresAt) - now) / 1000));
  const used = Boolean(query.data?.moment);
  return (
    <Card>
      <Body muted>{used ? 'Invitation used' : remaining ? 'ONE PERSON · ONE BEGINNING' : 'Invitation expired'}</Body>
      <Title style={styles.code}>{invitation.code}</Title>
      <Body muted>{used ? 'Create a fresh invitation to meet someone else.' : remaining ? `Expires in ${Math.floor(remaining / 60)}:${(remaining % 60).toString().padStart(2, '0')}` : 'Create a fresh code and rewrite your NFC tag.'}</Body>
      {nfc && remaining > 0 && !used ? <Button title="Write invitation to NFC tag" disabled={busy} onPress={() => onWrite(invitation.url)} /> : null}
      <Button title="Create a fresh invitation" variant="ghost" loading={busy} onPress={onRefresh} />
      {query.error ? <Body style={styles.error}>{query.error.message}</Body> : null}
    </Card>
  );
}
const styles = StyleSheet.create({ fill: { flex: 1 }, code: { letterSpacing: space.sm, textAlign: 'center', paddingVertical: space.sm }, error: { color: colors.danger } });
