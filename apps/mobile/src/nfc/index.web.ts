// No NFC on web: the connect screen falls back to typing the code.

export async function nfcAvailable(): Promise<boolean> {
  return false;
}

export async function writeConnectTag(_url: string): Promise<void> {
  throw new Error('NFC is not available on web');
}

export async function readConnectCode(): Promise<string | null> {
  throw new Error('NFC is not available on web');
}

export function cancelNfc(): void {}
