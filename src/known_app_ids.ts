export function appIdToShortName(appId: string): string | undefined {
    let mapping = {
        "https://www.gstatic.com/securitykey/origins.json": 'g',
        "https://dashboard.stripe.com/u2f-facets": 's',
        "https://www.dropbox.com/u2f-app-id.json": 'd',
        "www.dropbox.com": 'd',
        "https://github.com/u2f/trusted_facets": 'gh',
        "https://gitlab.com": 'gl',
        "https://demo.yubico.com": 'yd',
        "https://api-9dcf9b83.duosecurity.com": 'dd',
        "https://keepersecurity.com": 'kp',
        "https://id.fedoraproject.org/u2f-origins.json": 'fd',
        "https://vault.bitwarden.com/app-id.json": 'vb',
        "https://bitbucket.org": 'b',
        "https://twitter.com/account/login_verification/u2f_trusted_facets.json": 'tw',
    };

    if (mapping[appId]) {
        return mapping[appId];
    }
    if (appId.startsWith("https://www.facebook.com/u2f/app_id/?uid=")) {
        return 'f';
    }

    return null;
}
