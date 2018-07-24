export function inject() {

    const chrome = window['chrome'];
    function injectMessagePort() {
        const nativeRuntime = {
            connect: chrome.runtime.connect,
            sendMessage: chrome.runtime.sendMessage,
        };

        chrome.runtime.connect = function (extensionId?, connectInfo?) {
            if (extensionId == 'klnjmillfildbbimkincljmfoepfhjjj' || extensionId == 'kmendfapggjehodndflmmgagdbamhnfd') {
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
                                let responseTypes = [
                                    'u2f_get_api_version_response',
                                    'u2f_register_response',
                                    'u2f_sign_response',
                                    'webauthn_register_response',
                                    'webauthn_sign_response',
                                ];
                                if (responseTypes.indexOf(evt.data.type) >= 0) {
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
                        if (msg.type == 'u2f_get_api_version_request') {
                            let response = {
                                type: 'u2f_get_api_version_response',
                                requestId: msg.requestId,
                                responseData: {
                                    js_api_version: 1.1
                                }
                            };
                            window.postMessage(response, window.location.origin);
                        } else if (msg.type == 'u2f_sign_request' || msg.type == 'u2f_register_request' || msg.type == 'webauthn_sign_request') {
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
    }

    injectMessagePort();
}