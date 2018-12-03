import {RequestTypes, ResponseTypes} from './enums';
import { getOriginFromUrl } from './url';

function forwardMessageToExtension(e) {
    const message = e.data;
    const type = message.type;
    if ([
        RequestTypes.REGISTER_U2F,
        RequestTypes.SIGN_U2F,
        RequestTypes.REGISTER_WEBAUTHN,
        RequestTypes.SIGN_WEBAUTHN,
    ].indexOf(type) >= 0) {
        let w = e.target as Window;
        while (w.parent !== w) {
            if (getOriginFromUrl(w.document.referrer) !== getOriginFromUrl(w.location.href)) {
                console.error('different origin ancestor');
                console.error(message);
                return;
            }
            w = w.parent;
        }
        (safari as any).extension.dispatchMessage(type, message);
    }
}

function forwardMessageFromExtension(e) {
    e.message.data.type = e.message.type;
    if ([
        ResponseTypes.REGISTER_U2F,
        ResponseTypes.SIGN_U2F,
        ResponseTypes.REGISTER_WEBAUTHN,
        ResponseTypes.SIGN_WEBAUTHN,
    ].indexOf(e.message.type) >= 0) {
        window.postMessage(e.message.data, window.location.origin);
    }
}

const s = document.createElement('script');
s.type = 'text/javascript';
s.src = safari.extension.baseURI + 'inject.js';
document.documentElement.appendChild(s);

window.addEventListener('message', forwardMessageToExtension, true);
(safari.self as any).addEventListener('message', forwardMessageFromExtension, false);
