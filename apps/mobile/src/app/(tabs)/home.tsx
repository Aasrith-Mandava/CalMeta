import type { Home } from '@200h/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { FriendRing } from '@/components/friend-ring';
import { AvatarStack, Body, Button, Card, ChatRow, Heading, QueryState, Row, Screen, Title, formatWhen } from '@/components/ui';
import { api, errorMessage, useApi } from '@/lib/api';
import { colors, space } from '@/theme';

// Screen 3 — Home, the glance screen: next session, people as rings that fill
// toward friends, chats with unread counts.

export default function HomeScreen() {
  const query = useApi<Home>('/me/home');
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState<string>();

  if (!query.data) {
    return (
      <Screen edges={['top']} scroll={false}>
        <QueryState query={query} />
      </Screen>
    );
  }
  const { me, nextSession, people, chats } = query.data;

  async function checkIn(sessionId: string) {
    setCheckingIn(true);
    try {
      await api(`/sessions/${sessionId}/attendance`, { body: { status: 'checked_in' } });
      await query.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCheckingIn(false);
    }
  }

  return (
    <Screen edges={['top']}>
      <Row between>
        <Title>Hi, {me.name}</Title>
        <Button variant="secondary" title="Tap to connect" onPress={() => router.push('/connect')} />
      </Row>

      {nextSession ? (
        <Card dark onPress={() => router.push(`/crew/${nextSession.crewId}`)}>
          <Body onDark muted>
            Next up · {formatWhen(nextSession.startsAt)}
          </Body>
          <Heading onDark>{nextSession.title ?? nextSession.crewName}</Heading>
          <Body onDark muted>
            {nextSession.location}
          </Body>
          <Row between>
            <AvatarStack names={nextSession.attendees.map((a) => a.name)} />
            {nextSession.myStatus === 'checked_in' ? (
              <Body onDark>Checked in ✓</Body>
            ) : (
              <Button variant="light" title="Check in" loading={checkingIn} onPress={() => checkIn(nextSession.id)} />
            )}
          </Row>
        </Card>
      ) : (
        <Card>
          <Body>You’re not in a crew yet.</Body>
          <Button title="Find my crew" onPress={() => router.push('/onboarding/crew')} />
        </Card>
      )}
      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}

      <Card onPress={() => router.push('/crew/new')}>
        <Row between>
          <Body>Start a crew</Body>
          <Body muted>›</Body>
        </Row>
      </Card>

      <Heading>Your people</Heading>
      {people.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rings}>
          {people.map(({ user, progress }) => (
            <FriendRing
              key={user.id}
              name={user.name}
              progress={progress.progress}
              label={`${Math.round(progress.hours)}h`}
              onPress={() => router.push(`/friend/${user.id}`)}
            />
          ))}
        </ScrollView>
      ) : (
        <Body muted>Rings fill as you spend time together: 50h casual friends, 90h friends, 200h close friends.</Body>
      )}

      <Heading>Chats</Heading>
      {chats.map((chat) => (
        <ChatRow key={chat.crewId} chat={chat} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rings: { gap: space.md, paddingVertical: space.xs },
});
