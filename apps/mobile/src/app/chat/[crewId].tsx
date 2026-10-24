import type { ChatThread, Message, Poll } from '@200h/shared';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Button, IconButton, QueryState } from '@/components/ui';
import { api, errorMessage, useApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, font, radius, space } from '@/theme';

// Screen 5 — Crew chat. The AI posts ideas as a poll; a majority locks the plan
// and adds it to everyone's week. Polls every 4s (no websockets yet).

export default function CrewChat() {
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const { userId } = useSession();
  const query = useApi<ChatThread>(`/crews/${crewId}/messages`, { pollMs: 4000 });
  const [text, setText] = useState('');
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string>();
  const list = useRef<FlatList<Message>>(null);

  async function run(action: () => Promise<unknown>) {
    try {
      setError(undefined);
      await action();
      await query.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function send() {
    const body = text.trim();
    if (!body) return;
    setText('');
    run(() => api(`/crews/${crewId}/messages`, { body: { text: body } }));
  }

  async function plan() {
    setPlanning(true);
    await run(() => api(`/crews/${crewId}/plan`, { method: 'POST' }));
    setPlanning(false);
  }

  const vote = (pollId: string, optionIndex: number) =>
    run(() => api(`/polls/${pollId}/vote`, { body: { optionIndex } }));

  if (!query.data) return <QueryState query={query} />;
  const { crew, messages, polls } = query.data;

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      <Stack.Screen
        options={{
          title: crew.name,
          headerRight: () => <Button variant="ghost" title="Crew" onPress={() => router.push(`/crew/${crew.id}`)} />,
        }}
      />
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => (
          <MessageView
            message={item}
            poll={item.pollId ? polls[item.pollId] : undefined}
            mine={item.author?.id === userId}
            onVote={vote}
          />
        )}
      />
      {error ? <Body style={styles.error}>{error}</Body> : null}
      <SafeAreaView edges={['bottom']} style={styles.composer}>
        <Button variant="secondary" title="✨ Plan" onPress={plan} loading={planning} />
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Message"
          placeholderTextColor={colors.inkMuted}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <IconButton label="↑" accessibilityLabel="Send" filled onPress={send} disabled={!text.trim()} />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function MessageView({
  message,
  poll,
  mine,
  onVote,
}: {
  message: Message;
  poll?: Poll;
  mine: boolean;
  onVote: (pollId: string, optionIndex: number) => void;
}) {
  if (message.kind === 'poll' && poll) return <PollCard poll={poll} onVote={onVote} />;
  if (message.kind === 'ai') {
    return (
      <View style={styles.aiBubble}>
        <Text style={styles.aiLabel}>AI</Text>
        <Body>{message.text}</Body>
      </View>
    );
  }
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
      {!mine && message.author ? <Text style={styles.author}>{message.author.name}</Text> : null}
      <Body onDark={mine}>{message.text}</Body>
    </View>
  );
}

function PollCard({ poll, onVote }: { poll: Poll; onVote: (pollId: string, optionIndex: number) => void }) {
  const total = Math.max(1, ...poll.options.map((o) => o.votes));
  const locked = poll.lockedIndex !== null;
  return (
    <View style={styles.poll}>
      <Text style={styles.pollQuestion}>{poll.question}</Text>
      {poll.options.map((option, i) => (
        <Pressable
          key={option.label}
          disabled={locked}
          onPress={() => onVote(poll.id, i)}
          accessibilityRole="button"
          accessibilityLabel={`${option.label}, ${option.votes} votes`}
          style={styles.option}>
          <View style={[styles.optionFill, { width: `${(option.votes / total) * 100}%` }]} />
          <Text style={styles.optionText}>
            {poll.lockedIndex === i ? '✓ ' : ''}
            {option.label}
            {option.votedByMe ? ' (you)' : ''}
          </Text>
          <Text style={styles.optionVotes}>{option.votes}</Text>
        </Pressable>
      ))}
      <Text style={styles.pollHint}>{locked ? 'Locked. It is on everyone’s week.' : 'Majority locks the plan.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  messages: { padding: space.md, gap: space.sm },
  error: { color: colors.danger, paddingHorizontal: space.md },
  bubble: { maxWidth: '80%', borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.dark },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  author: { fontSize: font.small, fontWeight: '600', color: colors.inkMuted, marginBottom: 2 },
  aiBubble: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.accent,
    padding: space.sm,
    gap: 2,
  },
  aiLabel: { fontSize: font.small, color: colors.accent, fontWeight: '600' },
  poll: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
    gap: space.sm,
  },
  pollQuestion: { fontSize: font.body, fontWeight: '600', color: colors.ink },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  optionFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.accentSoft },
  optionText: { fontSize: font.body, color: colors.ink },
  optionVotes: { fontSize: font.small, color: colors.inkMuted },
  pollHint: { fontSize: font.small, color: colors.inkMuted },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: space.md,
    fontSize: font.body,
    color: colors.ink,
  },
});
