//  https://stackoverflow.com/questions/9847580/how-to-detect-safari-chrome-ie-firefox-and-opera-browser
export function isEdge() {
    // Edge 20+
    return !window.isIE && !!window.StyleMedia;
}
export function isChrome() {
    return !!window.chrome;
}
export function isFirefox() {
    return typeof window.InstallTrigger !== 'undefined';
}
export function isSafari() {
    return navigator.userAgent.indexOf("Safari") != -1;
}