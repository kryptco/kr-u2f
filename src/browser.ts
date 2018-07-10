// Cross-browser extension storage

import {isChrome, isSafari, isFirefox} from './browser_detect';

export enum Browser {
    chrome = 'chrome',
    firefox = 'firefox',
    safari = 'safari',
};

export function browser() : Browser {
    if (isFirefox()) {
        return Browser.firefox;
    }
    if (isChrome()) {
        return Browser.chrome;
    }
    if (isSafari()) {
        return Browser.safari;
    }
    throw 'Unknown browser';
}