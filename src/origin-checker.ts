// Copyright 2014 Google Inc. All rights reserved
//
// Use of this source code is governed by a BSD-style
// license that can be found at
// https://developers.google.com/open-source/licenses/bsd

import {ETLD_NAMES_LIST} from './etld_names_list.js'; 
import {getOriginFromUrl} from './url';
import { resolve } from 'url';
import { resolveCname } from 'dns';
import { int } from 'aws-sdk/clients/datapipeline';

/**
 * FIDO AppId (v1.2) 3.1.2.3 & 3.1.2.14
 * @param origin 
 * @param appId 
 */
function checkCanOriginClaimAppId(origin : string, appId : string) : boolean {
    if(appId == origin) {
        return true;
    }
    var appIdOrigin = getOriginFromUrl(appId);
    if (!appIdOrigin)
        return false;
    var appIdLspl = getLeastSpecificPrivateLabel(appIdOrigin);
    var originLspl = getLeastSpecificPrivateLabel(origin);
    if (originLspl == appIdLspl)
        return true;

    //FIDO-AppID-Redirect-Authorized header handling not implemented, so we allow an exception for Google (gstatic.com)
    if (originLspl == 'google.com')
        return appIdLspl == 'gstatic.com';
    return false;
}

/**
 * For WebAuthn rpId checking (5.1.4.1.7)
 * https://html.spec.whatwg.org/multipage/origin.html#is-a-registrable-domain-suffix-of-or-is-equal-to
 * @param originalHost 
 * @param hostSuffixString 
 */
export function checkIsRegistrableDomainSuffix(origin : string, hostSuffixString : string) : boolean {
    if(!hostSuffixString || hostSuffixString == "") {
        return false;
    }
    let originUrl = new URL(origin);
    let originalHost = originUrl.host;
    let host = hostSuffixString;
    if(host != originalHost) {
        let hostLspl = getLeastSpecificPrivateLabel(host);
        let originalHostLspl = getLeastSpecificPrivateLabel(originalHost);
        //Checks that both are domains, and also are not public suffixes
        if(!hostLspl || !originalHostLspl) {
            return false;
        }
        if(!originalHost.endsWith('.'+host)) {
            return false;
        }
    }
    return true;
}

/**
 * Retrieve the contents of the given appId
 * @param appId the appId to GET
 */
function fetchAppIdUrl(appId: string) : Promise<string> {
    return new Promise(function(resolve,reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', appId, true);
        xhr.onloadend = function() {
            if (xhr.status != 200) {
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
function getLeastSpecificPrivateLabel(origin: string) : string {
    var host;
    if (origin.indexOf('http://') == 0) {
      host = origin.substring(7);
    } else if (origin.indexOf('https://') == 0) {
      host = origin.substring(8);
    } else {
      host = origin;
    }
    if (host.indexOf(':') != -1) {
      host = host.substring(0, host.indexOf(':'));
    }
    if (host == 'localhost') {
      return host;
    }
    // Loop over each possible subdomain, from longest to shortest, in order to
    // find the longest matching eTLD first.
    var prev = '';
    var next = host;
    while (true) {
      var dot = next.indexOf('.');
      if (dot == -1) return null;
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
function getOriginsFromJson(text : string) : Array<string> {
    try {
        var urls, i;
        var appIdData = JSON.parse(text);
        if (Array.isArray(appIdData)) {
            // Older format where it is a simple list of facets
            urls = appIdData;
        } else {
            var trustedFacets = appIdData['trustedFacets'];
            if (trustedFacets) {
            var versionBlock;
            for (i = 0; versionBlock = trustedFacets[i]; i++) {
                if (versionBlock['version'] &&
                    versionBlock['version']['major'] == 1 &&
                    versionBlock['version']['minor'] == 0) {
                urls = versionBlock['ids'];
                break;
                }
            }
            }
            if (typeof urls == 'undefined') {
            throw Error('Could not find trustedFacets for version 1.0');
            }
        }
        var origins = {};
        var url;
        for (i = 0; url = urls[i]; i++) {
            var origin = getOriginFromUrl(url);
            if (origin) {
                //Enforce only HTTPS origins for Trusted Facets per FIDO AppId & Facet (v1.2) 3.1.2.12
                //TODO: allow for valid mobile facets as well
                if(origin.indexOf('https://') == 0) {
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
async function getTrustedFacetsFromAppId(appId: string, remainingRetryAttempts: int) : Promise<Array<string>> {
    // Sanity/safety checks
    {
        if(remainingRetryAttempts <= 0) {
            return [];
        }
        if (!appId) {
            return Promise.resolve([]);
        }
        
        if (appId.indexOf('http://') == 0) {
            console.log('http app ids not allowed');
            return Promise.resolve([]);
        }
        
        var origin = getOriginFromUrl(appId);
        if (!origin) {
            return Promise.resolve([]);
        }
    }
    // Fetch TrustedFacetsList
    {
        var text = fetchAppIdUrl(appId);

        var facets = await text.then(getOriginsFromJson, async function(rc_) {
            var rc = (rc_);
            console.log('fetching ' + appId + ' failed: ' + rc);
            if (!(rc >= 400 && rc < 500)) {
              // Retry
              await new Promise(resolve => setTimeout(resolve, 1000));
              return getTrustedFacetsFromAppId(appId, remainingRetryAttempts - 1);
            }
            return [];
        });

        //FIDO AppID & Facet (v1.2) 3.1.2.14
        return facets.map(string => string.toLowerCase())
                     .filter(facet => checkCanOriginClaimAppId(facet, appId));
    }
}

export async function getU2fVerifiedAppId(origin: string, appId: string) : Promise<string> {
    if(origin)
        origin = origin.toLowerCase();
    if(appId)
        appId = appId.toLowerCase();
    if(appId == origin) {
        //FIDO AppID & Facet (v1.2) 3.1.2.1
        return Promise.resolve(appId);
    }

    if(!appId) {
        //FIDO AppID & Facet (v1.2) 3.1.2.2
        return Promise.resolve(origin);
    }

    //FIDO AppID & Facev (v1.2) 3.1.2.3
    if(!checkCanOriginClaimAppId(origin, appId)) {
        return Promise.reject('origin cannot claim given appId ' + appId);
    }

    var trustedFacets = await getTrustedFacetsFromAppId(appId, 5);

    if(trustedFacets.indexOf(origin) == -1) {
        //FIDO AppId & Facet (v1.2) 3.1.2.16
        return Promise.reject('Trusted Facets list does not include the request origin ' + origin);
    }

    return Promise.resolve(appId);
}