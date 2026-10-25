import { INTEREST_LABELS, LEVEL_LABELS, formatTogether, formatWeekly, type FriendProfile } from '@200h/shared';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { FriendRing } from '@/components/friend-ring';
import { Avatar, Body, Button, Card, Chip, Heading, QueryState, Row, Screen, Title } from '@/components/ui';
import { useApi } from '@/lib/api';
import { space } from '@/theme';

// Screen 6 — Friend profile. Tap a ring on Home: hours together, what you share,
// and the AI's next step.

export default function FriendProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const query = useApi<FriendProfile>(`/friends/${userId}`);

  if (!query.data) return <QueryState query={query} />;
  const { user, progress, sharedInterests, sharedCrews, nextStep, firstTwenty } = query.data;
  const firstCrew = sharedCrews[0];
  const toNext = progress.nextThreshold === null ? null : Math.ceil(progress.nextThreshold - progress.hours);

  return (
    <Screen
      edges={['bottom']}
      footer={
        <Row>
          {/* TODO(dm): 1:1 messages. For now "Message" opens the crew chat you share. */}
          <Button
            variant="secondary"
            title="Message"
            style={styles.fill}
            disabled={!firstCrew}
            onPress={() => firstCrew && router.push(`/chat/${firstCrew.id}`)}
          />
          <Button title="Start a crew" style={styles.fill} onPress={() => router.push('/crew/new')} />
        </Row>
      }>
      <Stack.Screen options={{ title: user.name }} />
      <View style={styles.hero}>
        <Avatar name={user.name} uri={user.photoUrl} size={112} />
        <Title>{user.name}</Title>
        <Body muted>{user.city}</Body>
      </View>

      <Card dark>
        <Row style={styles.hours}>
          <FriendRing name={user.name} progress={progress.progress} center={formatTogether(progress.hours)} size={72} onDark />
          <View style={styles.fill}>
            <Heading onDark>{LEVEL_LABELS[progress.level]}</Heading>
            {toNext !== null ? (
              <Body onDark muted>
                {toNext}h to {progress.nextThreshold}h
              </Body>
            ) : null}
          </View>
        </Row>
        <Body onDark>{nextStep}</Body>
      </Card>

      {sharedInterests.length > 0 ? (
        <Row wrap>
          {sharedInterests.map((i) => (
            <Chip key={i} label={INTEREST_LABELS[i]} selected />
          ))}
        </Row>
      ) : null}

      {user.prompt ? (
        <Card>
          <Body muted>{user.prompt.question}</Body>
          <Body>{user.prompt.answer}</Body>
        </Card>
      ) : null}

      {firstTwenty ? (
        <Card>
          <Body muted>A CHAPTER TOGETHER · {new Date(firstTwenty.completedAt).toLocaleDateString()}</Body>
          <Heading>{firstTwenty.title}</Heading>
          <Body>{firstTwenty.minutes} minutes, confirmed by you both.</Body>
        </Card>
      ) : null}

      {sharedCrews.length > 0 ? <Heading>Crews together</Heading> : null}
      {sharedCrews.map((crew) => (
        <Card key={crew.id} onPress={() => router.push(`/crew/${crew.id}`)}>
          <Body>{crew.name}</Body>
          <Body muted>Every {formatWeekly(crew.dayOfWeek, crew.startTime)}</Body>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hero: { alignItems: 'center', gap: space.xs },
  hours: { gap: space.md },
});
