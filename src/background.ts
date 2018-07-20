import { Message, RequestType, Toast } from './messages';
import EnclaveClient from './enclave_client';
import { stringify, parse, webauthnParse, webauthnStringify } from './krjson';
import * as protocol from './protocol';
import {to_base64_url_nopad, from_base64_url_nopad, crypto_hash_sha256} from './crypto';
import {RequestTypes, ResponseTypes} from './enums'

import {createAuthenticatorDataWithAttestation, createAuthenticatorDataWithoutAttestation} from './webauthn';
import * as CBOR from 'cbor';
import { client, makeRegisterData, addPresenceAndCounter } from './u2f';


import {getOriginFromUrl, getDomainFromOrigin} from './url';
import { BAD_APPID, verifyU2fAppId, checkIsRegistrableDomainSuffix} from './origin-checker';

chrome.runtime.onMessage.addListener(async (msg, sender) => {
    if (msg.type) {
        console.debug(msg);
        if (msg.type == RequestTypes.REGISTER_U2F) {
            var sendResponse = getResponseSender(ResponseTypes.REGISTER_U2F, msg.requestId, sender);
            handle_u2f_register(msg, sender).then(sendResponse)
                                            .catch((e) => {console.error(e) ; sendResponse({fallback: true})})
            return;
        }
        else if (msg.type == RequestTypes.REGISTER_WEBAUTHN) {
            var sendResponse = getResponseSender(ResponseTypes.REGISTER_WEBAUTHN, msg.requestId, sender);
            handle_webauthn_register(msg, sender).then(sendResponse)
                                                 .catch((e) => {console.error(e) ; sendResponse({fallback: true})})
            return;
        }
        else if (msg.type == RequestTypes.SIGN_U2F) {
            var sendResponse = getResponseSender(ResponseTypes.SIGN_U2F, msg.requestId, sender);
            handle_u2f_sign(msg, sender).then(sendResponse)
                                        .catch((e) => {console.error(e) ; sendResponse({fallback: true})})
            return;
        }
        else if (msg.type == RequestTypes.SIGN_WEBAUTHN) {
            var sendResponse = getResponseSender(ResponseTypes.SIGN_WEBAUTHN, msg.requestId, sender);
            handle_webauthn_sign(msg, sender).then(sendResponse)
                                             .catch((e) => {console.error(e) ; sendResponse({fallback: true})})
            return;
        }
    }
    let m = await parse(Message, msg);
    let c = await client;
    if (m.request) {23
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

function getResponseSender(responseType: string, requestId: number, sender: chrome.runtime.MessageSender | browser.runtime.MessageSender) {
    var responseSent = false;
    return function (responseData: object) {
        if(responseSent) {
            console.warn("Attempting to send multiple responses");
            return;
        }
        responseSent = true;
        let response = {
            type: responseType,
            data: {
                requestId: requestId,
                responseData: responseData,
            },
        };
        sendIfTabActive(sender.tab.id, response);
    }
}

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
                throw "Krypton already registered with this account";
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
    if (response.u2f_register_response.error) {
        throw response.u2f_register_response.error;
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

    let authenticatedResponseData = {
        credential: webauthnStringify(credential),
    }
    return authenticatedResponseData;
}

async function handle_u2f_register(msg: any, sender: chrome.runtime.MessageSender | browser.runtime.MessageSender) {
    let origin = getOriginFromUrl(sender.url);
    let appId = msg.appId
        || ((msg.registerRequests && msg.registerRequests.length > 0) ? msg.registerRequests[0].appId : null)
        || origin;

    try {
        await verifyU2fAppId(origin, appId);
    } catch (err) {
        console.error(err);
        return {errorCode: BAD_APPID};
    }

    let c = await client;
    
    if (!c.pairing.isPaired()) {
        throw "Krypton not paired";
    }
    let existingKeyHandles : string[] = [];
    if (msg.registeredKeys) {
        for (var i = 0; i < msg.registeredKeys.length; i++) {
            existingKeyHandles.push(msg.registeredKeys[i].keyHandle);
        }
    }
    if (msg.signRequests) {
        for (var i = 0; i < msg.signRequests.length; i++) {
            existingKeyHandles.push(msg.signRequests[i].keyHandle);
        }
    }
    for (var i = 0; i < existingKeyHandles.length; i++) {
        try {
            let keyHandle = await from_base64_url_nopad(existingKeyHandles[i]);
            if (await c.mapKeyHandleToMatchingAppId(keyHandle, { appId })) {
                //  already registered
                return { fallback: true };
            }
        } catch (e) {
            console.log(e);
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
    if (response.u2f_register_response.error) {
        throw response.u2f_register_response.error;
    }

    let authenticatedResponseData = {
        keyHandle: await to_base64_url_nopad(response.u2f_register_response.key_handle),
        clientData: await to_base64_url_nopad(clientData),
        registrationData: await to_base64_url_nopad(makeRegisterData(response.u2f_register_response)),
        version: "U2F_V2",
    };
    return authenticatedResponseData;
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
            try {
                await verifyU2fAppId(origin, pkOptions.extensions.appid);
                appId = pkOptions.extensions.appid
            } catch (err) {
                console.error(err);
                return {errorCode: BAD_APPID};
            }
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
        throw "Krypton not registered with this key handle"
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
    if (response.u2f_authenticate_response.error) {
        throw response.u2f_authenticate_response.error;
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
    
    let authenticatedResponseData = {
        credential: webauthnStringify(credential),
    }
    return authenticatedResponseData;
}

async function handle_u2f_sign(msg: any, sender: chrome.runtime.MessageSender) {
    let origin = getOriginFromUrl(sender.url);

    let c = await client;
    //  unify both request formats into registeredKeys
    if (msg.signRequests && !msg.registeredKeys) {
        if (msg.signRequests.length == 0) {
            return {};
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
            let potentialAppId: string = msg.registeredKeys[i].appId || msg.appId || origin;
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
        return {fallback: true};
    }

    try {
        await verifyU2fAppId(origin, matchingAppId);
    } catch(err) {
        console.error(err);
        return {errorCode: BAD_APPID};
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
    if (response.u2f_authenticate_response.error) {
        throw response.u2f_authenticate_response.error;
    }

    let signatureData = await to_base64_url_nopad(
        addPresenceAndCounter(response.u2f_authenticate_response)
    );
    let authenticatedResponseData = {
        keyHandle: await to_base64_url_nopad(keyHandle),
        signatureData,
        clientData: await to_base64_url_nopad(clientData),
        version: "U2F_V2",
    };
    return authenticatedResponseData;
}

function sendStates(c: EnclaveClient) {
    sendFullStateToPopup(c);
    sendPairStatusToTabs(c);
}

function sendPairStatusToTabs(c: EnclaveClient) {
    chrome.tabs.query({}, async tabs => {
        for (var i = 0; i < tabs.length; i++) {
            chrome.tabs.sendMessage(tabs[i].id, await stringify({ response: { paired: c.pairing.isPaired() } }));
        }
    });
}

function sendFullStateToPopup(c: EnclaveClient) {
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
