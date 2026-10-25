import { INTEREST_LABELS, type ConnectPreview, type TapMoment } from '@200h/shared';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Orbit, Reveal } from '@/components/connect/orbit';
import { Body, Button, Card, Chip, Heading, QueryState, Row, Screen, Title } from '@/components/ui';
import { api, errorMessage, useApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

export default function Invitation() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { userId } = useSession();
  // Keep the invitation in the route through onboarding. No connection is created on open.
  if (!userId) return <Redirect href={{ pathname: '/onboarding', params: { connectCode: code } }} />;
  return <Preview code={code} />;
}

function Preview({ code }: { code: string }) {
  const query = useApi<ConnectPreview>(`/connect/preview/${encodeURIComponent(code)}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function accept() {
    setBusy(true); setError(undefined);
    try {
      const moment = await api<TapMoment>('/connect/redeem', { body: { code } });
      router.replace(`/moment/${moment.id}`);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  if (!query.data) return <Screen edges={['bottom']}><QueryState query={query} /><Button title="Back to connect" variant="ghost" onPress={() => router.replace('/connect')} /></Screen>;
  const preview = query.data;
  return (
    <Screen edges={['bottom']}>
      <Orbit joined right={preview.user.name} />
      <Reveal><Title>A little common ground.</Title></Reveal>
      <Reveal delay={150}>
        <Card>
          <Heading>Meet {preview.user.name}</Heading>
          <Body muted>{preview.user.city}</Body>
          <Row wrap>{preview.sharedInterests.map((i) => <Chip key={i} label={INTEREST_LABELS[i]} selected />)}</Row>
          {!preview.sharedInterests.length ? <Body muted>Different interests. Plenty of stories to trade.</Body> : null}
        </Card>
      </Reveal>
      <Reveal delay={300}><Card dark><Body onDark muted>{preview.activity.source === 'ai' ? 'YOUR FIRST 20 · AI IDEA' : 'YOUR FIRST 20 · CONVERSATION IDEA'}</Body><Heading onDark>{preview.activity.title}</Heading><Body onDark>{preview.activity.prompt}</Body></Card></Reveal>
      <Body muted>Ask to spend 20 minutes together. {preview.user.name} confirms before your connection and timer begin.</Body>
      <Button title={preview.momentId ? 'Return to your hangout' : `Begin with ${preview.user.name}`} loading={busy} onPress={accept} />
      <Button variant="ghost" title="Maybe another time" onPress={() => router.replace('/connect')} />
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
    </Screen>
  );
}
