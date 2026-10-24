import {
  INTEREST_LABELS,
  formatWeekly,
  type CrewSummary,
  type DiscoverCard,
  type JoinResult,
  type LikeResult,
} from '@200h/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Body, Button, Card, Chip, Field, Heading, IconButton, QueryState, Row, Screen, Title } from '@/components/ui';
import { api, errorMessage, useApi } from '@/lib/api';
import { colors, font, radius, space } from '@/theme';

// Screen 4 — Discover. Hinge-style: photo, shared tags, one prompt. Like a prompt
// or skip. The Crews tab lists groups to join.

export default function Discover() {
  const [tab, setTab] = useState<'people' | 'crews'>('people');
  return (
    <Screen edges={['top']}>
      <Row style={styles.tabs}>
        {(['people', 'crews'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}>
            <Text style={[styles.tab, tab === t && styles.tabActive]}>{t === 'people' ? 'People' : 'Crews'}</Text>
          </Pressable>
        ))}
      </Row>
      {tab === 'people' ? <People /> : <Crews />}
    </Screen>
  );
}

function People() {
  const query = useApi<DiscoverCard[]>('/discover/people');
  const [index, setIndex] = useState(0);
  const [comment, setComment] = useState('');
  const [matchedWith, setMatchedWith] = useState<string>();
  const [error, setError] = useState<string>();

  if (!query.data) return <QueryState query={query} />;
  const card = query.data[index];
  if (!card) return <Body muted>You’ve seen everyone nearby. Check back as more newcomers join.</Body>;
  const { user, sharedInterests } = card;

  function next() {
    setComment('');
    setIndex((i) => i + 1);
  }

  async function like() {
    try {
      const result = await api<LikeResult>('/likes', { body: { toUserId: user.id, comment: comment.trim() || undefined } });
      setMatchedWith(result.matched ? user.name : undefined);
      next();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <View style={styles.stack}>
      {matchedWith ? (
        <Card style={styles.match}>
          <Body>You and {matchedWith} liked each other. {matchedWith} is on your Home now.</Body>
        </Card>
      ) : null}
      <View style={styles.photo}>
        <Avatar name={user.name} uri={user.photoUrl} size={112} />
        <Title>{user.name}</Title>
        <Body muted>{user.city}</Body>
      </View>
      <Row wrap>
        {user.interests.map((i) => (
          <Chip key={i} label={INTEREST_LABELS[i]} selected={sharedInterests.includes(i)} />
        ))}
      </Row>
      {user.prompt ? (
        <Card>
          <Body muted>{user.prompt.question}</Body>
          <Heading>{user.prompt.answer}</Heading>
          <Field placeholder="Reply to like their prompt (optional)" value={comment} onChangeText={setComment} />
        </Card>
      ) : null}
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
      <Row style={styles.actions}>
        <IconButton label="✕" accessibilityLabel="Skip" onPress={next} />
        <IconButton label="♥" accessibilityLabel="Like" filled onPress={like} />
      </Row>
    </View>
  );
}

function Crews() {
  const query = useApi<CrewSummary[]>('/discover/crews');
  const [statuses, setStatuses] = useState<Record<string, JoinResult['status']>>({});

  if (!query.data) return <QueryState query={query} />;
  if (query.data.length === 0) return <Body muted>No open crews nearby yet. Start one from Home.</Body>;

  async function join(crewId: string) {
    const { status } = await api<JoinResult>(`/crews/${crewId}/join`, { method: 'POST' });
    setStatuses((s) => ({ ...s, [crewId]: status }));
  }

  return (
    <View style={styles.stack}>
      {query.data.map((crew) => {
        const status = statuses[crew.id];
        return (
          <Card key={crew.id}>
            <Body muted>{INTEREST_LABELS[crew.activity]}</Body>
            <Heading>{crew.name}</Heading>
            <Body muted>
              {formatWeekly(crew.dayOfWeek, crew.startTime)} · {crew.location} · {crew.memberCount}/{crew.size}
            </Body>
            <Button
              variant={status ? 'secondary' : 'primary'}
              title={status === 'active' ? 'Joined ✓' : status === 'pending' ? 'Requested' : 'Join'}
              disabled={Boolean(status)}
              onPress={() => join(crew.id)}
            />
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { gap: space.md },
  tab: { fontSize: font.title - 6, fontWeight: '700', color: colors.inkMuted },
  tabActive: { color: colors.ink },
  stack: { gap: space.md },
  photo: {
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  match: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
  actions: { justifyContent: 'center', gap: space.lg },
});
