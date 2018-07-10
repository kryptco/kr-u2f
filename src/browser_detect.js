//  https://stackoverflow.com/questions/9847580/how-to-detect-safari-chrome-ie-firefox-and-opera-browser
export function isChrome() {
    return !!window.chrome;
}
export function isFirefox() {
    return typeof window.InstallTrigger !== 'undefined';
}
export function isSafari() {
    return navigator.userAgent.indexOf("Safari") != -1;
}