import EnclaveClient from './enclave_client';
import { Pairing } from './krpairing';
import { U2FAuthenticateResponse, U2FRegisterResponse } from './protocol';

export let client: Promise<EnclaveClient>;
if ((window as any).krClient) {
    client = (window as any).krClient;
} else {
    (window as any).krClient = client = new Promise<EnclaveClient>((resolve, reject) => {
        Pairing.loadOrGenerate().then((p) => {
            resolve(new EnclaveClient(p));
        });
    });
}

export function counterToBytes(c: number): Uint8Array {
    const bytes = new Uint8Array(4);
    // Sadly, JS TypedArrays are whatever-endian the platform is,
    // so Uint32Array is not at all useful here (or anywhere?),
    // and we must manually pack the counter (big endian as per spec).
    bytes[0] = 0xFF & c >>> 24;
    bytes[1] = 0xFF & c >>> 16;
    bytes[2] = 0xFF & c >>> 8;
    bytes[3] = 0xFF & c;
    return bytes;
}

export function addPresenceAndCounter(r: U2FAuthenticateResponse | U2FRegisterResponse): Uint8Array {
    const userPresenceAndCounter = new Uint8Array(1 + 4);
    userPresenceAndCounter[0] = 0x01;  // user presence
    userPresenceAndCounter.set(counterToBytes(r.counter), 1);
    const signatureData = new Uint8Array(1 + 4 + r.signature.length);
    signatureData.set(userPresenceAndCounter, 0);
    signatureData.set(r.signature, 5);
    return signatureData;
}

export function makeRegisterData(r: U2FRegisterResponse) {
    const regData = new Uint8Array(1 + 65 + 1 +
        r.key_handle.length + r.attestation_certificate.length + r.signature.length);

    let offset = 0;
    regData[offset++] = 0x05;
    regData.set(r.public_key, offset);
    offset += r.public_key.length;
    regData[offset++] = r.key_handle.length;
    regData.set(r.key_handle, offset);
    offset += r.key_handle.length;
    regData.set(r.attestation_certificate, offset);
    offset += r.attestation_certificate.length;
    regData.set(r.signature, offset);
    return regData;
}
