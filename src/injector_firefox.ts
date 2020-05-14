import {RequestTypes, ResponseTypes} from './enums';
import { webauthnParse, webauthnStringify } from './krjson';

declare var cloneInto;
declare var exportFunction;

export function injectU2fInterface() {
    const nativeU2f = window['u2f'];

    function listener(evt) {
        const u2f = window['wrappedJSObject']['u2f'];
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
                    const webauthnCallbacks = navigator['wrappedJSObject'].credentials.callbacks;
                    webauthnCallbacks[msg.requestId](msg);
                    delete (webauthnCallbacks[msg.requestId]);
                }
            }
        }
    }

    function registerU2f(appId, registerRequests, registeredKeys, callback, opt_timeoutSeconds) {
        if (typeof(registeredKeys) === 'function') {
            // Old api, need to switch argument order
            // Old register argument order is registerRequests, signRequests (for registered keys), callback, timeout
            opt_timeoutSeconds = callback;
            callback = registeredKeys;
            registeredKeys = registerRequests.map((signRequest) => signRequest.keyHandle);
            registerRequests = appId;
            appId = registerRequests[0].appId;
        }
        const u2f = window['wrappedJSObject']['u2f'];
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
            timeoutSeconds: opt_timeoutSeconds,
            type: RequestTypes.REGISTER_U2F,
        };
        u2f.callbacks[requestId] = callback;
        u2f.requests[requestId] = msg;
        window.postMessage(msg, window.location.origin);
    }

    function signU2f(appId, challenge, registeredKeys, callback, opt_timeoutSeconds) {
        if (typeof(challenge) === 'function') {
            // Old api, need to switch argument order
            // Old sign argument order is signRequests, callback, timeout
            opt_timeoutSeconds = registeredKeys;
            callback = challenge;
            registeredKeys = appId.map((signRequest) => signRequest.keyHandle);
            challenge = appId[0].challenge;
            appId = appId[0].appId;
        }
        const u2f = window['wrappedJSObject']['u2f'];
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
            timeoutSeconds: opt_timeoutSeconds,
            type: RequestTypes.SIGN_U2F,
        };
        u2f.callbacks[requestId] = callback;
        u2f.requests[requestId] = msg;
        window.postMessage(msg, window.location.origin);
    }

    const u2f = cloneInto(
        {
            callbacks: {},
            listenerAdded: false,
            register: registerU2f,
            reqCounter: 0,
            requests: {},
            sign: signU2f,
        },
        window,
        {
            cloneFunctions: true,
        },
    );
    Object.defineProperty(window['wrappedJSObject'], 'u2f', {
        //  setting configurable prevents AWS console crash
        configurable: true,
        enumerable: false,
        value: u2f,
        writable: false,
    });
    Object.defineProperty(window['wrappedJSObject']['u2f'], 'native', {
        value: nativeU2f,
    });

    const krCredentials = {
        create(options: CredentialCreationOptions): Promise<PublicKeyCredential | null> {
            const u2f = window['wrappedJSObject']['u2f'];
            if (!u2f.listenerAdded) {
                window.addEventListener('message', listener);
                u2f.listenerAdded = true;
            }
            let webauthnReqCounter = navigator['wrappedJSObject'].credentials.reqCounter;
            const webauthnCallbacks = navigator['wrappedJSObject'].credentials.callbacks;
            const pageWindow = window['wrappedJSObject'];
            try {
                const requestId = ++webauthnReqCounter;
                const registerRequest = {
                    options: webauthnStringify(options),
                    requestId,
                    type: RequestTypes.REGISTER_WEBAUTHN,
                };

                const cb: Promise<any> = new pageWindow.Promise(exportFunction((res, rej) => {
                    webauthnCallbacks[requestId] = res;
                }, window));
                window.postMessage(registerRequest, window.location.origin);
                return cb.then(exportFunction((r) => {
                    let webauthnResponse = cloneInto(
                                                        webauthnParse(r.responseData.credential),
                                                        window,
                                                        { cloneFunctions: true },
                                                      );

                        
                    Object.defineProperty(webauthnResponse, 'getClientExtensionResults', function() {
                        return {};
                    });                                                               
                                
                    return webauthnResponse;
                }, window));
            } catch (e) {
                console.error(e);
                //  never resolve
                return new pageWindow.Promise(exportFunction((res, rej) => { return; }, window));
            }
        },

        get(options?: CredentialRequestOptions): Promise<PublicKeyCredential | null | any> {
            const u2f = window['wrappedJSObject']['u2f'];
            if (!u2f.listenerAdded) {
                window.addEventListener('message', listener);
                u2f.listenerAdded = true;
            }
            let webauthnReqCounter = navigator['wrappedJSObject'].credentials.reqCounter;
            const webauthnCallbacks = navigator['wrappedJSObject'].credentials.callbacks;
            const pageWindow = window['wrappedJSObject'];
            try {
                const requestId = ++webauthnReqCounter;
                const signRequest = {
                    options: webauthnStringify(options),
                    requestId,
                    type: RequestTypes.SIGN_WEBAUTHN,
                };

                const cb = new pageWindow.Promise(exportFunction((res, rej) => {
                    webauthnCallbacks[requestId] = res;
                }, window));
                window.postMessage(signRequest, window.location.origin);
                return cb.then(exportFunction((r) => {
                    const webauthnResponse = cloneInto(
                                                        webauthnParse(r.responseData.credential),
                                                        window,
                                                        { cloneFunctions: true },
                                                      );
                    return webauthnResponse;
                }, window));
            } catch (e) {
                console.error(e);
                //  never resolve
                return new pageWindow.Promise(exportFunction((res, rej) => { return; }, window));
            }
        },
    };

    const hybridCredentials = {
        create: (options: CredentialCreationOptions): Promise<PublicKeyCredential | null> => {
            const credentialBackends = new window['wrappedJSObject'].Array(
                krCredentials,
                // navigator['wrappedJSObject'].credentials.native,
            );
            return window['wrappedJSObject'].Promise.race(
                credentialBackends
                    .filter(exportFunction((f) => f && f.create, window))
                    .map(exportFunction((b) => b.create(options), window)),
            );
        },
        get: (options?: CredentialRequestOptions): Promise<PublicKeyCredential | null | any> => {
            const credentialBackends = new window['wrappedJSObject'].Array(
                krCredentials,
                // navigator['wrappedJSObject'].credentials.native,
            );
            return window['wrappedJSObject'].Promise.race(
                credentialBackends
                    .filter(exportFunction((f) => f && f.get, window))
                    .map(exportFunction((b) => b.get(options), window)),
            );
        },
    };

    function wrapWebauthn() {
        function createWrapper(options: CredentialCreationOptions) {
            return navigator['credentials']['create_'](options)
                .then((credential) => {
                    Object.setPrototypeOf(credential, window['PublicKeyCredential'].prototype);
                    return credential;
                });
        }
        function getWrapper(options: CredentialRequestOptions) {
            return navigator['credentials']['get_'](options)
                .then((credential) => {
                    Object.setPrototypeOf(credential, window['PublicKeyCredential'].prototype);
                    return credential;
                });
        }
        navigator['credentials'].create = createWrapper;
        navigator['credentials'].get = getWrapper;
    }

    const nativeWebauthn = navigator['wrappedJSObject'].credentials;
    const credentials = cloneInto(
        {
            callbacks: {},
            create: hybridCredentials.create,
            create_: hybridCredentials.create,
            get: hybridCredentials.get,
            get_: hybridCredentials.get,
            reqCounter: 0,
        },
        window,
        {
            cloneFunctions: true,
            wrapReflectors: true,
        },
    );
    Object.defineProperty(navigator['wrappedJSObject'], 'credentials', {
        value: credentials,
        writable: false,
    });
    Object.defineProperty(navigator['wrappedJSObject'].credentials, 'native', {
        value: nativeWebauthn,
    });
    try {
        window['eval']('(' + wrapWebauthn.toString() + ')()');
    } catch (e) {
        console.error('wrap failed with error: ' + e);
    }
}
