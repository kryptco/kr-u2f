import { webauthnParse, webauthnStringify } from './krjson';

(() => {

    const webauthnCallbacks = {};
    let webauthnReqCounter = 0;
    const nativeCredentials = {
        create: navigator.credentials.create,
        get: navigator.credentials.get,
    };
    const krCredentials: any = {};
    krCredentials.create = async function(options: CredentialCreationOptions): Promise<PublicKeyCredential | null> {
        const requestId = ++webauthnReqCounter;
        const registerRequest = {
            options: webauthnStringify(options),
            requestId,
            type: 'webauthn_register_request',
        };

        const cb: Promise<any> = new Promise((res, rej) => {
            webauthnCallbacks[requestId] = res;
        });
        window.postMessage(registerRequest, window.location.origin);
        const webauthnResponse = await cb;

        const credential = webauthnParse(webauthnResponse.responseData.credential);
        credential.getClientExtensionResults = function() { return {}; };
        credential.__proto__ = window['PublicKeyCredential'].prototype;
        return credential;
    };
    krCredentials.get = async function(options?: CredentialRequestOptions): Promise<PublicKeyCredential | null | any> {
        const requestId = ++webauthnReqCounter;
        const cb = new Promise<any>((res, rej) => {
            webauthnCallbacks[requestId] = res;
        });

        const signRequest = {
            options: webauthnStringify(options),
            requestId,
            type: 'webauthn_sign_request',
        };
        window.postMessage(signRequest, window.location.origin);

        const webauthnResponse = await cb;

        const credential = webauthnParse(webauthnResponse.responseData.credential);
        credential.getClientExtensionResults = function() { return {}; };
        credential.__proto__ = window['PublicKeyCredential'].prototype;
        return credential;
    };

    //  TODO: abort other backends when one finishes using the AbortController API
    //  https://dom.spec.whatwg.org/#aborting-ongoing-activities
    const hybridCredentials = {
        async create(options: CredentialCreationOptions): Promise<PublicKeyCredential | null> {
            const credentialBackends = [
                krCredentials,
            ];
            if (nativeCredentials.create) {
                credentialBackends.push(nativeCredentials);
            }
            return Promise.race(credentialBackends.map((b) => b.create.bind(navigator.credentials)(options)));
        },
        async get(options?: CredentialRequestOptions): Promise<PublicKeyCredential | null | any> {
            const credentialBackends = [
                krCredentials,
            ];
            if (nativeCredentials.get) {
                credentialBackends.push(nativeCredentials);
            }
            return Promise.race(credentialBackends.map((b) => b.get.bind(navigator.credentials)(options)));
        },
    };

    Object.assign(navigator.credentials, hybridCredentials);

    window.addEventListener('message', function(evt) {
        const msg = evt.data;
        if (
                ['u2f_register_response',
                'u2f_sign_response',
                'webauthn_register_response',
                'webauthn_sign_response']
                .indexOf(msg.type) > -1
            ) {
            if (msg.requestId && webauthnCallbacks[msg.requestId]) {
                webauthnCallbacks[msg.requestId](msg);
                delete (webauthnCallbacks[msg.requestId]);
            }
        }
    }, true);
})();
