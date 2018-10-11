import $ from 'jquery';
import * as platform from 'platform';
import * as qr from 'qr-image';
import { crypto_box_easy,
         crypto_box_keypair,
         crypto_box_open_easy,
         crypto_box_seal_open,
         crypto_hash_sha256,
         equals,
         from_base64,
         randombytes_buf,
         to_base64,
         to_base64_url,
        } from './crypto';
import {parse, stringify } from './krjson';
import {createQueues, receive, send} from './krtransport';

import {get, set} from './storage';

import { Transform, Type } from 'class-transformer';
import { TransformationType } from 'class-transformer/TransformOperationExecutor';
import { crypto_box_NONCEBYTES, KeyPair } from 'libsodium-wrappers-sumo';
import textEncoding from 'text-encoding';
import { browser } from './browser';
import { MeRequest, Request } from './protocol';
import bytesToUuid from './uuid';

export const VERSION = '2.4.4';
const CIPHERTEXT = 0;
const WRAPPED_PUBLIC_KEY = 2;

export class Pairing {

    public static async loadOrGenerate(): Promise<Pairing> {
        return await get('pairing')
            .then((data) => {
                if (!!data) {
                    return data;
                }
                throw new Error('no pairing');
            })
            .then((pairingJson) => parse(Pairing, pairingJson))
            .then((pairing) => {
                if (!pairing.isPaired() && (Date.now() - pairing.creationTimestamp > 60 * 1000) ) {
                    console.warn('Keypair expired - generating a new one');
                    return Pairing.generateAndSave();
                }
                return pairing;
            })
            .catch((e) => {
                console.error('Failed to load pairing: ' + e);
                return Pairing.generateAndSave();
            });
    }

    public static async getDeviceIdentifier(): Promise<Uint8Array> {
        return get('workstationDeviceIdentifier')
            .then(async (d) => {
                if (!d) {
                    d = await to_base64(await randombytes_buf(16));
                    await set('workstationDeviceIdentifier', d);
                }
                return d;
            })
            .then(from_base64);
    }

    public static async generateAndSave(): Promise<Pairing> {
        const pairing = new Pairing();
        pairing.creationTimestamp = Date.now();
        pairing.version = VERSION;
        pairing.workstationDeviceIdentifier = await Pairing.getDeviceIdentifier();
        pairing.workstationName = platform.name + ' ' + platform.os.family;
        pairing.keyPair = await crypto_box_keypair();

        await pairing.save();
        createQueues(pairing);
        return pairing;
    }

    public static async deleteAndRegenerate(): Promise<Pairing> {
        return set('pairing', null).then((_) => {
            return Pairing.generateAndSave();
        });
    }
    @Transform((v) => {
        const ret: KeyPair = {
            keyType: v.keyType,
            privateKey: from_base64(v.privateKey),
            publicKey: from_base64(v.publicKey),
        };
        return ret;
    })
    public keyPair: KeyPair;

    @Transform((v) => from_base64(v))
    public workstationDeviceIdentifier: Uint8Array;

    public creationTimestamp: number;

    @Transform((v) => v && from_base64(v))
    public enclavePublicKey?: Uint8Array;
    public workstationName: string;
    public snsEndpointArn?: string;
    public trackingId?: string;
    @Transform((v) => v && from_base64(v))
    public enclaveDeviceIdentifier?: Uint8Array;
    public enclaveEmail?: string;
    public version: string;

    public u2fAccounts: string[] = [];

    //  Ignore serialized values
    @Transform((v) => 0)
    public pollUntil = 0;
    @Transform((v) => false)
    public polling = false;

    public async save() {
        return set('pairing', await stringify(this));
    }

    public toQR() {
        return new PairingQR(this.keyPair.publicKey,
                             this.workstationName,
                             this.version,
                             this.workstationDeviceIdentifier,
                            );
    }

    public async uuid() {
        const h = await crypto_hash_sha256(this.keyPair.publicKey);
        return bytesToUuid(h.slice(0, 16)).toUpperCase();
    }

