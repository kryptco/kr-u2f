// Cross-browser extension storage

import {Browser , browser as detectBrowser} from './browser';

let initialized = false;
export let getImpl = function(item: string): Promise<string> {
    return new Promise((res, rej) => {
        if (!initialized) {
            throw new Error('Not loaded');
        }
        res('');
    });
};

export let setImpl = function(key: string, v: string): Promise<void> {
    return new Promise((res, rej) => {
        if (!initialized) {
            throw new Error('Not loaded');
        }
        res(null);
    });
};

async function init() {
    if (initialized) {
        return;
    }
    switch (detectBrowser()) {
        //  use Edge storage polyfill
        case Browser.edge:
        case Browser.chrome: {
            getImpl = function(item: string) {
                return new Promise(async (res, rej) => {
                    chrome.storage.local.get(item, function(items) {
                        res(items[item]);
                    });
                });
            };
            setImpl = function(k: string, v: any) {
                const o = {};
                o[k] = v;
                return new Promise((res, _) => {
                    chrome.storage.local.set(o, res);
                });
            };
            break;
        }
        case Browser.safari: {
            getImpl = function(item: string) {
                return new Promise((res, rej) => {
                    res(
                        safari.extension.secureSettings.getItem(item),
                    );
                });
            };
            setImpl = function(k: string, v: any) {
                return new Promise((res, rej) => {
                    res(
                        safari.extension.secureSettings.setItem(k, v),
                    );
                });
            };
            break;
        }
        case Browser.firefox: {
            getImpl = function(item: string) {
                return browser.storage.local.get(item).then((items) => items[item]).then((v) => v as string);
            };
            setImpl = function(k: string, v: string) {
                const obj = {};
                obj[k] = v;
                return browser.storage.local.set(obj);
            };
            break;
        }
        default: { throw new Error('Unsupported browser'); }
    }

    initialized = true;
}

export async function get(k: string): Promise<string> {
    await init();
    const v = getImpl(k);
    return v;
}

export async function set(key: string, v: any): Promise<void> {
    await init();
    return await setImpl(key, v);
}
