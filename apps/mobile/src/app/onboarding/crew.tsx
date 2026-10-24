import { INTEREST_LABELS, formatWeekly, type CrewSuggestion, type JoinResult } from '@200h/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AvatarStack, Body, Button, Card, Heading, IconButton, QueryState, Row, Screen, Title } from '@/components/ui';
import { ApiError, api, errorMessage, useApi } from '@/lib/api';
import { colors, radius, space } from '@/theme';

// Screen 2 — Your crew. One AI-picked crew at a time; ✕ shows another.

export default function YourCrew() {
  const [skipped, setSkipped] = useState<string[]>([]);
  const query = useApi<CrewSuggestion>(`/me/crew-suggestion?skip=${skipped.join(',')}`);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string>();

  if (query.error instanceof ApiError && query.error.status === 404) {
    return (
      <Screen
        edges={['bottom']}
        footer={
          <>
            <Button title="Start a crew" onPress={() => router.replace('/crew/new')} />
            <Button variant="ghost" title="Skip for now" onPress={() => router.replace('/home')} />
          </>
        }>
        <Title>No more crews nearby</Title>
        <Body muted>Start one and we’ll invite newcomers who fit.</Body>
      </Screen>
    );
  }
  if (!query.data) return <QueryState query={query} />;

  const { crew, members, reason } = query.data;

  async function join() {
    setJoining(true);
    try {
      await api<JoinResult>(`/crews/${crew.id}/join`, { method: 'POST' });
      router.replace('/home');
    } catch (e) {
      setError(errorMessage(e));
      setJoining(false);
    }
  }

  return (
    <Screen
      edges={['bottom']}
      footer={
        <Row>
          <IconButton label="✕" accessibilityLabel="Show another crew" onPress={() => setSkipped([...skipped, crew.id])} />
          <Button title="I'm in" onPress={join} loading={joining} style={styles.fill} />
        </Row>
      }>
      <Card>
        <Body muted>{INTEREST_LABELS[crew.activity]}</Body>
        <Title>{crew.name}</Title>
        <Body muted>
          Every {formatWeekly(crew.dayOfWeek, crew.startTime)} · {crew.location}
        </Body>
        <Row>
          <AvatarStack names={members.map((m) => m.name)} />
          <Body muted>
            {crew.memberCount} of {crew.size} spots taken
          </Body>
        </Row>
        <View style={styles.reason}>
          <Heading>Why this crew</Heading>
          <Body>{reason}</Body>
        </View>
      </Card>
      <Body muted>Same people, same time, every week. That’s how the hours add up.</Body>
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  reason: { backgroundColor: colors.accentSoft, borderRadius: radius.sm, padding: space.md, gap: space.xs },
});
