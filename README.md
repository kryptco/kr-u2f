# kr-u2f
__kr-u2f__ brings Universal Second Factor (U2F) to the browser using keys
stored in the __Krypton__ ([iOS](https://github.com/kryptco/krypton-ios) or
[Android](https://github.com/kryptco/krypton-android)) mobile app. _The
private keys never leave the phone._

# Supported Browsers
Currently only Google Chrome is supported. Firefox, Safari, and Edge support
is coming soon!

# Install
Install `kr-u2f` from the [Chrome Extension
Store](https://chrome.google.com/webstore/detail/madlgmccpddkhohkdobabokeecnjonhl).

# Build Dependencies
- [nodeJS](https://nodejs.org/en/download/)
- [npm](https://www.npmjs.com/get-npm)
- [yarn](https://yarnpkg.com/lang/en/docs/install/)

# Install / Run From Source
```
yarn
make build
```
Then in Chrome, click the triple-dots in the upper-right > More Tools >
Extensions, enable Developer Mode, click Load Unpacked, then select the `dist`
folder.

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
