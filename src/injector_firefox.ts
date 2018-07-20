import {RequestTypes, ResponseTypes} from './enums'
import { webauthnStringify, webauthnParse } from "./krjson";

declare var cloneInto;
declare var exportFunction

export function injectU2fInterface() {
    var nativeU2f = window['u2f'];

    function listener(evt) {
        var u2f = window['wrappedJSObject']['u2f']
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
                    var webauthnCallbacks = navigator['wrappedJSObject'].credentials.callbacks;
                    webauthnCallbacks[msg.requestId](msg);
                    delete (webauthnCallbacks[msg.requestId]);
                }
            }
        }
    }

    function registerU2f(appId, registerRequests, registeredKeys, callback, opt_timeoutSeconds) {
        var u2f = window['wrappedJSObject']['u2f']
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
        var u2f = window['wrappedJSObject']['u2f']
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

    var u2f = cloneInto(
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
        }
    );
    Object.defineProperty(window['wrappedJSObject'], 'u2f', {
        value: u2f,
        writable: false,
    });
    Object.defineProperty(window['wrappedJSObject']['u2f'], 'native', {
        value: nativeU2f,
    });
    
    function createWebauthn(options: CredentialCreationOptions): Promise<Credential | null> {
        var u2f = window['wrappedJSObject']['u2f']
        if(!u2f.listenerAdded) {
            window.addEventListener('message', listener);
            u2f.listenerAdded = true;
        }
        var webauthnReqCounter = navigator['wrappedJSObject'].credentials.reqCounter;
        var webauthnCallbacks = navigator['wrappedJSObject'].credentials.callbacks;
        var pageWindow = window['wrappedJSObject'];
        try {
            let requestId = ++webauthnReqCounter;
            let registerRequest = {
                type: RequestTypes.REGISTER_WEBAUTHN,
                requestId,
                options: webauthnStringify(options),
            };

            let cb: Promise<any> = new pageWindow.Promise(exportFunction((res, rej) => {
                webauthnCallbacks[requestId] = res;
            }, window));
            window.postMessage(registerRequest, window.location.origin);
            return cb.then(exportFunction(r => {
                console.debug(r)
                if (r.responseData.fallback) { throw 'fallback to native'; }
                var webauthnResponse = cloneInto(webauthnParse(r.responseData.credential), window, {cloneFunctions: true})
                return webauthnResponse;
            }, window))
                .catch(exportFunction((e) => {
                    console.debug(e);
                    return navigator['wrappedJSObject'].credentials.native.create(options);
                }, window));
        } catch (e) {
            console.debug(e);
            return navigator['wrappedJSObject'].credentials.native.create(options);
        }
    }

    function getWebauthn(options?: CredentialRequestOptions): Promise<Credential | null | any> {
        var u2f = window['wrappedJSObject']['u2f']
        if(!u2f.listenerAdded) {
            window.addEventListener('message', listener);
            u2f.listenerAdded = true;
        }
        var webauthnReqCounter = navigator['wrappedJSObject'].credentials.reqCounter;
        var webauthnCallbacks = navigator['wrappedJSObject'].credentials.callbacks;
        var pageWindow = window['wrappedJSObject'];
        try {
            let requestId = ++webauthnReqCounter;
            let signRequest = {
                type: RequestTypes.SIGN_WEBAUTHN,
                requestId,
                options: webauthnStringify(options),
            };

            let cb = new pageWindow.Promise(exportFunction((res, rej) => {
                webauthnCallbacks[requestId] = res;
            }, window));
            window.postMessage(signRequest, window.location.origin);
            return cb.then(exportFunction(r => {
                if (r.responseData.fallback) { throw 'fallback to native'; }
                var webauthnResponse = cloneInto(webauthnParse(r.responseData.credential), window, {cloneFunctions: true})
                return webauthnResponse
            }, window));
        } catch (e) {
            console.debug(e);
            return navigator['wrappedJSObject'].credentials.native.get(options);
        }
    }

    var nativeWebauthn = navigator['wrappedJSObject'].credentials;
    var credentials = cloneInto(
        {
            callbacks: {},
            create: createWebauthn,
            get: getWebauthn,
            reqCounter: 0,
        },
        window,
        {
            cloneFunctions: true,
            wrapReflectors: true,
        }
    );
    Object.defineProperty(navigator['wrappedJSObject'], 'credentials', {
        value: credentials,
        writable: false,
    });
    Object.defineProperty(navigator['wrappedJSObject'].credentials, 'native', {
        value: nativeWebauthn,
    });
}