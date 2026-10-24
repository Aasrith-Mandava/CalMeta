import { INTEREST_LABELS, formatWeekly, type CrewPage, type JoinResult } from '@200h/shared';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  Avatar,
  AvatarStack,
  Body,
  Button,
  Card,
  Heading,
  IconButton,
  QueryState,
  Row,
  Screen,
  formatWhen,
} from '@/components/ui';
import { api, errorMessage, useApi } from '@/lib/api';
import { colors } from '@/theme';

// Screen 8 — Crew page: next session with "Going", join requests (owner), members.

export default function CrewPageScreen() {
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const query = useApi<CrewPage>(`/crews/${crewId}`);
  const [error, setError] = useState<string>();

  async function run(action: () => Promise<unknown>) {
    try {
      setError(undefined);
      await action();
      await query.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (!query.data) return <QueryState query={query} />;
  const { crew, nextSession, members, pending, isOwner, myStatus } = query.data;

  const footer =
    myStatus === 'active' ? (
      <Button title="Open chat" onPress={() => router.push(`/chat/${crew.id}`)} />
    ) : myStatus === 'pending' ? (
      <Button variant="secondary" title="Request sent" disabled />
    ) : (
      <Button title="Join crew" onPress={() => run(() => api<JoinResult>(`/crews/${crew.id}/join`, { method: 'POST' }))} />
    );

  return (
    <Screen edges={['bottom']} footer={footer}>
      <Stack.Screen options={{ title: crew.name }} />
      <Body muted>
        {INTEREST_LABELS[crew.activity]} · every {formatWeekly(crew.dayOfWeek, crew.startTime)} · {crew.location}
      </Body>

      {nextSession ? (
        <Card dark>
          <Body onDark muted>
            Next · {formatWhen(nextSession.startsAt)}
          </Body>
          <Heading onDark>{nextSession.title ?? 'Weekly session'}</Heading>
          <Row between>
            <AvatarStack names={nextSession.attendees.map((a) => a.name)} />
            {myStatus !== 'active' ? null : nextSession.myStatus ? (
              <Body onDark>{nextSession.myStatus === 'checked_in' ? 'Checked in ✓' : 'Going ✓'}</Body>
            ) : (
              <Button
                variant="light"
                title="Going"
                onPress={() => run(() => api(`/sessions/${nextSession.id}/attendance`, { body: { status: 'going' } }))}
              />
            )}
          </Row>
        </Card>
      ) : null}

      {isOwner && pending.length > 0 ? <Heading>Join requests</Heading> : null}
      {pending.map((person) => (
        <Card key={person.id}>
          <Row between>
            <Row>
              <Avatar name={person.name} uri={person.photoUrl} />
              <Body>{person.name}</Body>
            </Row>
            <Row>
              <IconButton
                label="✕"
                accessibilityLabel={`Decline ${person.name}`}
                onPress={() => run(() => api(`/crews/${crew.id}/members/${person.id}`, { body: { action: 'decline' } }))}
              />
              <IconButton
                label="ok"
                accessibilityLabel={`Approve ${person.name}`}
                filled
                onPress={() => run(() => api(`/crews/${crew.id}/members/${person.id}`, { body: { action: 'approve' } }))}
              />
            </Row>
          </Row>
        </Card>
      ))}

      <Heading>
        Members · {crew.memberCount}/{crew.size}
      </Heading>
      {members.map((member) => (
        <Pressable key={member.id} onPress={() => router.push(`/friend/${member.id}`)}>
          <Row>
            <Avatar name={member.name} uri={member.photoUrl} />
            <View>
              <Body>{member.name}</Body>
            </View>
          </Row>
        </Pressable>
      ))}

      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
    </Screen>
  );
}
