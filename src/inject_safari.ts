import {RequestTypes, ResponseTypes} from './enums'
import { webauthnStringify, webauthnParse } from "./krjson";

(function () {
    var nativeU2f = window['u2f'];

    function listener(evt) {
        var u2f = window['u2f']
        let msg = evt.data;
        let requestId = msg.requestId;

        if ((<any>Object).values(ResponseTypes).includes(evt.data.type)) {
            if(msg.responseData) {
                if(msg.type == ResponseTypes.REGISTER_U2F || msg.type == ResponseTypes.SIGN_U2F) {
                    let req = u2f.requests[requestId];
                    let callback = u2f.callbacks[requestId];
                    if(msg.responseData.fallback) {
                        console.log("falling back to native implementation")
                        if(req.type == RequestTypes.REGISTER_U2F) {
                            u2f.native.register(req.appId, req.registerRequests, req.registeredKeys, callback, req.timeoutSeconds);
                        }
                        else if(req.type == RequestTypes.SIGN_U2F) {
                            u2f.native.sign(req.appId, req.challenge, req.registeredKeys, callback, req.timeoutSeconds);
                        }
                    }
                    else {
                        callback(msg.responseData);
                    }
                    delete u2f.requests[requestId];
                    delete u2f.callbacks[requestId];
                }
                else if (msg.type == ResponseTypes.REGISTER_WEBAUTHN || msg.type == ResponseTypes.SIGN_WEBAUTHN) {
                    var webauthnCallbacks = navigator.credentials['callbacks'];
                    webauthnCallbacks[msg.requestId](msg);
                    delete (webauthnCallbacks[msg.requestId]);
                }
            }
        }
    }

    function registerU2f(appId, registerRequests, registeredKeys, callback, opt_timeoutSeconds) {
        var u2f = window['u2f']
        if(!u2f.listenerAdded) {
            window.addEventListener('message', listener);
            u2f.listenerAdded = true;
        }
        var requestId = ++u2f.reqCounter;
        var msg = {
            type: RequestTypes.REGISTER_U2F,
            requestId: requestId,
            appId: appId,
            registerRequests: registerRequests,
            registeredKeys: registeredKeys,
            timeoutSeconds: opt_timeoutSeconds
        }
        u2f.callbacks[requestId] = callback;
        u2f.requests[requestId] = msg;
        window.postMessage(msg, window.location.origin);
    }

    function signU2f(appId, challenge, registeredKeys, callback, opt_timeoutSeconds) {
        var u2f = window['u2f']
        if(!u2f.listenerAdded) {
            window.addEventListener('message', listener);
            u2f.listenerAdded = true;
        }
        var requestId = ++u2f.reqCounter;
        var msg = {
            type: RequestTypes.SIGN_U2F,
            requestId: requestId,
            appId: appId,
            challenge: challenge,
            registeredKeys: registeredKeys,
            timeoutSeconds: opt_timeoutSeconds
        }
        u2f.callbacks[requestId] = callback;
        u2f.requests[requestId] = msg;
        window.postMessage(msg, window.location.origin);
    }

    var u2f = {
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
    
    let krCredentials = {
        create: function (options: CredentialCreationOptions): Promise<Credential | null> {
            var u2f = window['u2f']
            if (!u2f.listenerAdded) {
                window.addEventListener('message', listener);
                u2f.listenerAdded = true;
            }
            var webauthnReqCounter = navigator.credentials['reqCounter'];
            var webauthnCallbacks = navigator.credentials['callbacks'];
            try {
                let requestId = ++webauthnReqCounter;
                let registerRequest = {
                    type: RequestTypes.REGISTER_WEBAUTHN,
                    requestId,
                    options: webauthnStringify(options),
                };

                let cb: Promise<any> = new Promise((res, rej) => {
                    webauthnCallbacks[requestId] = res;
                });
                window.postMessage(registerRequest, window.location.origin);
                return cb.then(r => {
                    var webauthnResponse = webauthnParse(r.responseData.credential);
                    return webauthnResponse;
                });
            } catch (e) {
                console.debug(e);
                //  never resolve
                return new Promise((res, rej) => {});
            }
        },

        get: function (options?: CredentialRequestOptions): Promise<Credential | null | any> {
            var u2f = window['u2f']
            if (!u2f.listenerAdded) {
                window.addEventListener('message', listener);
                u2f.listenerAdded = true;
            }
            var webauthnReqCounter = navigator.credentials['reqCounter'];
            var webauthnCallbacks = navigator.credentials['callbacks'];
            try {
                let requestId = ++webauthnReqCounter;
                let signRequest = {
                    type: RequestTypes.SIGN_WEBAUTHN,
                    requestId,
                    options: webauthnStringify(options),
                };

                let cb = new Promise((res, rej) => {
                    webauthnCallbacks[requestId] = res;
                });
                window.postMessage(signRequest, window.location.origin);
                return cb.then(r => {
                    var webauthnResponse = webauthnParse(r['responseData'].credential)
                    return webauthnResponse
                });
            } catch (e) {
                console.debug(e);
                //  never resolve
                return new Promise((res, rej) => {});
            }
        },
    };

    let hybridCredentials = {
        create: (options: CredentialCreationOptions): Promise<Credential | null> => {
            let credentialBackends = [
                krCredentials,
                navigator.credentials['native'],
            ];
            return Promise.race(
                credentialBackends
                    .filter(f => f && f.create)
                    .map(b => b.create(options))
            );
        },
        get: (options?: CredentialRequestOptions): Promise<Credential | null | any> => {
            let credentialBackends = [
                krCredentials,
                navigator.credentials['native'],
            ];
            return Promise.race(
                credentialBackends
                    .filter(f => f && f.get)
                    .map(b => b.get(options))
            );
        }
    }

    function wrapWebauthn() {
        function createWrapper(options: CredentialCreationOptions) {
            return navigator['credentials']['create_'](options);
        }
        function getWrapper(options: CredentialRequestOptions) {
            return navigator['credentials']['get_'](options);
        }
        navigator['credentials'].create = createWrapper;
        navigator['credentials'].get = getWrapper;
    };

    var nativeWebauthn = navigator.credentials;
    var credentials = {
        callbacks: {},
        create: hybridCredentials.create,
        create_: hybridCredentials.create,
        get: hybridCredentials.get,
        get_: hybridCredentials.get,
        reqCounter: 0,
    };
    Object.defineProperty(navigator, 'credentials', {
        value: credentials,
        writable: false,
    });
    Object.defineProperty(navigator.credentials, 'native', {
        value: nativeWebauthn,
    });
    try {
        window['eval']("(" + wrapWebauthn.toString() + ")()");
    }
    catch (e) {
        console.log('wrap failed with error: ' + e);
    }
})();