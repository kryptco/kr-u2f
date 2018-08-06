import $ from 'jquery';
import { getOriginFromUrl } from './url';
import {inject} from './inject_u2f_chromium';
import { fetchAppIdUrl } from './origin-checker';

let u2fInject = document.createElement('script');
u2fInject.type = 'text/javascript';
//  inject as textContent to run script synchronously
u2fInject.textContent = "("+inject.toString()+")();";
document.documentElement.appendChild(u2fInject);

//  inject webauthn as file since it depends on node Buffer
let webauthnInject = document.createElement('script');
webauthnInject.type = 'text/javascript';
webauthnInject.src = 'chrome-extension://' + chrome.runtime.id + '/js/inject_webauthn.js';
document.documentElement.appendChild(webauthnInject);

$(document).ready(async () => {
    $("[role=button]:contains('Add Security Key')").first().addClass('kr-pulse');
});

let forwardToExtensionTypes = ['u2f_register_request', 'u2f_sign_request', 'webauthn_sign_request', 'webauthn_register_request'];
let forwardToPageTypes = ['u2f_register_response', 'u2f_sign_response', 'webauthn_register_response', 'webauthn_sign_response'];
window.addEventListener('message', (ev) => {
    let msg = ev.data;
    if (typeof(msg) == 'string') {
        return;
    }

    if (forwardToExtensionTypes.indexOf(msg.type) > -1) {
        let w = <Window>ev.target;
        while (w.parent != w) {
            if (getOriginFromUrl(w.document.referrer) != getOriginFromUrl(w.location.href)) {
                console.error('different origin ancestor');
                console.log(msg);
                return;
            }
            w = w.parent;
        }
        chrome.runtime.sendMessage(msg, {includeTlsChannelId: true});
        return;
    }

});

chrome.runtime.onMessage.addListener( (msg, sender, sendResponse) => {
    if (forwardToPageTypes.indexOf(msg.type) > -1) {
        msg.data.type = msg.type;
        window.postMessage(msg.data, window.location.origin);
        return;
    }
    else if (msg.type == "url_fetch") {
        fetchAppIdUrl(msg.url).then(sendResponse);
        return true;
    }
});