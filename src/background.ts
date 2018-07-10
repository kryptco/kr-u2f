import { Message, RequestType, Toast } from './messages';
import Client from './enclave_client';
import { stringify, parse, webauthnParse, webauthnStringify } from './krjson';
import * as protocol from './protocol';
import {to_base64_url_nopad, from_base64_url_nopad, crypto_hash_sha256} from './crypto';

import {createAuthenticatorDataWithAttestation, createAuthenticatorDataWithoutAttestation} from './webauthn';
import * as CBOR from 'cbor';
import { client, makeRegisterData, addPresenceAndCounter } from './u2f';


import {getOriginFromUrl, getDomainFromOrigin} from './url';
import {getU2fVerifiedAppId, checkIsRegistrableDomainSuffix} from './origin-checker';

chrome.runtime.onMessage.addListener(async (msg, sender) => {
    if (msg.type) {
        console.debug(msg);
        if (msg.type == 'u2f_register_request') {
            handle_u2f_register(msg, sender);
            return;
        }
        if (msg.type == 'webauthn_register_request') {
            handle_webauthn_register(msg, sender);
            return;
        }
        if (msg.type == 'u2f_sign_request') {
            handle_u2f_sign(msg, sender).catch(console.error);
            return;
        }
        if (msg.type == 'webauthn_sign_request') {
            handle_webauthn_sign(msg, sender).catch(console.error);
            return;
        }
    }
    let m = await parse(Message, msg);
    let c = await client;
    if (m.request) {
        switch (m.request.ty) {
            case RequestType.getPaired: {
                if (sender.tab) {
                    chrome.tabs.sendMessage(
                        sender.tab.id,
                        await stringify({response: {paired: c.pairing.isPaired()}}),
                    );
                }
            }
            case RequestType.getState: {
                sendFullStateToPopup(c);
                break;
            }
            case RequestType.refreshPopup: {
                await c.refreshPopup();
                break;
            }
            case RequestType.unpair: {
                await c.unpair(true);
                sendFullStateToPopup(c);
                break;
            }
        }
    }
});

async function handle_webauthn_register(msg: any, sender: chrome.runtime.MessageSender | browser.runtime.MessageSender) {
    let c = await client;

    let options : CredentialCreationOptions = webauthnParse(msg.options);
    let pkOptions = options.publicKey;

    let origin = getOriginFromUrl(sender.url);
    if(pkOptions.rp.id && !checkIsRegistrableDomainSuffix(origin, pkOptions.rp.id)) {
        throw "SecurityError";
    }
    let rpId = pkOptions.rp.id || getDomainFromOrigin(origin);
    if (pkOptions.excludeCredentials) {
        for (var i = 0; i < pkOptions.excludeCredentials.length; i++) {
            if (await c.mapKeyHandleToMatchingAppId(new Uint8Array(<ArrayBuffer>pkOptions.excludeCredentials[i].id), {rpId})) {
                let webauthnRegisterResponse = {
                    type: 'webauthn_register_response',
                    data: {
                        requestId: msg.requestId,
                        fallback: true,
                    },
                }

                sendIfTabActive(sender.tab.id, webauthnRegisterResponse);
                return;
            }
        }
    }

    let foundNistKeyType = false;
    if (pkOptions.pubKeyCredParams) {
        for (var i = 0; i < pkOptions.pubKeyCredParams.length; i++) {
            let params = pkOptions.pubKeyCredParams[i];
            if (params.alg == -7 && params.type == 'public-key') {
                foundNistKeyType = true;
                break;
            }
        }
        if (!foundNistKeyType) {
            throw "only nistp256 keys supported";
        }
    }

    let clientData = JSON.stringify({
        type: 'webauthn.create',
        challenge: await to_base64_url_nopad(new Uint8Array(<any>pkOptions.challenge)),
        origin,
        tokenBinding: {
            "status": "not-supported"
        },
        clientExtensions: {},
        hashAlgorithm: "SHA-256",
    });
    let clientDataB64 = await to_base64_url_nopad(clientData);

    let challenge = await crypto_hash_sha256(clientData);

    let response = await c.enrollU2f({
        challenge,
        app_id: rpId,
    });
    if (!response.u2f_register_response) {
        throw 'no u2f_register_response';
    }

    let u2fRegisterResponse = response.u2f_register_response;

    let authenticatorData = await createAuthenticatorDataWithAttestation(rpId, u2fRegisterResponse.counter, u2fRegisterResponse.key_handle, u2fRegisterResponse.public_key);

    let attestationObject: ArrayBuffer;
    if (pkOptions.attestation == null || pkOptions.attestation == 'none') {
        attestationObject = CBOR.encode({
            fmt: 'none',
            attStmt: {},
            authData: new Buffer(authenticatorData.buffer),
        }).buffer;
    } else {
        attestationObject = CBOR.encode({
            fmt: 'fido-u2f',
            attStmt: {
                sig: new Buffer(u2fRegisterResponse.signature.slice(5).buffer),
                x5c: [new Buffer(u2fRegisterResponse.attestation_certificate.buffer)],
            },
            authData: new Buffer(authenticatorData.buffer),
        }).buffer;
    }

    let credential: Credential = {
        id: await to_base64_url_nopad(u2fRegisterResponse.key_handle),
        type: 'public-key',
        rawId: u2fRegisterResponse.key_handle.buffer,
        response: {
            clientDataJSON: (await from_base64_url_nopad(clientDataB64)).buffer,
            attestationObject,
        },
    };
    let webauthnRegisterResponse = {
        type: 'webauthn_register_response',
        data: {
            requestId: msg.requestId,
            credential: webauthnStringify(credential),
        },
    }

    sendIfTabActive(sender.tab.id, webauthnRegisterResponse);
}

