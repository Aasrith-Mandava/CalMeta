import { parseConnectUrl } from '@200h/shared';
import NfcManager, { Ndef, NfcTech } from 'react-native-nfc-manager';

// NFC profile exchange. Needs a development build on a real phone
// (`npx expo run:ios` / `run:android`); Expo Go and simulators have no NFC.
//
// What works where:
//   • Reading tags: iPhone 7+ and most Android phones.
//   • Writing tags (NFC stickers/cards): iPhone and Android.
//   • A phone acting *as* a tag (true phone-to-phone): Android only, via host card
//     emulation. Not wired up yet; see docs/ARCHITECTURE.md.
//
// A tag only ever carries a short-lived connect URL, never profile data.

let ready: Promise<boolean> | undefined;

/** False in Expo Go, simulators, and phones without NFC; callers fall back to typing the code. */
export function nfcAvailable(): Promise<boolean> {
  ready ??= (async () => {
    try {
      if (!(await NfcManager.isSupported())) return false;
      await NfcManager.start();
      return true;
    } catch {
      return false;
    }
  })();
  return ready;
}

/** Write a connect URL to the tag held against the phone. */
export async function writeConnectTag(url: string): Promise<void> {
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef, { alertMessage: 'Hold your phone near the NFC tag' });
    await NfcManager.ndefHandler.writeNdefMessage(Ndef.encodeMessage([Ndef.uriRecord(url)]));
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

/** Scan a tag and return its connect code, or null if it isn't a 200 Hours tag. */
export async function readConnectCode(): Promise<string | null> {
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef, { alertMessage: 'Hold your phone near their tag' });
    const tag = await NfcManager.getTag();
    for (const record of tag?.ndefMessage ?? []) {
      const code = parseConnectUrl(Ndef.uri.decodePayload(Uint8Array.from(record.payload)));
      if (code) return code;
    }
    return null;
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export function cancelNfc(): void {
  NfcManager.cancelTechnologyRequest().catch(() => {});
}
