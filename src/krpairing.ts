import * as qr from 'qr-image';
import * as platform from 'platform';
import {stringify, parse } from './krjson';
import { from_base64, to_base64, randombytes_buf, crypto_box_keypair, crypto_hash_sha256, crypto_box_seal_open, crypto_box_open_easy, crypto_box_easy, to_base64_url} from './crypto';
import {receive, send, createQueues} from './krtransport';
import $ from 'jquery';

import {get, set} from './storage';

import bytesToUuid from './uuid';
import { crypto_box_NONCEBYTES, KeyPair } from 'libsodium-wrappers-sumo';
import { Type, Transform } from 'class-transformer';
import { TransformationType } from 'class-transformer/TransformOperationExecutor';
import textEncoding from 'text-encoding';
import { Request, MeRequest } from './protocol';
import { browser } from './browser';

export const VERSION = "2.4.4";
const CIPHERTEXT = 0;
const WRAPPED_PUBLIC_KEY = 2;

export class Pairing {
	@Transform(v => {
		let ret: KeyPair = {
			keyType: v.keyType,
			privateKey: from_base64(v.privateKey),
			publicKey: from_base64(v.publicKey),
		};
		return ret;
	})
	keyPair: KeyPair;

	@Transform(v => from_base64(v))
	workstationDeviceIdentifier: Uint8Array;

	creationTimestamp: number;

	@Transform(v => v && from_base64(v))
	enclavePublicKey?: Uint8Array;
	workstationName: string;
	snsEndpointArn?: string;
	trackingId?: string;
	@Transform(v => v && from_base64(v))
	enclaveDeviceIdentifier?: Uint8Array;
	enclaveEmail?: string;
	version: string;

	u2fAccounts: Array<string> = [];

	static async loadOrGenerate() : Promise<Pairing> {
		return await get('pairing')
			.then(data => {
				if (!!data) {
					return data;
				}
				throw 'no pairing';
			})
			.then(pairingJson => parse(Pairing, pairingJson))
			.then(pairing => {
				if (!pairing.isPaired() && (Date.now() - pairing.creationTimestamp > 60*1000) ) {
					console.log("Keypair expired - generating a new one");
					return Pairing.generateAndSave();
				}
				return pairing;
			})
			.catch(e => {
				console.info('Failed to load pairing: ' + e);
				return Pairing.generateAndSave();
			});
	}

	static async getDeviceIdentifier() : Promise<Uint8Array> {
		return get('workstationDeviceIdentifier')
			.then(async d => {
				if (!d) {
					d = await to_base64(await randombytes_buf(16));
					await set('workstationDeviceIdentifier', d);
				}
				return d;
			})
			.then(from_base64);
	}

	static async generateAndSave() : Promise<Pairing> {
		let pairing = new Pairing();
		pairing.creationTimestamp = Date.now();
		pairing.version = VERSION;
		pairing.workstationDeviceIdentifier = await Pairing.getDeviceIdentifier();
		pairing.workstationName = platform.name + " " + platform.os.family;
		pairing.keyPair = await crypto_box_keypair();

		await pairing.save();
		createQueues(pairing);
		return pairing;
	}

	static async deleteAndRegenerate() : Promise<Pairing> {
		return set('pairing', null).then(_ => {
			return Pairing.generateAndSave()
		});
	}

	async save() {
		return set('pairing', await stringify(this));
	}

	toQR() {
		return new PairingQR(this.keyPair.publicKey, this.workstationName, this.version, this.workstationDeviceIdentifier);
	}

	async uuid() {
		let h = await crypto_hash_sha256(this.keyPair.publicKey);
		return bytesToUuid(h.slice(0, 16)).toUpperCase();
	}
	
	isPaired() : boolean {
		return !!this.enclaveDeviceIdentifier;
	}

	async sendQueueName() {
		return await this.uuid();
	}

	async recvQueueName() {
		return await this.uuid() + '-responder';
	}

	async recv(onMessage: Function) {
		let msgs = await receive(this);
		if (msgs.Messages && msgs.Messages.length > 0) {
			for (var i = 0; i < msgs.Messages.length; i++) {
				onMessage(
					this,
					from_base64(msgs.Messages[i].Body)
				)
			}
		}
	}

	//  Ignore serialized values
	@Transform(v => 0)
	pollUntil = 0;
	@Transform(v => false)
	polling = false;
	async pollFor(ms: number, onMessage: Function) {
		this.pollUntil = Math.max(this.pollUntil, Date.now() + ms);
        if (this.polling) {
            return;
        }

		this.polling = true;
		while (Date.now() < this.pollUntil) {
			await this.recv(onMessage);
        }	
        this.polling = false;
	}

	async decrypt(c: Uint8Array) {
		if (c.length == 0) {
			throw new Error('0-length ciphertext');
		}
		let header = c[0];
		let body = c.slice(1);
		if (header == WRAPPED_PUBLIC_KEY) {
			if (this.enclaveDeviceIdentifier) {
				throw new Error('Already paired');
			}
			let unwrappedKey = await crypto_box_seal_open(body, this.keyPair.publicKey, this.keyPair.privateKey);
			if (!unwrappedKey) {
				throw new Error('Unwrap key failed');
			}
			if (this.enclavePublicKey && unwrappedKey != this.enclavePublicKey) {
				throw new Error('Already sent confirmation for a different key');
			}

			this.enclavePublicKey = unwrappedKey;
			await this.save();

			let meRequest = await Request.make();
			meRequest.me_request = new MeRequest();
			meRequest.me_request.u2f_only = true;
			stringify(meRequest)
			this.encryptAndSend(stringify(meRequest));
			return null;
		} else if (header == CIPHERTEXT) {
			if (body.length < crypto_box_NONCEBYTES) {
				throw new Error('Ciphertext shorter than nonce');
			}
			if (!this.enclavePublicKey) {
				throw 'Not yet paired';
			}
			let plaintext = await crypto_box_open_easy(
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

	async encryptAndSend(message: string) {
		if (!this.enclavePublicKey) {
			throw 'Not yet paired';
		}

		let nonce = await randombytes_buf(crypto_box_NONCEBYTES);
		let ciphertext = await crypto_box_easy(message, nonce, 
			this.enclavePublicKey, this.keyPair.privateKey);
		let finalCiphertext = new Uint8Array([CIPHERTEXT, ...nonce, ...ciphertext]);
		return this.send(finalCiphertext);
	}

	send(msg: Uint8Array) {
		let self = this;
		to_base64(msg).then(s => send(self, s));
	}
}

export class PairingQR {
	@Transform(v => from_base64(v))
	pk: Uint8Array;
	n: string;
	v: string;
	@Transform(v => from_base64(v))
	d: Uint8Array;
	b: string;
	constructor(pk: Uint8Array, n: string, v: string, d: Uint8Array) {
		this.pk = pk;
		this.n = n;
		this.v = v;
		this.d = d;
		this.b = browser();
	}
	async render() {
		let payload = await stringify(this);
		let url = 'https://get.krypt.co/#' + await to_base64_url(payload);
		return qr.imageSync(url, { type: 'svg', ec_level: 'L' });
	}
}
