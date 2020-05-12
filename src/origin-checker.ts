// Copyright 2014 Google Inc. All rights reserved
//
// Use of this source code is governed by a BSD-style
// license that can be found at
// https://developers.google.com/open-source/licenses/bsd

import { int } from 'aws-sdk/clients/datapipeline';

import {ETLD_NAMES_LIST} from './etld_names_list.js';
import {getOriginFromUrl} from './url';

export const BAD_APPID = 2;

/**
 * FIDO AppId (v1.2) 3.1.2.3 & 3.1.2.14
 * @param facet
 * @param appId
 */
function checkCanFacetClaimAppId(facet: string, appId: string): boolean {
    if (appId === facet) {
        return true;
    }
    const appIdOrigin = getOriginFromUrl(appId);
    if (!appIdOrigin) {
        return false;
    }
    const appIdLspl = getLeastSpecificPrivateLabel(appIdOrigin);
    const facetLspl = getLeastSpecificPrivateLabel(facet);
    if (facetLspl === appIdLspl) {
        return true;
    }

    // FIDO-AppID-Redirect-Authorized header handling not implemented, so we allow an exception for Google (gstatic.com)
    if (facetLspl === 'google.com') {
        return appIdLspl === 'gstatic.com';
    }
    return false;
}

/**
 * For WebAuthn rpId checking (5.1.4.1.7)
 * https://html.spec.whatwg.org/multipage/origin.html#is-a-registrable-domain-suffix-of-or-is-equal-to
 * @param originalHost
 * @param hostSuffixString
 */
export function checkIsRegistrableDomainSuffix(origin: string, hostSuffixString: string): boolean {
    if (!hostSuffixString || hostSuffixString === '') {
        return false;
    }
    const originUrl = new URL(origin);
    const originalHost = originUrl.hostname;
    const host = hostSuffixString;
    if (host !== originalHost) {
        const hostLspl = getLeastSpecificPrivateLabel(host);
        const originalHostLspl = getLeastSpecificPrivateLabel(originalHost);
        // Checks that both are domains, and also are not public suffixes
        if (!hostLspl || !originalHostLspl) {
            return false;
        }
        if (!originalHost.endsWith('.' + host)) {
            return false;
        }
    }
    return true;
}

/**
 * Retrieve the contents of the given appId
 * @param appId the appId to GET
 */
export function fetchAppIdUrl(appId: string): Promise<string> {
    return new Promise(function(resolve, reject) {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', appId, true);
        xhr.onloadend = function() {
            if (xhr.status !== 200) {
                reject(xhr.status);
                return;
            }
            resolve(xhr.responseText);
        };
        xhr.onerror = function() {
            // Treat any network-level errors as though the page didn't exist.
            reject(404);
        };
        xhr.send();
    });
}

/**
 * Gets the Least Specific Private Label (eTLD+1) from the given origin
 * @param origin the origin
 */
function getLeastSpecificPrivateLabel(origin: string): string {
    let host;
    if (origin.indexOf('http://') === 0) {
      host = origin.substring(7);
    } else if (origin.indexOf('https://') === 0) {
      host = origin.substring(8);
    } else {
      host = origin;
    }
    if (host.indexOf(':') !== -1) {
      host = host.substring(0, host.indexOf(':'));
    }
    if (host === 'localhost') {
      return host;
    }
    // Loop over each possible subdomain, from longest to shortest, in order to
    // find the longest matching eTLD first.
    let prev = '';
    let next = host;
    while (true) {
      const dot = next.indexOf('.');
      if (dot === -1) { return null; }
      prev = next;
      next = next.substring(dot + 1);
      if (ETLD_NAMES_LIST.indexOf(next) >= 0) {
        return prev;
      }
    }
}

/**
 * Parses the text as JSON and returns it as an array of strings.
 * @param {string} text Input JSON
 * @return {!Array<string>} Array of origins
 */