async function handle_u2f_register(msg: any, sender: chrome.runtime.MessageSender | browser.runtime.MessageSender) {
    let verifiedAppId = await getU2fVerifiedAppId(msg.origin, msg.appId);
    //If that didn't throw an error, then the validation was successful
    msg.appId = verifiedAppId;

    let c = await client;
    
    function send_fallback() {
        let u2fRegisterResponse = {
            type: 'u2f_register_response',
            data: {
                requestId: msg.requestId,
                responseData: {
                    fallback: true,
                },
            },
        };
        sendIfTabActive(sender.tab.id, u2fRegisterResponse);
    }

    if (!c.pairing.isPaired()) {
        send_fallback();
        return;
    }

    let origin = getOriginFromUrl(sender.url);

    let appId = msg.appId
        || ((msg.registerRequests && msg.registerRequests.length > 0) ? msg.registerRequests[0].appId : null)
        || origin;
    if (msg.registeredKeys) {
        for (var i = 0; i < msg.registeredKeys.length; i++) {
            try {
            let keyHandle = await from_base64_url_nopad(msg.registeredKeys[i].keyHandle);
                if (await c.mapKeyHandleToMatchingAppId(keyHandle, {appId})) {
                    //  already registered
                    send_fallback();
                    return;
                }
            } catch (e) { 
                console.log(e);
            }
        }
    }

    let serverChallenge : string;
    let clientData : string;
    
    //  TODO: detect U2F_V2/V1 requests
    serverChallenge = msg.registerRequests[0].challenge;
    clientData = JSON.stringify({
        typ: 'navigator.id.finishEnrollment',
        challenge: serverChallenge,
        origin,
        cid_pubkey: 'unused',
    });

    let challenge = await crypto_hash_sha256(clientData);

    let response = await c.enrollU2f({
        challenge,
        app_id: appId,
    });
    if (!response.u2f_register_response) {
        throw 'no u2f_register_response';
    }

    let u2fRegisterResponse = {
        type: 'u2f_register_response',
        data: {
            requestId: msg.requestId,
            responseData: {
                keyHandle: await to_base64_url_nopad(response.u2f_register_response.key_handle),
                clientData: await to_base64_url_nopad(clientData),
                registrationData: await to_base64_url_nopad(makeRegisterData(response.u2f_register_response)),
                version: "U2F_V2",
            },
        },
    };
    sendIfTabActive(sender.tab.id, u2fRegisterResponse);
}

