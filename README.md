# DEPRECATED

**This project is not maintained.** Please migrate to [Akamai MFA](https://mfa.akamai.com/help).

# Krypton for Browsers (U2F + WebAuthN)
Krypton brings Universal Second Factor (U2F) + WebAuthn to the browser using keys
stored in the __Krypton__ ([iOS](https://github.com/kryptco/krypton-ios) or
[Android](https://github.com/kryptco/krypton-android)) mobile app. _The
private keys never leave the phone._

Supports Google Chrome, Mozilla Firefox, and Safari.

# Install

### Chrome/Chromium
Install [Krypton Authenticator](https://chrome.google.com/webstore/detail/madlgmccpddkhohkdobabokeecnjonhl) from the Chrome Extension Store.

### Firefox
Install [Krypton Authenticator](https://addons.mozilla.org/firefox/addon/krypton-authenticator/) from Firefox Add-ons.

### Safari
Install [Krypton Authenticator](https://apps.apple.com/us/app/krypton-authenticator-desktop/id1512484779?ls=1) from the Mac App Store.

# Build Dependencies
- [nodeJS](https://nodejs.org/en/download/)
- [npm](https://www.npmjs.com/get-npm)
- [yarn](https://yarnpkg.com/lang/en/docs/install/)

# Install / Run From Source
```
yarn
make build
```

Then:
### Chrome/Chromium
Click the triple-dots in the upper-right > More Tools >
Extensions, enable Developer Mode, click Load Unpacked, then select the `dist/chromium`
folder.

### Firefox
Click on the three bars in the upper-right > Add-ons, in the resulting page click the gear in the upper-right > Install Add-on From File... , then select the `dist/firefox/manifest.json` file.

### Safari
Code coming soon...

# CONTRIBUTING
Check out `CONTRIBUTING.md`

# Security Disclosure Policy
__Krypton__ follows a 7-day disclosure policy. If you find a security flaw,
please send it to `disclose@krypt.co` encrypted to the PGP key with fingerprint
`B873685251A928262210E094A70D71BE0646732C` ([full key
here](https://krypt.co/docs/security/disclosure-policy.html)). We ask that you
delay publication of the flaw until we have published a fix, or seven days have
passed.

# LICENSE
We are currently working on a new license for Krypton. For now, the code
is released under All Rights Reserved.
