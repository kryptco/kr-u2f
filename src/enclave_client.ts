import { Pairing } from "./krpairing";
import { parse } from "./krjson";
import { Request, Response, U2FRegisterRequest, U2FAuthenticateRequest, KRYPTON_U2F_MAGIC, UnpairRequest } from "./protocol";
import { stringify } from "./krjson";
import * as Messages from './messages';
import { equals, crypto_hash_sha256 } from "./crypto";
import { appIdToShortName } from "./known_app_ids";

export default class EnclaveClient {
    pairing: Pairing;
    pendingRequest: {[requestId: string]: Function} = {};

    onChange: Function;

    constructor(pairing: Pairing, onChange?: Function) {
        this.pairing = pairing;
        this.onChange = onChange;
    }

    async onMessage(pairing: Pairing, ciphertext: Uint8Array) {
        this.pairing.decrypt(ciphertext).then(ptxt => {
            return ptxt && parse(Response, ptxt);
        }).then(async r => {
            if (!r) {
                return;
            }
            if(r.sns_endpoint_arn != this.pairing.snsEndpointArn || r.tracking_id != this.pairing.trackingId) {
                this.pairing.snsEndpointArn = r.sns_endpoint_arn;
                this.pairing.trackingId = r.tracking_id;
                await this.pairing.save();
            }
            if (r.me_response && r.me_response.me) {
                if (!r.me_response.me.device_identifier) {
                    throw 'krypton out of date';
                }
                if (r.me_response.me.device_identifier != this.pairing.enclaveDeviceIdentifier
                    || r.me_response.me.email != this.pairing.enclaveEmail
                    || JSON.stringify(r.me_response.me.u2f_accounts) != JSON.stringify(this.pairing.u2fAccounts)) {
                    this.pairing.enclaveDeviceIdentifier = r.me_response.me.device_identifier;
                    this.pairing.enclaveEmail = r.me_response.me.email;
                    this.pairing.u2fAccounts = r.me_response.me.u2f_accounts;
                    await this.pairing.save();
                }
                if (this.onChange) {
                    this.onChange();
                }
            }
            if (r.unpair_response) {
                await this.unpair(false);
                return
            }
            let pendingRequest = this.pendingRequest[r.request_id];
            if (pendingRequest) {
                pendingRequest(r);
            }
        }).catch(e => {
            console.error('onMessage: ' + e.toString());
        });
    }

    async refreshPopup() {
        await Pairing.loadOrGenerate();
    }

    async unpair(sendUnpairRequest: boolean) {
        if (sendUnpairRequest) {
            let request = await Request.make();
            request.unpair_request = new UnpairRequest();
            let msg = await stringify(request);
            await this.pairing.encryptAndSend(msg);
        }
        this.pairing = await Pairing.deleteAndRegenerate();
        if (this.onChange) {
            this.onChange();
        }
    }

    async enrollU2f(r: U2FRegisterRequest) : Promise<Response> {
        let request = await Request.make();
        request.u2f_register_request = r;
        return this.genericRequest(request).then(response => {
            if (response.u2f_register_response && response.u2f_register_response.signature) {
                //  record successful registration for popup UI
                let shortName = appIdToShortName(r.app_id);
                if (shortName) {
                    if (!this.pairing.u2fAccounts) {
                        this.pairing.u2fAccounts = [];
                    }
                    if (this.pairing.u2fAccounts.indexOf(shortName) < 0) {
                        this.pairing.u2fAccounts.push(shortName);
                        this.pairing.save();
                    }
                }
            }
            return response;
        });
    }


    async signU2f(r: U2FAuthenticateRequest) : Promise<Response> {
        if (!this.pairing.enclaveDeviceIdentifier) {
            throw 'Not yet paired';
        }
        let request = await Request.make();
        request.u2f_authenticate_request = r;
        return this.genericRequest(request);
    }

    // KeyHandle: 80 bytes
    // M + R + H(H(D) + H(S) + H(R))
    // where
    // M = [16 Magic Bytes]
    // R = [32 bytes of random]
    // S = appId or rpId
    // D = device_identifier
    // H = SHA-256
    async mapKeyHandleToMatchingAppId(keyHandle: Uint8Array, service: { appId?: string, rpId?: string}): 
        Promise<string | null> {
        if (!await equals(
            keyHandle.slice(0, KRYPTON_U2F_MAGIC.length),
            KRYPTON_U2F_MAGIC,
        )) {
            console.log('wrong magic');
            return null;
        }
        if (!this.pairing.enclaveDeviceIdentifier) {
            console.log('not paired');
            return null;
        }
        let random = keyHandle.slice(KRYPTON_U2F_MAGIC.length, KRYPTON_U2F_MAGIC.length + 32);
        let hash = keyHandle.slice(KRYPTON_U2F_MAGIC.length + 32, KRYPTON_U2F_MAGIC.length + 32 + 32);
        if (random.length != 32 || hash.length != 32) {
            console.log('missing random + hash');
            return null;
        }

        //  check whether appId or rpId matches
        let innerHash = new Uint8Array(32 * 3);
        innerHash.set(await crypto_hash_sha256(this.pairing.enclaveDeviceIdentifier), 0);
        innerHash.set(await crypto_hash_sha256(random), 64);

        async function tryAppId(appId?: string) : Promise<boolean> {
            if (!appId) {
                return false;
            }
            innerHash.set(await crypto_hash_sha256(appId), 32);
            return await equals(hash, await crypto_hash_sha256(innerHash));
        }

        if (await tryAppId(service.rpId)) {
            return service.rpId;
        }

        if (await tryAppId(service.appId)) {
            return service.appId;
        }

        console.log('wrong device');
        return null;
    }

    async genericRequest(r: Request): Promise<Response> {
        let self = this;
        let promise = new Promise<Response>((resolve, reject) => {
            setTimeout(function () {
                delete self.pendingRequest[r.request_id];
                reject('Request ' + r.request_id + ' timed out');
            }, 30 * 1000);
            self.pendingRequest[r.request_id] = resolve;
        });

        let msg = await stringify(r);
        await this.pairing.encryptAndSend(msg);

        (async () => { await this.pollFor(30 * 1000) })();
        return promise;
    }

    async pollFor(ms: number) {
        return this.pairing.pollFor(ms, this.onMessage.bind(this));
    }

    getState() {
        let response = new Messages.Response();
        if (this.pairing) {
            if (this.pairing.enclaveEmail) {
                response.phoneName = this.pairing.enclaveEmail;
            }
            if (this.pairing.isPaired()) {
                response.paired = true;
                response.u2fAccounts = this.pairing.u2fAccounts;
            } else {
                response.paired = false;
                response.qr = this.pairing.toQR();
            }
            this.pollFor(30 * 1000);
        } else {
            response.paired = false;
        }
        let r = Messages.Message.newResponse(response);
        return r;
    }
}