async function handle_webauthn_sign(msg: any, sender: chrome.runtime.MessageSender) {
    let c = await client;

    let pkOptions = webauthnParse(msg.options).publicKey;

    let origin = getOriginFromUrl(sender.url);

    let keyHandle: Uint8Array;
    let matchingAppId: string;
    {
        let appId: string;
        if (pkOptions.extensions && pkOptions.extensions.appid) {
            appId = await getU2fVerifiedAppId(origin ,pkOptions.extensions.appid);
        }
        if(pkOptions.rpId && !checkIsRegistrableDomainSuffix(origin, pkOptions.rpId)) {
            throw "SecurityError";
        }
        let rpId : string = pkOptions.rpId || getDomainFromOrigin(origin);

        for (var i = 0; i < pkOptions.allowCredentials.length; i++) {
            let id = pkOptions.allowCredentials[i].id;
            matchingAppId = await c.mapKeyHandleToMatchingAppId(id, { appId, rpId });
            if (matchingAppId) {
                keyHandle = id;
                break;
            }
        }
    }
    if (!keyHandle) {
        let webauthnSignResponse = {
            type: 'webauthn_sign_response',
            data: {
                requestId: msg.requestId,
                fallback: true,
            },
        }

        sendIfTabActive(sender.tab.id, webauthnSignResponse);
        return;
    }

    let clientData = JSON.stringify({
        type: 'webauthn.get',
        challenge: await to_base64_url_nopad(pkOptions.challenge),
        origin: origin,
        clientExtensions: pkOptions.extensions,
        hashAlgorithm: "SHA-256",
    });
    let clientDataB64 = await to_base64_url_nopad(clientData);

    let challenge = await crypto_hash_sha256(clientData);

    let response: protocol.Response = await c.signU2f({
        challenge,
        app_id: matchingAppId,
        key_handle: keyHandle,
    });
    if (!response.u2f_authenticate_response) {
        throw 'no u2f_authenticate_response';
    }

    let u2fSignResponse = response.u2f_authenticate_response;

    let authenticatorData = await createAuthenticatorDataWithoutAttestation(matchingAppId, u2fSignResponse.counter);

    let credential: Credential = {
        id: await to_base64_url_nopad(keyHandle),
        type: 'public-key',
        rawId: keyHandle.buffer,
        response: {
            clientDataJSON: (await from_base64_url_nopad(clientDataB64)).buffer,
            authenticatorData: authenticatorData.buffer,
            signature: u2fSignResponse.signature.buffer,
            userHandle: new ArrayBuffer(0),
        },
    };
    
    let webauthnSignResponse = {
        type: 'webauthn_sign_response',
        data: {
            requestId: msg.requestId,
            credential: webauthnStringify(credential),
        },
    }

    sendIfTabActive(sender.tab.id, webauthnSignResponse);
}

