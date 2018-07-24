import { webauthnStringify, webauthnParse } from "./krjson";

(() => {

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
                type: 'webauthn_register_request',
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
            type: 'webauthn_sign_request',
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

    Object.assign(navigator.credentials, window['krCredentials']);

    window.addEventListener('message', function (evt) {
        let msg = evt.data;
        if (['u2f_register_response', 'u2f_sign_response', 'webauthn_register_response', 'webauthn_sign_response'].indexOf(msg.type) > -1) {
            if (msg.requestId && webauthnCallbacks[msg.requestId]) {
                webauthnCallbacks[msg.requestId](msg);
                delete (webauthnCallbacks[msg.requestId]);
            }
        }
    }, true);
})();
