import { webauthnStringify, webauthnParse } from "./krjson";

(() => {

    let webauthnCallbacks = {};
    let webauthnReqCounter = 0;
    let nativeCredentials = {
        get: navigator.credentials.get,
        create: navigator.credentials.create,
    };
    let krCredentials : any = {};
    krCredentials.create = async function (options: CredentialCreationOptions): Promise<Credential | null> {
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
        let webauthnResponse = await cb;

        let credential = webauthnParse(webauthnResponse.responseData.credential);
        credential.getClientExtensionResults = function () { return {}; };
        credential.__proto__ = window['PublicKeyCredential'].prototype;
        return credential;
    }
    krCredentials.get = async function (options?: CredentialRequestOptions): Promise<Credential | null | any> {
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

        let webauthnResponse = await cb;

        let credential = webauthnParse(webauthnResponse.responseData.credential);
        credential.getClientExtensionResults = function () { return {}; };
        credential.__proto__ = window['PublicKeyCredential'].prototype;
        return credential;
    }

    let hybridCredentials = {
        create: async function (options: CredentialCreationOptions): Promise<Credential | null> {
            let credentialBackends = [
                krCredentials,
            ];
            if (nativeCredentials.create) {
                credentialBackends.push(nativeCredentials);
            }
            return Promise.race(credentialBackends.map(b => b.create.bind(navigator.credentials)(options)));
        },
        get: async function(options?: CredentialRequestOptions): Promise<Credential | null | any> {
            let credentialBackends = [
                krCredentials,
            ];
            if (nativeCredentials.get) {
                credentialBackends.push(nativeCredentials);
            }
            return Promise.race(credentialBackends.map(b => b.get.bind(navigator.credentials)(options)));
        },
    };

    Object.assign(navigator.credentials, hybridCredentials);

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