async function handle_u2f_sign(msg: any, sender: chrome.runtime.MessageSender) {
    let verifiedAppId = await getU2fVerifiedAppId(msg.origin, msg.appId);
    //If that didn't throw an error, then the validation was successful
    msg.appId = verifiedAppId;

    let c = await client;
    if (msg.signRequests && !msg.registeredKeys) {
        if (msg.signRequests.length == 0) {
            let u2fSignResponse = {
                type: 'u2f_sign_response',
                data: {
                    requestId: msg.requestId,
                    responseData: {},
                },
            };
            sendIfTabActive(sender.tab.id, u2fSignResponse);
            return;
        }
        let registeredKeys = [];
        for (var i = 0; i < msg.signRequests.length; i++) {
            let signRequest = msg.signRequests[i];
            registeredKeys.push({
                keyHandle: signRequest.keyHandle,
                challenge: signRequest.challenge,
                appId: signRequest.appId,
            });
        }
        msg.registeredKeys = registeredKeys;
    }
    let matchingAppId;
    let keyHandle;
    let serverChallenge;
    {
        for (var i = 0; i < msg.registeredKeys.length; i++) {
            let keyHandleBytes = await from_base64_url_nopad(msg.registeredKeys[i].keyHandle);
            let potentialAppId: string = msg.registeredKeys[i].appId || msg.appId;
            let appId = await c.mapKeyHandleToMatchingAppId(keyHandleBytes, {appId: potentialAppId});
            if (appId) {
                keyHandle = keyHandleBytes;
                serverChallenge = msg.registeredKeys[i].challenge || msg.challenge;
                matchingAppId = appId;
                break;
            }
        }
    }
    if (!keyHandle) {
        let u2fSignResponse = {
            type: 'u2f_sign_response',
            data: {
                requestId: msg.requestId,
                responseData: {
                    fallback: true,
                },
            },
        };
        sendIfTabActive(sender.tab.id, u2fSignResponse);
        return;
    }

    let clientData = JSON.stringify({
        typ: 'navigator.id.getAssertion',
        challenge: serverChallenge,
        origin: getOriginFromUrl(sender.url),
        cid_pubkey: 'unused',
    });

    let challenge = await crypto_hash_sha256(clientData);

    let response = await c.signU2f({
        challenge,
        app_id: matchingAppId,
        key_handle: keyHandle,
    });
    if (!response.u2f_authenticate_response) {
        throw 'no u2f_authenticate_response';
    }
    let signatureData = await to_base64_url_nopad(
        addPresenceAndCounter(response.u2f_authenticate_response)
    );
    let u2fSignResponse = {
        type: 'u2f_sign_response',
        data: {
            requestId: msg.requestId,
            responseData: {
                keyHandle: await to_base64_url_nopad(keyHandle),
                signatureData,
                clientData: await to_base64_url_nopad(clientData),
                version: "U2F_V2",
            },
        },
    };
    sendIfTabActive(sender.tab.id, u2fSignResponse);
}

function sendStates(c: Client) {
    sendFullStateToPopup(c);
    sendPairStatusToTabs(c);
}

function sendPairStatusToTabs(c: Client) {
    chrome.tabs.query({}, async tabs => {
        for (var i = 0; i < tabs.length; i++) {
            chrome.tabs.sendMessage(tabs[i].id, await stringify({ response: { paired: c.pairing.isPaired() } }));
        }
    });
}

function sendFullStateToPopup(c: Client) {
    let r = c.getState();
    chrome.runtime.sendMessage(stringify(r));
}

function sendPending(s: string) {
    let t = new Toast();
    t.pending = s;
    let m = Message.newToast(t);
    sendMessageToActiveTab(m);
}

async function sendMessageToActiveTab(m: Message) {
    sendToActiveTab(await stringify(m));
}

async function sendIfTabActive(tabId: number, o: Object) {
    chrome.tabs.query({ active: true, currentWindow: true }, async function (tabs) {
        if (tabs[0]) {
            if (tabs[0].id == tabId) {
                chrome.tabs.sendMessage(
                    tabId,
                    o,
                );
            } else {
                console.log('sender tab not active');
            }
        } else {
            console.log('no tab active');
        }
    });
}

async function sendToActiveTab(s: string) {
    chrome.tabs.query({ active: true, currentWindow: true }, async function (tabs) {
        chrome.tabs.sendMessage(
            tabs[0].id,
            s,
        );
    });
}

client.then(c => { c.onChange = sendStates.bind(null, c) });

chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason == "install") {
        chrome.tabs.create({ url: "/popup.html" });
    } else if (details.reason == "update") {
        var thisVersion = chrome.runtime.getManifest().version;
        console.log("Updated from " + details.previousVersion + " to " + thisVersion);
    }
});
