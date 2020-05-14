import * as CBOR from 'cbor';
import { crypto_hash_sha256, from_base64_url_nopad } from './crypto';
import { KRYPTON_U2F_MAGIC } from './protocol';
import { counterToBytes } from './u2f';

const KRYPTON_AAGUID = KRYPTON_U2F_MAGIC.slice(0, 16);
const ZERO_AAGUID = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

export async function createAuthenticatorDataWithoutAttestation(rpId: string, counter: number): Promise<Uint8Array> {
    const rpIdHash = await crypto_hash_sha256(rpId);

    const authenticatorData = new Uint8Array(rpIdHash.length + 1 + 4);
    authenticatorData.set(rpIdHash, 0);
    // user-presence flag
    authenticatorData[rpIdHash.length] = 1;
    // counter
    authenticatorData.set(counterToBytes(counter), rpIdHash.length + 1);
    return authenticatorData;
}
export async function createAuthenticatorDataWithAttestation(
                                                                rpId: string,
                                                                counter: number,
                                                                credId: Uint8Array,
                                                                publicKey: Uint8Array,
                                                            ): Promise<Uint8Array> {
    const withoutAttestation = await createAuthenticatorDataWithoutAttestation(rpId, counter);

    const aaguid = ZERO_AAGUID;

    const credIdLen = new Uint8Array(2);
    credIdLen[0] = (credId.length >> 8) & 0xff;
    credIdLen[1] = credId.length & 0xff;

    const attData = new Map();
    attData.set(1, 2);
    attData.set(3, -7);
    attData.set(-1, 1);
    attData.set(-2, new Buffer(publicKey.slice(1, 33).buffer));    // x-coord
    attData.set(-3, new Buffer(publicKey.slice(33, 65).buffer));    // y-coord
    const attCBOR = new Uint8Array(CBOR.encodeCanonical(attData));

    const authenticatorData = new Uint8Array(   withoutAttestation.length
                                                + aaguid.length
                                                + credIdLen.byteLength
                                                + credId.length + attCBOR.byteLength);
    let offset = 0;

    authenticatorData.set(withoutAttestation, offset);
    offset += withoutAttestation.length;

    authenticatorData.set(aaguid, offset);
    offset += aaguid.length;

    authenticatorData.set(credIdLen, offset);
    offset += credIdLen.byteLength;

    authenticatorData.set(credId, offset);
    offset += credId.length;

    authenticatorData.set(attCBOR, offset);
    offset += attCBOR.length;

    // add attestation to flags
    authenticatorData[32] |= (1 << 6);

    return authenticatorData;
}
