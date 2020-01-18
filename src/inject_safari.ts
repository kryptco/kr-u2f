import {RequestTypes, ResponseTypes} from './enums';
import { webauthnParse, webauthnStringify } from './krjson';

(function() {
    const nativeU2f = window['u2f'];

    function listener(evt) {
        const u2f = window['u2f'];
        const msg = evt.data;
        const requestId = msg.requestId;

        if ((Object as any).values(ResponseTypes).includes(evt.data.type)) {
            if (msg.responseData) {
                if (msg.type === ResponseTypes.REGISTER_U2F || msg.type === ResponseTypes.SIGN_U2F) {
                    const req = u2f.requests[requestId];
                    const callback = u2f.callbacks[requestId];
                    if (msg.responseData.fallback) {
                        console.warn('falling back to native implementation');
                        if (req.type === RequestTypes.REGISTER_U2F) {
                            u2f.native.register(
                                                    req.appId,
                                                    req.registerRequests,
                                                    req.registeredKeys,
                                                    callback,
                                                    req.timeoutSeconds,
                                                );
                        } else if (req.type === RequestTypes.SIGN_U2F) {
                            u2f.native.sign(req.appId, req.challenge, req.registeredKeys, callback, req.timeoutSeconds);
                        }
                    } else {
                        callback(msg.responseData);
                    }
                    delete u2f.requests[requestId];
                    delete u2f.callbacks[requestId];
                } else if (msg.type === ResponseTypes.REGISTER_WEBAUTHN || msg.type === ResponseTypes.SIGN_WEBAUTHN) {
                    const webauthnCallbacks = navigator.credentials['callbacks'];
                    webauthnCallbacks[msg.requestId](msg);
                    delete (webauthnCallbacks[msg.requestId]);
                }
            }
        }
    }

    function registerU2f(appId, registerRequests, registeredKeys, callback, optTimeoutSeconds) {
        if (typeof (registeredKeys) === 'function') {
            // Old api, need to switch argument order
            // Old register argument order is registerRequests, signRequests (for registered keys), callback, timeout
            optTimeoutSeconds = callback;
            callback = registeredKeys;
            registeredKeys = registerRequests.map((signRequest) => signRequest.keyHandle);
            registerRequests = appId;
            appId = registerRequests[0].appId;
        }
        const u2f = window['u2f'];
        if (!u2f.listenerAdded) {
            window.addEventListener('message', listener);
            u2f.listenerAdded = true;
        }
        const requestId = ++u2f.reqCounter;
        const msg = {
            appId,
            registerRequests,
            registeredKeys,
            requestId,
            timeoutSeconds: optTimeoutSeconds,
            type: RequestTypes.REGISTER_U2F,
        };
        u2f.callbacks[requestId] = callback;
        u2f.requests[requestId] = msg;
        window.postMessage(msg, window.location.origin);
    }

    function signU2f(appId, challenge, registeredKeys, callback, optTimeoutSeconds) {
        if (typeof (challenge) === 'function') {
            // Old api, need to switch argument order
            // Old sign argument order is signRequests, callback, timeout
            optTimeoutSeconds = registeredKeys;
            callback = challenge;
            registeredKeys = appId.map((signRequest) => signRequest.keyHandle);
            challenge = appId[0].challenge;
            appId = appId[0].appId;
        }
        const u2f = window['u2f'];
        if (!u2f.listenerAdded) {
            window.addEventListener('message', listener);
            u2f.listenerAdded = true;
        }
        const requestId = ++u2f.reqCounter;
        const msg = {
            appId,
            challenge,
            registeredKeys,
            requestId,
            timeoutSeconds: optTimeoutSeconds,
            type: RequestTypes.SIGN_U2F,
        };
        u2f.callbacks[requestId] = callback;
        u2f.requests[requestId] = msg;
        window.postMessage(msg, window.location.origin);
    }

    const u2f = {
        callbacks: {},
        listenerAdded: false,
        register: registerU2f,
        reqCounter: 0,
        requests: {},
        sign: signU2f,
    };
    Object.defineProperty(window, 'u2f', {
        value: u2f,
        writable: false,
    });
    Object.defineProperty(window['u2f'], 'native', {
        value: nativeU2f,
    });

    const krCredentials = {
        create(options: CredentialCreationOptions): Promise<PublicKeyCredential | null> {
            const u2f = window['u2f'];
            if (!u2f.listenerAdded) {
                window.addEventListener('message', listener);
                u2f.listenerAdded = true;
            }
            let webauthnReqCounter = navigator.credentials['reqCounter'];
            const webauthnCallbacks = navigator.credentials['callbacks'];
            try {
                const requestId = ++webauthnReqCounter;
                const registerRequest = {
                    options: webauthnStringify(options),
                    requestId,
                    type: RequestTypes.REGISTER_WEBAUTHN,
                };

                const cb: Promise<any> = new Promise((res, rej) => {
                    webauthnCallbacks[requestId] = res;
                });
                window.postMessage(registerRequest, window.location.origin);
                return cb.then((r) => {
                    const webauthnResponse = webauthnParse(r.responseData.credential);
                    return webauthnResponse;
                });
            } catch (e) {
                console.error(e);
                //  never resolve
                return new Promise((res, rej) => { return; });
            }
        },

        get(options?: CredentialRequestOptions): Promise<PublicKeyCredential | null | any> {
            const u2f = window['u2f'];
            if (!u2f.listenerAdded) {
                window.addEventListener('message', listener);
                u2f.listenerAdded = true;
            }
            let webauthnReqCounter = navigator.credentials['reqCounter'];
            const webauthnCallbacks = navigator.credentials['callbacks'];
            try {
                const requestId = ++webauthnReqCounter;
                const signRequest = {
                    options: webauthnStringify(options),
                    requestId,
                    type: RequestTypes.SIGN_WEBAUTHN,
                };

                const cb = new Promise((res, rej) => {
                    webauthnCallbacks[requestId] = res;
                });
                window.postMessage(signRequest, window.location.origin);
                return cb.then((r) => {
                    const webauthnResponse = webauthnParse(r['responseData'].credential);
                    return webauthnResponse;
                });
            } catch (e) {
                console.error(e);
                //  never resolve
                return new Promise((res, rej) => { return; });
            }
        },
    };

    const hybridCredentials = {
        create: (options: CredentialCreationOptions): Promise<PublicKeyCredential | null> => {
            const credentialBackends = [
                krCredentials,
                navigator.credentials['native'],
            ];
            return Promise.race(
                credentialBackends
                    .filter((f) => f && f.create)
                    .map((b) => b.create(options)),
            );
        },
        get: (options?: CredentialRequestOptions): Promise<PublicKeyCredential | null | any> => {
            const credentialBackends = [
                krCredentials,
                navigator.credentials['native'],
            ];
            return Promise.race(
                credentialBackends
                    .filter((f) => f && f.get)
                    .map((b) => b.get(options)),
            );
        },
    };

    const nativeWebauthn = navigator.credentials;
    const credentials = {
        callbacks: {},
        create: hybridCredentials.create,
        get: hybridCredentials.get,
        reqCounter: 0,
    };
    Object.defineProperty(navigator, 'credentials', {
        value: credentials,
        writable: false,
    });
    Object.defineProperty(navigator.credentials, 'native', {
        value: nativeWebauthn,
    });
})();
