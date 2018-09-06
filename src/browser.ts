// Cross-browser extension storage

import {isChrome, isEdge, isFirefox, isSafari} from './browser_detect';

export enum Browser {
    chrome = 'chrome',
    firefox = 'firefox',
    safari = 'safari',
    edge = 'edge',
}

export function browser(): Browser {
    if (isEdge()) {
        return Browser.edge;
    }
    if (isFirefox()) {
        return Browser.firefox;
    }
    if (isChrome()) {
        return Browser.chrome;
    }
    if (isSafari()) {
        return Browser.safari;
    }
    throw new Error('Unknown browser');
}
