import { parseConnectUrl } from '@200h/shared';

// Load the native library only when probing support. Importing the connect screen
// must remain safe in Expo Go, which does not include this native module.
type NfcLibrary = typeof import('react-native-nfc-manager');
let library: NfcLibrary | undefined;
let ready: Promise<boolean> | undefined;
export function nfcAvailable(): Promise<boolean> {
  ready ??= (async () => {
    try {
      library = await import('react-native-nfc-manager');
      if (!(await library.default.isSupported())) return false;
      await library.default.start();
      return true;
    } catch { return false; }
  })();
  return ready;
}
async function requireNfc(): Promise<NfcLibrary> {
  if (!(await nfcAvailable()) || !library) throw new Error('NFC is unavailable. Use the invitation code instead.');
  if (!(await library.default.isEnabled())) throw new Error('Turn on NFC in Settings, then try again.');
  return library;
}
export async function writeConnectTag(url: string): Promise<void> {
  if (!parseConnectUrl(url)) throw new Error('Invalid invitation URL');
  const { default: manager, Ndef, NfcTech } = await requireNfc();
  try {
    await manager.requestTechnology(NfcTech.Ndef, { alertMessage: 'Hold your phone near the invitation card or sticker' });
    const encoded = Ndef.encodeMessage([Ndef.uriRecord(url)]);
    if (!encoded) throw new Error('Could not encode this invitation');
    await manager.ndefHandler.writeNdefMessage(encoded);
  } finally { await manager.cancelTechnologyRequest().catch(() => {}); }
}
export async function readConnectCode(): Promise<string | null> {
  const { default: manager, Ndef, NfcTech } = await requireNfc();
  try {
    await manager.requestTechnology(NfcTech.Ndef, { alertMessage: 'Hold your phone near the invitation tag' });
    const tag = await manager.getTag();
    for (const record of tag?.ndefMessage ?? []) {
      const isUri = record.tnf === Ndef.TNF_WELL_KNOWN && (typeof record.type === 'string' ? record.type === 'U' : record.type.length === 1 && record.type[0] === 0x55);
      if (!isUri) continue;
      try {
        const code = parseConnectUrl(Ndef.uri.decodePayload(Uint8Array.from(record.payload)));
        if (code) return code;
      } catch { /* A malformed record must not prevent scanning the next record. */ }
    }
    return null;
  } finally { await manager.cancelTechnologyRequest().catch(() => {}); }
}
export function cancelNfc(): void { library?.default.cancelTechnologyRequest().catch(() => {}); }
