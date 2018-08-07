import $ from 'jquery';

import { equals } from './crypto';
import { parse, stringify } from './krjson';
import { Message, Request, RequestType } from './messages';

$(document).ready(async () => {

    $('.extension-version').text(chrome.runtime.getManifest().version);
    const pair = document.getElementById('pairScreen');

    onPopupOpen();
    pollState();

    $('#unpairButton').click(async () => {
        pair.classList.remove('remove');

        chrome.runtime.sendMessage(await stringify(
            Message.newRequest(new Request(RequestType.unpair)),
        ));
    });
});

async function onPopupOpen() {
    const m = new Message();
    m.request = new Request(RequestType.refreshPopup);
    chrome.runtime.sendMessage(await stringify(m));
}

async function pollState() {
    const poll = async () => {
        if (!document.hasFocus()) {
            return;
        }
        const m = new Message();
        m.request = new Request(RequestType.getState);
        chrome.runtime.sendMessage(await stringify(m));
    };
    await poll();
    setInterval(poll, 1000);
}

let isFirstTimeOpen = true;
let lastQrCode = null;

chrome.runtime.onMessage.addListener(async (msg, sender) => {
    const launch = document.getElementById('launch');
    const pair = document.getElementById('pairScreen');
    const accounts = document.getElementById('accounts');

    const m = await parse(Message, msg);

    if (m.response) {
        const r = m.response;
        if (r.paired) {
            launch.classList.add('remove');
            pair.classList.add('remove');
            accounts.classList.remove('remove');
            if (r.u2fAccounts) {
                for (const acctId of r.u2fAccounts) {
                    const acctElem = document.getElementById(acctId);

                    if (acctElem != null) {
                        acctElem.classList.remove('unsecured');
                        acctElem.classList.add('secured');
                    }
                }
            }

        } else if (r.qr) {
            accounts.classList.add('remove');

            if (isFirstTimeOpen) {
                launch.classList.add('launchopen');

                setTimeout(async function() {
                    launch.classList.add('remove');
                    pair.classList.remove('remove');
                    isFirstTimeOpen = false;
                }, 600);
            } else {
                launch.classList.add('remove');
                pair.classList.remove('remove');
            }

            if (lastQrCode == null || (await equals(lastQrCode, r.qr.pk)) === false) {
                lastQrCode = r.qr.pk;
                $('#pairingQR').html(await r.qr.render());
            }
        }
        if (r.phoneName) {
            $('.tokenName').text(r.phoneName);
        }
    }
});