function getOriginsFromJson(text: string): string[] {
    try {
        let urls;
        const appIdData = JSON.parse(text);
        if (Array.isArray(appIdData)) {
            // Older format where it is a simple list of facets
            urls = appIdData;
        } else {
            const trustedFacets = appIdData['trustedFacets'];
            if (trustedFacets) {
                for (const versionBlock of trustedFacets) {
                    if  (
                            versionBlock['version'] &&
                            versionBlock['version']['major'] === 1 &&
                            versionBlock['version']['minor'] === 0
                        ) {
                        urls = versionBlock['ids'];
                        break;
                    }
                }
            }
            if (typeof urls === 'undefined') {
            throw Error('Could not find trustedFacets for version 1.0');
            }
        }
        const origins = {};
        for (const url of urls) {
            const origin = getOriginFromUrl(url);
            if (origin) {
                // Enforce only HTTPS origins for Trusted Facets per FIDO AppId & Facet (v1.2) 3.1.2.12
                // TODO: allow for valid mobile facets as well
                if (origin.indexOf('https://') === 0) {
                    origins[origin] = origin;
                }
            }
        }
        return Object.keys(origins);
    } catch (e) {
        console.error('could not parse ' + text);
        return [];
    }
}

/**
 * FIDO AppId (v1.2) 3.1.2.10-13
 */
async function getTrustedFacetsFromAppId(appId: string, remainingRetryAttempts: int, fetcher): Promise<string[]> {
    // Sanity/safety checks
    {
        if (remainingRetryAttempts <= 0) {
            return [];
        }
        if (!appId) {
            return Promise.resolve([]);
        }

        if (appId.indexOf('http://') === 0) {
            console.error('http app ids not allowed');
            return Promise.resolve([]);
        }

        const origin = getOriginFromUrl(appId);
        if (!origin) {
            return Promise.resolve([]);
        }
    }
    // Fetch TrustedFacetsList
    {
        const text = fetcher(appId);
        const facets = await text.then(getOriginsFromJson, async function(rc_) {
            const rc = (rc_);
            console.error('fetching ' + appId + ' failed: ' + rc);
            if (!(rc >= 400 && rc < 500)) {
              // Retry
              await new Promise((resolve) => setTimeout(resolve, 1000));
              return getTrustedFacetsFromAppId(appId, remainingRetryAttempts - 1, fetcher);
            }
            return [];
        });

        // FIDO AppID & Facet (v1.2) 3.1.2.14
        return facets.map((facet) => facet.toLowerCase())
                     .filter((facet) => checkCanFacetClaimAppId(facet, appId));
    }
}

/**
 * Resolve or reject based on whether the given facetId and appId are valid
 * @param facetId the origin of the request
 * @param appId the URL to the Trusted Facets list
 */
export async function verifyU2fAppId(facetId: string, appId: string, fetcher): Promise<void> {
    // Since origins are to be compared in lowercase,
    // lowercase the facetId and the origin component of the AppID.
    if (appId) {
        const appIdOrigin = getOriginFromUrl(appId);
        if (appIdOrigin == null) {
            return Promise.reject("appId '" + appId + "' does not have a valid origin");
        }
        const appIdNonOrigin = appId.substring(appIdOrigin.length, appId.length);
        appId = appIdOrigin.toLowerCase() + appIdNonOrigin;
    }
    facetId = facetId.toLowerCase();

    if (appId === facetId) {
        // FIDO AppID & Facet (v1.2) 3.1.2.1
        return Promise.resolve();
    }

    if (!appId) {
        // FIDO AppID & Facet (v1.2) 3.1.2.2
        return Promise.resolve();
    }

    // FIDO AppID & Facet (v1.2) 3.1.2.3
    if (!checkCanFacetClaimAppId(facetId, appId)) {
        return Promise.reject('FacetID cannot claim given AppID ' + appId);
    }

    const trustedFacets = await getTrustedFacetsFromAppId(appId, 5, fetcher);

    if (trustedFacets.indexOf(facetId) === -1) {
        // FIDO AppId & Facet (v1.2) 3.1.2.16
        return Promise.reject('Trusted Facets list does not include the requesting FacetID ' + facetId);
    }

    return Promise.resolve();
}
