import $ from 'jquery';

import { RequestTypes, ResponseTypes } from './enums';
import { fetchAppIdUrl } from './origin-checker';
import { getOriginFromUrl } from './url';

import {injectU2f} from './inject_edge';

const injectTest = document.createElement('script');
injectTest.type = 'text/javascript';
injectTest.textContent = '(' + injectU2f.toString() + ')();';
document.documentElement.appendChild(injectTest);

$(document).ready(async () => {
    $("[role=button]:contains('Add Security Key')").first().addClass('kr-pulse');
});

const forwardToExtensionTypes = [
                                    RequestTypes.REGISTER_U2F,
                                    RequestTypes.SIGN_U2F,
                                    RequestTypes.REGISTER_WEBAUTHN,
                                    RequestTypes.SIGN_WEBAUTHN,
                                ];
const forwardToPageTypes = [
                                ResponseTypes.REGISTER_U2F,
                                ResponseTypes.SIGN_U2F,
                                ResponseTypes.REGISTER_WEBAUTHN,
                                ResponseTypes.SIGN_WEBAUTHN,
                            ];
window.addEventListener('message', (ev) => {
    const msg = ev.data;
    if (typeof(msg) === 'string') {
        return;
    }

    if (forwardToExtensionTypes.indexOf(msg.type) > -1) {
        let w = ev.target as Window;
        while (w.parent !== w) {
            if (getOriginFromUrl(w.document.referrer) !== getOriginFromUrl(w.location.href)) {
                console.error('different origin ancestor');
                console.error(msg);
                return;
            }
            w = w.parent;
        }
        browser.runtime.sendMessage(msg);
        return;
    }

});

browser.runtime.onMessage.addListener( (msg, sender, sendResponse) => {
    if (forwardToPageTypes.indexOf(msg.type) > -1) {
        msg.data.type = msg.type;
        window.postMessage(msg.data, window.location.origin);
        return;
    } else if (msg.type === 'url_fetch') {
        fetchAppIdUrl(msg.url).then(sendResponse);
        return true;
    }
});
