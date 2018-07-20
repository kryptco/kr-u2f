import { webauthnStringify, webauthnParse } from "./krjson";
import { RequestTypes, ResponseTypes } from "./enums"

function callbackOrFallbackTo(callback, fallback) {
    return function(r) {
        if (r.fallback) {
            return fallback();
        } 
        callback(r);
    }
}

function krPaired() : boolean {
    return window['krPaired'] == true;
}

window['onKrPairStatus'] = function(paired: boolean) {
    window['krPaired'] = paired;
    if (paired) {
        Object.assign(navigator.credentials, window['krCredentials']);
    } else {
        Object.assign(navigator.credentials, window['nativeCredentials']);
    }
};

const chrome = window['chrome'];

(() => {
    function injectMessagePort() {
        const nativeRuntime = {
            connect: chrome.runtime.connect,
            sendMessage: chrome.runtime.sendMessage,
        };

        chrome.runtime.connect = function (extensionId?, connectInfo?) {
            if (krPaired() && (extensionId == 'klnjmillfildbbimkincljmfoepfhjjj' || extensionId == 'kmendfapggjehodndflmmgagdbamhnfd')) {
                let fallbackPort: chrome.runtime.Port = nativeRuntime.connect(extensionId, connectInfo);
                let requests = {};
                let requestCounter = 0;
                let port = {
                    krPort: true,
                    name: connectInfo.name,
                    onMessage: {
                        addListener: function (l) {
                            fallbackPort.onMessage.addListener(l);
                            window.addEventListener('message', function (evt) {
                                if (evt.origin != window.location.origin) {
                                    console.debug("event from origin " + evt.origin + ", not " + window.location.origin);
                                    return;
                                }
                                if ((<any>Object).values(ResponseTypes).includes(evt.data.type)) {
                                    let requestId = evt.data.requestId;
                                    if (evt.data.responseData && evt.data.responseData.fallback) {
                                        if (requests[requestId]) {
                                            try {
                                                fallbackPort.postMessage(requests[requestId]);
                                            } catch (e) {
                                                console.log(e);
                                            }
                                        }
                                    } else {
                                        l(evt.data);
                                    }
                                    delete (requests[requestId]);
                                }
                            }, true);
                        }
                    },
                    onDisconnect: {
                        addListener: function (l) {
                            //  TODO: if fallback is not necessary, then
                            //  fallbackPort.onDisconnect may be a false
                            //  failure since Krypton can service the request
                            //  regardless of whether connecting to the
                            //  fallback extension succeeds
                            fallbackPort.onDisconnect.addListener(l);
                        }
                    },
                    disconnect: function () {
                    },
                    postMessage: function (msg) {
                        if (msg.type == RequestTypes.GET_API_VERSION) {
                            let response = {
                                type: ResponseTypes.GET_API_VERSION,
                                requestId: msg.requestId,
                                responseData: {
                                    js_api_version: 1.1
                                }
                            };
                            window.postMessage(response, window.location.origin);
                        } else if (msg.type == RequestTypes.SIGN_U2F || msg.type == RequestTypes.REGISTER_U2F || msg.type == RequestTypes.SIGN_WEBAUTHN) {
                            //  don't overwrite requestId set by page
                            msg.requestId = msg.requestId || ++requestCounter;
                            requests[msg.requestId] = msg;
                            window.postMessage(msg, window.location.origin);
                        } else {
                            console.warn('unhandled port message ' + JSON.stringify(msg));
                        }
                    },
                };
                return port;
            } else {
                return nativeRuntime.connect.bind(chrome.runtime)(extensionId, connectInfo);
            }
        };

        //  The page may have already stored a singleton connected to the native
        //  extension. In this case, disconnect it and retry if on GitHub
        let u2f = window['u2f'];
        if (u2f && u2f.port_ && u2f.port_.port_) {
            if (!window['u2f'].port_.port_.krPort) {
                let githubRetryButton : any = document.querySelector(".js-u2f-auth-retry");
                if (githubRetryButton && githubRetryButton.click) {
                    console.log("disconnecting existing U2F port");
                    window['u2f'].port_.port_.disconnect();
                    window['u2f'].port_ = null;

                    githubRetryButton.click();
                }
            }
        }
    }

    injectMessagePort();

    //  Webauthn inject
    let webauthnCallbacks = {};
    let webauthnReqCounter = 0;
    window['nativeCredentials'] = {
        get: navigator.credentials.get,
        create: navigator.credentials.create,
    };
    window['krCredentials'] = {};
    window['krCredentials'].create = async function (options: CredentialCreationOptions): Promise<Credential | null> {
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
            let webauthnResponse = await cb.then(r => {
                if (r.fallback) { throw 'fallback to native'; }
                return r;
            });

            let credential = webauthnParse(webauthnResponse.responseData.credential);
            return credential;
        } catch (e) {
            return window['nativeCredentials'].create.bind(navigator.credentials)(options);
        }
    }
    window['krCredentials'].get = async function (options?: CredentialRequestOptions): Promise<Credential | null | any> {
        let requestId = ++webauthnReqCounter;
        let cb = new Promise<any>((res, rej) => {
            webauthnCallbacks[requestId] = res;
        });

        let signRequest = {
            type: RequestTypes.SIGN_WEBAUTHN,
            requestId,
            options: webauthnStringify(options),
        };
        window.postMessage(signRequest, window.location.origin);

        try {
            let webauthnResponse = await cb.then(r => {
                if (r.fallback) { throw 'fallback to native'; }
                return r;
            });

            let credential = webauthnParse(webauthnResponse.responseData.credential);
            //TODO: add getClientExtensionResults() internal slot
            return credential;
        } catch {
            return window['nativeCredentials'].get.bind(navigator.credentials)(options);
        }
    }

    window.addEventListener('message', function (evt) {
        let msg = evt.data;
        if ([ResponseTypes.REGISTER_U2F, ResponseTypes.SIGN_U2F, ResponseTypes.REGISTER_WEBAUTHN, ResponseTypes.SIGN_WEBAUTHN].indexOf(msg.type) > -1) {
            if (msg.requestId && webauthnCallbacks[msg.requestId]) {
                webauthnCallbacks[msg.requestId](msg);
                delete (webauthnCallbacks[msg.requestId]);
            }
        }
    }, true);

})()

//  default to true
window['onKrPairStatus'](true);