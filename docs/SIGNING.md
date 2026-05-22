# Code signing & notarization

Unsigned builds work, but macOS Gatekeeper and Windows SmartScreen warn on first launch. Signing
removes those warnings. The build config is already signing-ready — you just add your
certificates as **GitHub repository secrets**, and the release workflow signs (and, on macOS,
notarizes) automatically. If the secrets aren't set, the build stays unsigned.

> Signing is **not free**: an Apple Developer Program membership (~$99/yr) and a Windows
> code-signing certificate (or Azure Trusted Signing) are required.

Add secrets under **GitHub → repo → Settings → Secrets and variables → Actions → New secret**.

---

## macOS (sign + notarize)

1. Join the [Apple Developer Program](https://developer.apple.com/programs/).
2. In Xcode or the developer portal, create a **Developer ID Application** certificate and install
   it in your login keychain.
3. Export it from **Keychain Access** as a `.p12` (right-click → Export), setting an export
   password.
4. Base64-encode it:
   ```bash
   base64 -i DeveloperID.p12 | pbcopy
   ```
5. Create an **app-specific password** at [appleid.apple.com](https://appleid.apple.com) (Sign-In
   & Security → App-Specific Passwords), and find your **Team ID** in the developer portal
   (Membership details).
6. Add these repository secrets:

   | Secret | Value |
   | --- | --- |
   | `MAC_CSC_LINK` | the base64 of the `.p12` |
   | `MAC_CSC_KEY_PASSWORD` | the `.p12` export password |
   | `APPLE_ID` | your Apple ID email |
   | `APPLE_APP_SPECIFIC_PASSWORD` | the app-specific password |
   | `APPLE_TEAM_ID` | your 10-character Team ID |

That's it — the release workflow signs with the cert and notarizes via `APPLE_*`. The
`build/entitlements.mac.plist` (hardened runtime) is already configured.

### Caveat: the downloaded upscaler

The Real-ESRGAN binary is downloaded at runtime (not bundled), so it isn't covered by the app's
signature. The app clears its quarantine flag on install and the entitlements include
`disable-library-validation`, which lets a notarized, hardened app run it. If a future macOS
release blocks the spawned binary anyway, the fallback is to **bundle and sign it** (ship it in
`extraResources` and run a `signAndEditExecutables` / `afterSign` step) instead of downloading.

---

## Windows (sign)

Options, cheapest-effort last:

- **Azure Trusted Signing** (recommended) — pay-as-you-go, no physical token; configure via
  `win.azureSignOptions` in `electron-builder.yml`.
- **EV / OV certificate** from a CA (DigiCert, Sectigo, …) exported as `.pfx`.

> Since 2023, standard **OV** certs no longer grant immediate SmartScreen reputation — the warning
> may persist until the signed binary builds reputation. **EV** certs and Azure Trusted Signing
> avoid this.

For a `.pfx` certificate, add:

| Secret | Value |
| --- | --- |
| `WIN_CSC_LINK` | base64 of the `.pfx` |
| `WIN_CSC_KEY_PASSWORD` | the `.pfx` password |

```bash
base64 -w0 cert.pfx          # Linux
base64 -i cert.pfx | pbcopy  # macOS
```

---

## Verifying a signed build

After a release runs, download the artifact and check:

```bash
# macOS
codesign --verify --deep --strict --verbose=2 "PhoxxPhire Proxy.app"
spctl -a -vvv "PhoxxPhire Proxy.app"        # should say "accepted / Notarized Developer ID"

# Windows (PowerShell)
Get-AuthenticodeSignature ".\PhoxxPhire Proxy Setup <version>.exe"
```

## Auto-update note

Auto-update (`electron-updater`) only applies updates to **signed** builds. Once signing is in
place and you publish signed releases, the in-app updater becomes live.
