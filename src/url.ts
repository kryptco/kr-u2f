// Copyright 2014 Google Inc. All rights reserved
//
// Use of this source code is governed by a BSD-style
// license that can be found at
// https://developers.google.com/open-source/licenses/bsd

/**
 * Gets the scheme + origin from a web url.
 * @param {string} url Input url
 * @return {?string} Scheme and origin part if url parses
 */
export function getOriginFromUrl(url: string): string | null {
    const re = new RegExp('^(https?://)[^/]+/?');
    const originarray = re.exec(url);
    if (originarray == null) { return null; }
    let origin = originarray[0];
    while (origin.charAt(origin.length - 1) === '/') {
        origin = origin.substring(0, origin.length - 1);
    }
    return origin;
}

export function getDomainFromOrigin(origin: string): string {
    return origin.replace(new RegExp('^https?://'), '')
        .replace(new RegExp(':[0-9]+$'), '');
}
