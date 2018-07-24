import {RequestTypes, ResponseTypes} from './enums';
import { getOriginFromUrl } from './url';



function forwardMessageToExtension(e) {
    let message = e.data;
    let type = message.type;
    if ([
        RequestTypes.REGISTER_U2F,
        RequestTypes.SIGN_U2F,
        RequestTypes.REGISTER_WEBAUTHN,
        RequestTypes.SIGN_WEBAUTHN,
    ].indexOf(type) >= 0) {
        let w = <Window>e.target;
        while (w.parent != w) {
            if (getOriginFromUrl(w.document.referrer) != getOriginFromUrl(w.location.href)) {
                console.error('different origin ancestor');
                console.log(message);
                return;
            }
            w = w.parent;
        }
        (<any>safari.self).tab.dispatchMessage(type, message);
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

var s = document.createElement('script');
s.type = 'text/javascript';
s.src = safari.extension.baseURI + 'js/inject.js';
document.documentElement.appendChild(s);

window.addEventListener("message", forwardMessageToExtension, true);
(<any>safari.self).addEventListener("message", forwardMessageFromExtension, false);