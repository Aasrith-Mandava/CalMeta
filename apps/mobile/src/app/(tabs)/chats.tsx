import type { ChatSummary } from '@200h/shared';

import { Body, ChatRow, QueryState, Screen, Title } from '@/components/ui';
import { useApi } from '@/lib/api';

// All crew chats. (1:1 DMs aren't modeled yet.)

export default function Chats() {
  const query = useApi<ChatSummary[]>('/me/chats');
  return (
    <Screen edges={['top']}>
      <Title>Chats</Title>
      {!query.data ? (
        <QueryState query={query} />
      ) : query.data.length === 0 ? (
        <Body muted>Join a crew to start chatting.</Body>
      ) : (
        query.data.map((chat) => <ChatRow key={chat.crewId} chat={chat} />)
      )}
    </Screen>
  );
}
