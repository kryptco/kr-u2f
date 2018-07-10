import $ from 'jquery';

import { Request, RequestType, Message } from './messages';
import { stringify, parse } from './krjson';
import { equals } from './crypto';

$(document).ready(async () => {
    
    var pair = document.getElementById("pairScreen");

    onPopupOpen();
    pollState();

    $('#unpairButton').click(async () => {
        pair.classList.remove("remove");

        chrome.runtime.sendMessage(await stringify(
            Message.newRequest(new Request(RequestType.unpair))
        ));
    });
});

async function onPopupOpen() {
    let m = new Message();
    m.request = new Request(RequestType.refreshPopup);
    chrome.runtime.sendMessage(await stringify(m));
}

async function pollState() {
    let poll = async () => {
        if (!document.hasFocus()) {
            return;
        }
        let m = new Message();
        m.request = new Request(RequestType.getState);
        chrome.runtime.sendMessage(await stringify(m));
    };
    await poll();
    setInterval(poll, 1000);
}

var isFirstTimeOpen = true;
var lastQrCode = null;

chrome.runtime.onMessage.addListener(async (msg, sender) => {
    var launch = document.getElementById("launch");
    var pair = document.getElementById("pairScreen");
    var accounts = document.getElementById("accounts");

    let m = await parse(Message, msg);

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
});