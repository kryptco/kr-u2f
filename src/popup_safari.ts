import $ from 'jquery';

import { equals } from './crypto';
import { Message, Request, RequestType } from './messages';

$(document).ready(async () => {

    $('.extension-version').text(safari.extension.displayVersion);
    const pair = document.getElementById('pairScreen');

    onPopupOpen();
    pollState();

    $('#unpairButton').click(async () => {
        pair.classList.remove('remove');

        sendRequest(
            Message.newRequest(new Request(RequestType.unpair)),
        );
    });

    $('#accounts a').click((e) => {
        safari.application.activeBrowserWindow.openTab().url = e.currentTarget.getAttribute('href');
        safari.extension.toolbarItems[0].popover.hide();
    });
});

async function sendRequest(m: Message) {
    const requestFn = (safari.extension.globalPage.contentWindow as any).krRequestGlobalPage;
    if (requestFn) {
        requestFn(m);
    }
}

async function onPopupOpen() {
    const m = new Message();
    m.request = new Request(RequestType.refreshPopup);
    sendRequest(m);
}

async function pollState() {
    const poll = async () => {
        //  necessary since a safari popup is persistent
        if (document.visibilityState !== 'visible') {
            return;
        }
        const m = new Message();
        m.request = new Request(RequestType.getState);
        sendRequest(m);
    };
    await poll();
    setInterval(poll, 1000);
}

let isFirstTimeOpen = true;
let lastQrCode = null;

async function update() {
    const r = Message.newRequest(new Request(RequestType.getState));
    //  Check if global page loaded
    sendRequest(r);
}

async function onState(m: Message) {
    const launch = document.getElementById('launch');
    const pair = document.getElementById('pairScreen');
    const accounts = document.getElementById('accounts');

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

            //  safari does not preserve correct Uint8Array type when crossing background -> popup boundary
            if (lastQrCode == null || (await equals(Uint8Array.from(lastQrCode), Uint8Array.from(r.qr.pk))) === false) {
                lastQrCode = r.qr.pk;
                $('#pairingQR').html(await r.qr.render());
            }
        }
        if (r.phoneName) {
            $('.tokenName').text(r.phoneName);
        }
    }
}

(safari.extension.globalPage.contentWindow as any).krSendToPopup = onState;

safari.self['height'] = 600;
