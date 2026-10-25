import {
  INTEREST_LABELS,
  INTERESTS,
  SLOTS,
  type InterestSuggestion,
  type Interest,
  type OnboardingInput,
  type PublicProfile,
  type Slot,
} from '@200h/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { Body, Button, Field } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useVoiceInput } from '@/lib/use-voice-input';
import { colors } from '@/theme';

// Screen 1 — About you. Tap interests or say them out loud. Two questions only.

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
const slotLabels: Record<Slot, string> = {
  weeknights: 'Weeknights', weekend_am: 'Weekend mornings', weekend_pm: 'Weekend afternoons',
};
const palette = { bg: '#F8F7FC', ink: '#211D40', muted: '#68617F', accent: '#7047F8', line: '#E2DDF2', disabled: '#E9E5F2' };

export default function AboutYou() {
  const { signIn } = useSession();
  const { connectCode } = useLocalSearchParams<{ connectCode?: string }>();
  const invitation = connectCode && /^[A-Z0-9]{4,12}$/i.test(connectCode) ? connectCode.toUpperCase() : null;
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [naming, setNaming] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [availability, setAvailability] = useState<Slot[]>([]);
  const [busy, setBusy] = useState<'tagging' | 'saving' | null>(null);
  const [error, setError] = useState<string>();
  const [suggestion, setSuggestion] = useState<{ text: string; source: InterestSuggestion['source'] }>();
  const voice = useVoiceInput(about, setAbout);
  const locked = busy !== null || voice.busy;
  const ready = interests.length > 0 && availability.length > 0;

  async function tagFromText() {
    if (locked || !about.trim()) return;
    setError(undefined);
    setSuggestion(undefined);
    setBusy('tagging');
    try {
      const tags = await api<InterestSuggestion>('/ai/interests', { body: { text: about } });
      setInterests((current) => [...new Set([...current, ...tags.interests])]);
      setAvailability((current) => [...new Set([...current, ...tags.availability])]);
      setSuggestion({ text: about, source: tags.source });
      if (!tags.interests.length && !tags.availability.length) {
        setError('No tags found yet. Tell us an activity and when you’re free, or choose below.');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function findMyCrew() {
    if (locked) return;
    setError(undefined);
    setBusy('saving');
    try {
      const input: OnboardingInput = { name, interests, availability };
      const me = await api<PublicProfile>('/users', { body: input });
      await signIn(me.id);
      router.replace(invitation ? `/connect/${invitation}` : '/onboarding/crew');
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  async function continueAsDemoUser(id: string) {
    await signIn(id);
    router.replace(invitation ? `/connect/${invitation}` : '/home');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>
            {naming ? (
              <>
                <Pressable accessibilityRole="button" onPress={() => setNaming(false)} disabled={locked} style={styles.textButton}>
                  <Text style={styles.link}>‹ Back</Text>
                </Pressable>
                <Text accessibilityRole="header" style={styles.title}>{'What should we\ncall you?'}</Text>
                <Field accessibilityLabel="First name" placeholder="First name" value={name} onChangeText={setName} autoCapitalize="words" maxLength={40} editable={!locked} style={styles.nameInput} />
                <Body muted>We’ll use your first name to introduce you to your crew.</Body>
              </>
            ) : (
              <>
                <Text accessibilityRole="header" style={styles.title}>{'What are you\ninto?'}</Text>
                <View style={styles.voiceRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={voice.state === 'listening' ? 'Stop listening' : 'Say your interests and free time'}
                    accessibilityHint="Speech may use your device’s speech service. Review the transcript before sending it for suggestions."
                    disabled={busy !== null || voice.state === 'requesting' || voice.state === 'stopping' || (voice.state === 'idle' && about.length >= 2000)}
                    onPress={() => { setShowTranscript(true); void voice.toggle(); }}
                    style={({ pressed }) => [styles.mic, voice.state === 'listening' && styles.micListening, pressed && styles.pressed]}>
                    {voice.state === 'requesting' || voice.state === 'stopping' ? <ActivityIndicator color="white" /> : (
                      <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round">
                        {voice.state === 'listening' ? <Rect x={6} y={6} width={12} height={12} rx={2} fill="white" stroke="none" /> : <>
                          <Rect x={9} y={2} width={6} height={13} rx={3} />
                          <Path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3" />
                        </>}
                      </Svg>
                    )}
                  </Pressable>
                  <View style={styles.fill} accessibilityLiveRegion="polite">
                    <Text style={styles.voiceLabel}>{voice.state === 'listening' ? 'Listening… tap to stop'
                      : voice.state === 'requesting' ? 'Allow microphone access…'
                        : voice.state === 'stopping' ? 'Finishing…' : 'Or just say it'}</Text>
                    <Pressable accessibilityRole="button" onPress={() => setShowTranscript(!showTranscript)} disabled={locked} style={styles.typeButton}>
                      <Text style={styles.typeLink}>{showTranscript ? 'Hide transcript' : 'Type instead'}</Text>
                    </Pressable>
                  </View>
                </View>

                {showTranscript ? (
                  <View style={styles.transcriptGroup}>
                    <Field accessibilityLabel="About you transcript" placeholder="I love climbing. I’m free on weeknights…" value={about} onChangeText={setAbout} multiline maxLength={2000} editable={!locked} style={styles.transcript} />
                    <Body muted>Review your words, then let Muse Spark suggest tags.</Body>
                    <Button title="Suggest my tags" variant="secondary" onPress={tagFromText} loading={busy === 'tagging'} disabled={!about.trim() || locked} />
                  </View>
                ) : null}
                {voice.error ? <Body style={styles.error}>{voice.error}</Body> : null}
                {suggestion?.text === about ? <Body muted>{suggestion.source === 'ai'
                  ? 'Tags suggested by Muse Spark. Change any below.'
                  : 'AI is unavailable. Check these basic keyword suggestions.'}</Body> : null}

                <View style={styles.chips}>
                  {INTERESTS.filter((i, index) => showAll || index < 6 || interests.includes(i)).map((i) => (
                    <Choice key={i} label={INTEREST_LABELS[i]} selected={interests.includes(i)} disabled={locked} onPress={() => setInterests(toggle(interests, i))} />
                  ))}
                </View>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAll }} onPress={() => setShowAll(!showAll)} style={styles.moreButton}>
                  <Text style={styles.typeLink}>{showAll ? 'Fewer interests' : 'More interests'}</Text>
                </Pressable>
                <Text accessibilityRole="header" style={styles.sectionTitle}>Free when?</Text>
                <View style={styles.chips}>
                  {SLOTS.map((s) => <Choice key={s} label={slotLabels[s]} selected={availability.includes(s)} disabled={locked} onPress={() => setAvailability(toggle(availability, s))} />)}
                </View>
              </>
            )}
            {error ? <Body style={styles.error}>{error}</Body> : null}
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: locked || !ready || (naming && !name.trim()), busy: busy === 'saving' }}
            disabled={locked || !ready || (naming && !name.trim())}
            onPress={naming ? findMyCrew : () => { setError(undefined); setNaming(true); }}
            style={({ pressed }) => [styles.continue, (locked || !ready || (naming && !name.trim())) && styles.continueDisabled, pressed && styles.pressed]}>
            {busy === 'saving' ? <ActivityIndicator color="white" /> : <Text style={[styles.continueText, (locked || !ready || (naming && !name.trim())) && styles.continueTextDisabled]}>
              {naming ? 'Find my crew' : ready ? 'Continue' : 'Pick one of each'}
            </Text>}
          </Pressable>
          {__DEV__ && naming ? (
            <View style={styles.chips}>
              <Button variant="ghost" title="Dev: Alex" onPress={() => continueAsDemoUser('u_alex')} disabled={locked} />
              <Button variant="ghost" title="Dev: Sam" onPress={() => continueAsDemoUser('u_sam')} disabled={locked} />
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Choice({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}>
    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{selected ? `✓ ${label}` : label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  fill: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 64, paddingBottom: 28 },
  column: { width: '100%', maxWidth: 464, alignSelf: 'center' },
  title: { color: palette.ink, fontSize: 42, lineHeight: 45, fontWeight: '800', letterSpacing: -1.2, marginBottom: 32 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 28 },
  mic: { width: 68, height: 68, borderRadius: 34, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' },
  micListening: { backgroundColor: colors.danger },
  voiceLabel: { color: palette.muted, fontSize: 17 },
  typeButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  typeLink: { color: palette.muted, fontSize: 13, textDecorationLine: 'underline' },
  textButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 12 },
  link: { color: palette.muted, fontSize: 17 },
  transcriptGroup: { gap: 12, marginBottom: 24 },
  transcript: { minHeight: 96, textAlignVertical: 'top' },
  nameInput: { minHeight: 56, fontSize: 20, marginBottom: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 46, borderWidth: 1, borderColor: palette.line, backgroundColor: '#FFFFFF', borderRadius: 99, paddingVertical: 12, paddingHorizontal: 19, justifyContent: 'center' },
  chipSelected: { backgroundColor: palette.ink, borderColor: palette.ink },
  chipText: { color: palette.ink, fontSize: 16, fontWeight: '600' },
  chipTextSelected: { color: '#FFFFFF' },
  moreButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 8 },
  sectionTitle: { color: palette.ink, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  footer: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 28, paddingTop: 12, paddingBottom: 28 },
  continue: { minHeight: 62, borderRadius: 20, backgroundColor: palette.accent, padding: 18, alignItems: 'center', justifyContent: 'center' },
  continueDisabled: { backgroundColor: palette.disabled },
  continueText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  continueTextDisabled: { color: palette.muted },
  error: { color: colors.danger, marginVertical: 12 },
  pressed: { opacity: 0.7 },
});
