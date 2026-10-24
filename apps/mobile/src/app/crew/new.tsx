import {
  DAY_NAMES,
  INTEREST_LABELS,
  INTERESTS,
  type CrewDemand,
  type CrewSummary,
  type Interest,
  type NewCrewInput,
} from '@200h/shared';
import { router } from 'expo-router';
import { useState } from 'react';

import { Body, Button, Card, Chip, Field, Heading, IconButton, Row, Screen, Title } from '@/components/ui';
import { api, errorMessage, useApi } from '@/lib/api';
import { colors } from '@/theme';

// Screen 7 — Start a crew. At ~50 hours, turn friends into the next crew.

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function StartCrew() {
  const [activity, setActivity] = useState<Interest>('pickleball');
  const demand = useApi<CrewDemand>(`/crews/demand?activity=${activity}`);
  const [name, setName] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState(2);
  const [startTime, setStartTime] = useState('19:00');
  const [location, setLocation] = useState('');
  const [size, setSize] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function create() {
    setBusy(true);
    try {
      const input: NewCrewInput = { name, activity, dayOfWeek, startTime, location, size };
      const crew = await api<CrewSummary>('/crews', { body: input });
      router.replace(`/crew/${crew.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Screen
      edges={['bottom']}
      footer={
        <Button
          title="Create crew"
          onPress={create}
          loading={busy}
          disabled={!name.trim() || !location.trim() || !TIME.test(startTime)}
        />
      }>
      <Row wrap>
        {INTERESTS.map((i) => (
          <Chip key={i} label={INTEREST_LABELS[i]} selected={i === activity} onPress={() => setActivity(i)} />
        ))}
      </Row>

      {demand.data ? (
        <Card>
          <Row>
            <Title>{demand.data.interestedCount}</Title>
            <Body style={{ flex: 1 }}>people near you are into {INTEREST_LABELS[activity].toLowerCase()}</Body>
            <Button variant="ghost" title="Use" onPress={() => setName(`${INTEREST_LABELS[activity]} crew`)} />
          </Row>
        </Card>
      ) : null}

      <Field label="Name" value={name} onChangeText={setName} placeholder="Wednesday Pickleball" />

      <Heading>When</Heading>
      <Row wrap>
        {DAY_NAMES.map((day, i) => (
          <Chip key={day} label={day} selected={i === dayOfWeek} onPress={() => setDayOfWeek(i)} />
        ))}
      </Row>
      <Field label="Start time (24h)" value={startTime} onChangeText={setStartTime} placeholder="19:00" />
      <Field label="Where" value={location} onChangeText={setLocation} placeholder="Mission Rec Center" />

      <Row between>
        <Heading>Size</Heading>
        <Row>
          <IconButton label="−" accessibilityLabel="Smaller" onPress={() => setSize(Math.max(2, size - 1))} />
          <Heading>{size}</Heading>
          <IconButton label="+" accessibilityLabel="Bigger" onPress={() => setSize(Math.min(20, size + 1))} />
        </Row>
      </Row>

      {error ? <Body style={{ color: colors.danger }}>{error}</Body> : null}
    </Screen>
  );
}
