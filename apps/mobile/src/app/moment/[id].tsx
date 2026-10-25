import { INTEREST_LABELS, formatWeekly, type TapMoment } from '@200h/shared';
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { Orbit, Reveal } from '@/components/connect/orbit';
import { Body, Button, Card, Chip, Heading, QueryState, Row, Screen, Title } from '@/components/ui';
import { api, errorMessage, useApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

export default function MomentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useSession();
  if (!userId) return <Redirect href="/onboarding" />;
  return <Moment id={id} />;
}

function Moment({ id }: { id: string }) {
  const query = useApi<TapMoment>(`/connect/moments/${id}`, { pollMs: 3000 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [clock, setClock] = useState<number>();
  const clockOffset = useRef(0);
  const { reload } = query;
  useEffect(() => {
    if (query.data) clockOffset.current = Date.parse(query.data.serverNow) - Date.now();
  }, [query.data]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now() + clockOffset.current), 1000);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') reload(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [reload]);

  async function act(action: 'start' | 'confirm' | 'cancel') {
    setBusy(true); setError(undefined);
    try {
      await api<TapMoment>(`/connect/moments/${id}`, { body: { action } });
      await query.reload();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  if (!query.data) return <Screen edges={['bottom']}><QueryState query={query} /></Screen>;
  const moment = query.data;
  const remaining = moment.startedAt ? Math.max(0, Math.ceil((Date.parse(moment.startedAt) + moment.durationMinutes * 60_000 - (clock ?? Date.parse(moment.serverNow))) / 1000)) : moment.durationMinutes * 60;
  const complete = moment.status === 'completed';
  const ended = ['expired', 'cancelled'].includes(moment.status);
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Your first chapter' }} />
      <Orbit joined={moment.status !== 'pending'} complete={complete} right={moment.other.name} />
      <Reveal><Title>{complete ? 'A memory, together.' : ended ? 'Another time.' : moment.status === 'pending' ? 'Almost your first hello.' : 'This time is yours.'}</Title></Reveal>
      <Body muted>{complete ? `${moment.durationMinutes} minutes added with ${moment.other.name}.` : ended ? 'This hangout ended without adding time. A fresh tap starts a new invitation.' : `You + ${moment.other.name}`}</Body>
      {!ended ? (
        <>
          <Row wrap>{moment.sharedInterests.map((i) => <Chip key={i} label={INTEREST_LABELS[i]} selected />)}</Row>
          <Reveal delay={180}><Card dark><Body onDark muted>{moment.activity.source === 'ai' ? 'A PLACE TO START · AI IDEA' : 'A PLACE TO START'}</Body><Heading onDark>{moment.activity.title}</Heading><Body onDark>{moment.activity.prompt}</Body></Card></Reveal>
        </>
      ) : null}
      {moment.status === 'pending' ? (
        <Card>
          <Heading>{moment.isHost ? `${moment.other.name} is here. Is that who you met?` : `Waiting for ${moment.other.name}`}</Heading>
          <Body muted>{moment.isHost ? 'Start only when you are both ready. Your friendship connection begins here.' : 'Keep both phones open. The person sharing starts your hangout.'}</Body>
          {moment.isHost ? <Button title="Yes — start together" loading={busy} onPress={() => act('start')} /> : null}
        </Card>
      ) : null}
      {moment.status === 'active' ? (
        <Card>
          <View accessible accessibilityLabel={`${Math.ceil(remaining / 60)} minutes remaining`}>
            <Text style={styles.timer}>{Math.floor(remaining / 60).toString().padStart(2, '0')}:{(remaining % 60).toString().padStart(2, '0')}</Text>
          </View>
          <Body muted>{remaining > 0 ? 'Put your phones away. The timer keeps going.' : 'Time well spent? Both people confirm to add these minutes.'}</Body>
          {moment.confirmedByMe ? <Body>Confirmed by you. {moment.confirmedByOther ? 'Both confirmed.' : `Waiting for ${moment.other.name}.`}</Body> : <Button title="We spent this time together" disabled={remaining > 0} loading={busy} onPress={() => act('confirm')} />}
          <Body muted>Confirm within 24 hours of starting.</Body>
        </Card>
      ) : null}
      {query.error ? <Body style={styles.error}>Connection interrupted. Reconnecting…</Body> : null}
      {error ? <Body style={styles.error}>{error}</Body> : null}
      {complete ? <Button title={`See your friendship with ${moment.other.name}`} onPress={() => router.replace(`/friend/${moment.other.id}`)} /> : null}
      {moment.nextCrew && !ended ? <Card><Body muted>MAKE THE NEXT HELLO EASY</Body><Heading>{moment.nextCrew.name}</Heading><Body>You share the interest and free time.</Body><Body muted>{formatWeekly(moment.nextCrew.dayOfWeek, moment.nextCrew.startTime)} · {moment.nextCrew.location}</Body><Button variant="secondary" title="Explore this crew together" onPress={() => router.push(`/crew/${moment.nextCrew!.id}`)} /><Body muted>Each person chooses whether to join. Places may change.</Body></Card> : null}
      {complete && !moment.nextCrew ? <Button variant="secondary" title="Find your next crew" onPress={() => router.push('/discover')} /> : null}
      {ended ? <Button title="Start with a fresh tap" onPress={() => router.replace('/connect')} /> : null}
      {!complete && !ended ? <Button variant="ghost" title="End without adding time" loading={busy} onPress={() => act('cancel')} /> : null}
      <Button variant="ghost" title="Back home" onPress={() => router.replace('/home')} />
    </Screen>
  );
}
const styles = StyleSheet.create({ timer: { color: colors.accent, fontSize: 56, fontVariant: ['tabular-nums'], fontWeight: '600', textAlign: 'center', paddingVertical: 12 }, error: { color: colors.danger } });