    public isPaired(): boolean {
        return !!this.enclaveDeviceIdentifier;
    }

    public async sendQueueName() {
        return await this.uuid();
    }

    public async recvQueueName() {
        return await this.uuid() + '-responder';
    }

    public async recv(onMessage: Function) {
        const msgs = await receive(this);
        if (msgs.Messages && msgs.Messages.length > 0) {
            for (const msg of msgs.Messages) {
                try {
                    onMessage(
                        this,
                        from_base64(msg.Body),
                    );
                } catch (e) {
                    console.error(e);
                }
            }
        }
    }
    public async pollFor(ms: number, onMessage: Function) {
        this.pollUntil = Math.max(this.pollUntil, Date.now() + ms);
        if (this.polling) {
            return;
        }

        this.polling = true;
        try {
            while (Date.now() < this.pollUntil) {
                await this.recv(onMessage);
            }
        } catch (e) {
            console.error(e);
        }
        this.polling = false;
    }

    public async decrypt(c: Uint8Array) {
        if (c.length === 0) {
            throw new Error('0-length ciphertext');
        }
        const header = c[0];
        const body = c.slice(1);
        if (header === WRAPPED_PUBLIC_KEY) {
            if (this.enclaveDeviceIdentifier) {
                throw new Error('Already paired');
            }
            const unwrappedKey = await crypto_box_seal_open(body, this.keyPair.publicKey, this.keyPair.privateKey);
            if (!unwrappedKey) {
                throw new Error('Unwrap key failed');
            }
            if (this.enclavePublicKey && !equals(unwrappedKey, this.enclavePublicKey)) {
                throw new Error('Already sent confirmation for a different key');
            }

            this.enclavePublicKey = unwrappedKey;
            await this.save();

            const meRequest = await Request.make();
            meRequest.me_request = new MeRequest();
            meRequest.me_request.u2f_only = true;
            stringify(meRequest);
            this.encryptAndSend(stringify(meRequest));
            return null;
        } else if (header === CIPHERTEXT) {
            if (body.length < crypto_box_NONCEBYTES) {
                throw new Error('Ciphertext shorter than nonce');
            }
            if (!this.enclavePublicKey) {
                throw new Error('Not yet paired');
            }
            const plaintext = await crypto_box_open_easy(
                body.slice(crypto_box_NONCEBYTES),
                body.slice(0, crypto_box_NONCEBYTES),
                this.enclavePublicKey,
                this.keyPair.privateKey,
             );
            if (!plaintext) {
                 throw new Error('Decryption failed');
             }

            return new textEncoding.TextDecoder().decode(plaintext);
        }
        throw new Error('Invalid message header');
    }

    public async encryptAndSend(message: string) {
        if (!this.enclavePublicKey) {
            throw new Error('Not yet paired');
        }

        const nonce = await randombytes_buf(crypto_box_NONCEBYTES);
        const ciphertext = await crypto_box_easy(message, nonce,
            this.enclavePublicKey, this.keyPair.privateKey);
        const finalCiphertext = new Uint8Array([CIPHERTEXT, ...nonce, ...ciphertext]);
        return this.send(finalCiphertext);
    }

    public send(msg: Uint8Array) {
        const self = this;
        to_base64(msg).then((s) => send(self, s));
    }
}

export class PairingQR {
    @Transform((v) => from_base64(v))
    public pk: Uint8Array;
    public n: string;
    public v: string;
    @Transform((v) => from_base64(v))
    public d: Uint8Array;
    public b: string;
    constructor(pk: Uint8Array, n: string, v: string, d: Uint8Array) {
        this.pk = pk;
        this.n = n;
        this.v = v;
        this.d = d;
        this.b = browser();
    }
    public async render() {
        const payload = await stringify(this);
        const url = 'https://get.krypt.co/#' + await to_base64_url(payload);
        return qr.imageSync(url, { type: 'svg', ec_level: 'L' });
    }
}
