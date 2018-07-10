import $ from 'jquery';
import { getOriginFromUrl } from './url';

function appendToDocument(script) {
    return (document.body || document.head || document.documentElement).appendChild(script);
}

let injectExtensionId = document.createElement('script');
injectExtensionId.innerHTML = 'window.kryptonExtensionId = \'' + chrome.runtime.id + '\';';
appendToDocument(injectExtensionId);
let s = document.createElement('script');
s.setAttribute('src', 'chrome-extension://' + chrome.runtime.id + '/js/inject.js');
appendToDocument(s);

$(document).ready(async () => {
    $("[role=button]:contains('Add Security Key')").first().addClass('kr-pulse');

    chrome.runtime.sendMessage(await JSON.stringify({request: {ty: 'getPaired'}}));
});

function injectPairedStatus(paired: boolean) {
    let s = document.createElement('script');
    s.innerHTML = 'if (window.onKrPairStatus) window.onKrPairStatus(' + JSON.stringify(paired) + ');';
    let node = appendToDocument(s);
    node.remove();
}

let forwardToExtensionTypes = ['u2f_register_request', 'u2f_sign_request', 'webauthn_sign_request', 'webauthn_register_request'];
let forwardToPageTypes = ['u2f_register_response', 'u2f_sign_response', 'webauthn_register_response', 'webauthn_sign_response'];
window.addEventListener('message', (ev) => {
    let msg = ev.data;
    if (typeof(msg) == 'string') {
        return;
    }

    msg.origin = ev.origin;
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

chrome.runtime.onMessage.addListener(async (msg, sender) => {
    if (forwardToPageTypes.indexOf(msg.type) > -1) {
        msg.data.type = msg.type;
        window.postMessage(msg.data, window.location.origin);
        return;
    }

    let m = JSON.parse(msg);
    if (m.response) {
        injectPairedStatus(m.response.paired || false);
    }
});