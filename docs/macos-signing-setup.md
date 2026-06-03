---
topics: [desktop, macos, signing, notarization]
doc_kind: runbook
created: 2026-06-02
---

# macOS Signing Setup

This is the required setup for customer-installable OpenTeam macOS builds.
Branch dry-run artifacts are intentionally unsigned and may be blocked by
Gatekeeper. Customer builds require Developer ID signing and Apple notarization.

## Required Apple Assets

- Active Apple Developer Program membership.
- `Developer ID Application` certificate for the Apple team.
- Apple ID with access to the team.
- App-specific password for that Apple ID.
- Apple Team ID.

## Export The Signing Certificate

If you use the repo helper flow, the CSR is generated at:

```bash
mkdir -p ~/.openteam-signing
chmod 700 ~/.openteam-signing
openssl genrsa -out ~/.openteam-signing/openteam-developer-id.key 2048
chmod 600 ~/.openteam-signing/openteam-developer-id.key
openssl req -new \
  -key ~/.openteam-signing/openteam-developer-id.key \
  -out ~/.openteam-signing/openteam-developer-id.certSigningRequest \
  -subj "/emailAddress=YOUR_APPLE_ID_EMAIL,CN=OpenTeam Developer ID,C=CN"
```

Upload `~/.openteam-signing/openteam-developer-id.certSigningRequest` when
Apple asks for a certificate request file. Download the resulting
`Developer ID Application` certificate to `~/Downloads/developerID_application.cer`.

On the Mac where the `Developer ID Application` certificate is installed:

1. Open Keychain Access.
2. Select `login` keychain and `My Certificates`.
3. Find `Developer ID Application: <Name> (<TEAM_ID>)`.
4. Expand it and confirm the private key is present.
5. Export the certificate plus private key as `mac-codesign.p12`.
6. Set a strong export password.

Convert the p12 file to a GitHub secret value:

```bash
base64 -i mac-codesign.p12 | pbcopy
```

Or use the helper script to convert the downloaded `.cer`, build the p12, and
set all GitHub Actions secrets without printing secret values:

```bash
pnpm run desktop:configure-mac-signing -- \
  --certificate ~/Downloads/developerID_application.cer
```

## Configure GitHub Secrets

Set these repository secrets:

```bash
gh secret set MAC_CSC_LINK --repo yulong-me/OpenTeam
gh secret set MAC_CSC_KEY_PASSWORD --repo yulong-me/OpenTeam
gh secret set APPLE_ID --repo yulong-me/OpenTeam
gh secret set APPLE_APP_SPECIFIC_PASSWORD --repo yulong-me/OpenTeam
gh secret set APPLE_TEAM_ID --repo yulong-me/OpenTeam
```

Values:

- `MAC_CSC_LINK`: base64 text copied from `mac-codesign.p12`.
- `MAC_CSC_KEY_PASSWORD`: p12 export password.
- `APPLE_ID`: Apple account email.
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific password, not the normal Apple ID password.
- `APPLE_TEAM_ID`: 10-character Apple Developer Team ID.

Verify the secrets exist:

```bash
gh secret list --repo yulong-me/OpenTeam
```

## Publish A Signed Release

1. Update `package.json` version.
2. Commit the version bump.
3. Create and push a matching tag:

```bash
git tag v0.1.2
git push origin v0.1.2
```

The `Desktop Release` workflow then runs in publish mode. The publish preflight
fails if the tag does not match `package.json` exactly, or if any signing secret
is missing.

## Required Evidence

The signed release is not complete until the workflow proves all of this:

- `desktop:preflight` passes with `DESKTOP_PUBLISH_MODE=always`.
- Electron Builder signs the `.app` with Developer ID.
- Apple notarization succeeds.
- macOS `dmg`, updater `zip`, and `latest-mac.yml` are published to the GitHub Release.
- `desktop:verify-artifacts` passes in publish mode and finds `app-update.yml`.
- `desktop:verify-signing` passes `codesign`, `stapler`, `spctl`, and `hdiutil verify`.
- `desktop:verify-installability` mounts the dmg, copies `OpenTeam.app`, applies a quarantine marker, and passes `codesign`, `stapler`, and `spctl`.
- A downloaded release dmg opens without removing quarantine attributes.

## Why Dry-Run Builds Fail For Customers

Dry-run branch builds do not use Developer ID signing or notarization. On recent
macOS versions, especially macOS 26, Gatekeeper can report these apps as
damaged, incomplete, or from an unknown developer. That is expected for dry-run
artifacts and is not acceptable for customer distribution.
