import $ from 'jquery';

import { Request, RequestType, Message } from './messages';
import { equals } from './crypto';

$(document).ready(async () => {
    
    $('.extension-version').text(safari.extension.displayVersion);
    var pair = document.getElementById("pairScreen");

    onPopupOpen();
    pollState();

    $('#unpairButton').click(async () => {
        pair.classList.remove("remove");

        sendRequest(
            Message.newRequest(new Request(RequestType.unpair))
        );
    });
});

async function sendRequest(m: Message) {
    let requestFn = (<any> safari.extension.globalPage.contentWindow).krRequestGlobalPage;
    if (requestFn) {
        requestFn(m);
    }
}

async function onPopupOpen() {
    let m = new Message();
    m.request = new Request(RequestType.refreshPopup);
    sendRequest(m);
}

async function pollState() {
    let poll = async () => {
        if (!document.hasFocus()) {
            return;
        }
        let m = new Message();
        m.request = new Request(RequestType.getState);
        sendRequest(m);
    };
    await poll();
    setInterval(poll, 1000);
}

var isFirstTimeOpen = true;
var lastQrCode = null;

async function update() {
    let r = Message.newRequest(new Request(RequestType.getState));
    //  Check if global page loaded
    sendRequest(r);
}

async function onState(m: Message) {
    var launch = document.getElementById("launch");
    var pair = document.getElementById("pairScreen");
    var accounts = document.getElementById("accounts");

    if (m.response) {
        let r = m.response;
        if (r.paired) {       
            console.log("in r.paired");
            launch.classList.add("remove");
            pair.classList.add('remove');
            accounts.classList.remove('remove');
            console.log(r.u2fAccounts);
            if (r.u2fAccounts) {
                for (var i = 0; i < r.u2fAccounts.length; i++) {
                    var acctId = r.u2fAccounts[i];
                    var acctElem = document.getElementById(acctId);

                    if (acctElem != null) {
                        acctElem.classList.remove("unsecured");
                        acctElem.classList.add("secured");
                    }
                }
            }

        } else if (r.qr) {
            console.log("in r.qr");

            accounts.classList.add('remove');

            if (isFirstTimeOpen) {
                launch.classList.add("launchopen");

                setTimeout(async function() {
                    launch.classList.add("remove");
                    pair.classList.remove('remove');
                    isFirstTimeOpen = false;
                }, 600);
            } else {
                launch.classList.add("remove");
                pair.classList.remove('remove');
            }
            
            if (lastQrCode == null || (await equals(lastQrCode, r.qr.pk)) == false) {
                lastQrCode = r.qr.pk;
                $('#pairingQR').html(await r.qr.render());
            }            
        }
        if (r.phoneName) {
            $('.tokenName').text(r.phoneName);
        }
    }    
}

(<any> safari.extension.globalPage.contentWindow).krSendToPopup = onState;

safari.self['height'] = 800;