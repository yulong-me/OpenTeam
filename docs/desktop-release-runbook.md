---
topics: [desktop, release, auto-update]
doc_kind: runbook
created: 2026-06-02
---

# Desktop Release Runbook

This runbook is the gate for the current macOS only desktop release.

## Release Scope

- macOS: `dmg`, `zip`, `latest-mac.yml`
- Update provider: GitHub Releases
- Runtime data: app user data `runtime/`, not the application bundle

Windows is intentionally out of scope for this release gate.

## Required GitHub Secrets

macOS:

- `MAC_CSC_LINK`
- `MAC_CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

Setup details: [`docs/macos-signing-setup.md`](macos-signing-setup.md).

## Dry-Run Gate

Push branch `codex/desktop-app` or run the `Desktop Release` workflow manually
with:

```text
publish=never
```

Required evidence:

- macOS job passes `desktop:preflight`
- macOS job passes `desktop:verify-artifacts`
- workflow uploads `desktop-macos` with only `OpenCouncil-<version>-<arch>.dmg`

Dry-run branch artifacts are for packaging verification. Because they are not
Developer ID signed and notarized, macOS may show them as damaged after
download. Customer-installable builds require the publish gate below.

## Publish Gate

1. Update `package.json` version.
2. Commit the version bump.
3. Create a matching tag:

```bash
git tag v0.1.1
git push origin v0.1.1
```

`desktop-release-preflight` requires the tag to match `package.json` exactly.

Required release assets:

- macOS `OpenCouncil-<version>-<arch>.dmg`
- macOS `OpenCouncil-<version>-<arch>-mac.zip`
- macOS `latest-mac.yml`
- blockmaps for update artifacts

The `latest-mac.yml` file must reference assets that exist in the same release.

## Update Rehearsal

Before calling a release complete:

1. Install version `vX.Y.Z`.
2. Confirm app data exists under user data `runtime/`.
3. Publish `vX.Y.Z+1` with the workflow.
4. Open the old app and wait for update download.
5. Accept the restart prompt.
6. Confirm the new version starts.
7. Confirm existing rooms, providers, teams, agents, and workspaces remain.

## macOS Local Update Rehearsal

Use this before the signed GitHub release path is available. It simulates the
customer flow with a local HTTP update feed:

1. Build the installable old version:

```bash
DESKTOP_RELEASE_VERSION=0.1.0 \
DESKTOP_UPDATE_URL=http://127.0.0.1:7333/ \
DESKTOP_RELEASE_DIR=release/mac-local-update-old \
pnpm desktop:dist:mac-local-update
```

2. Install `release/mac-local-update-old/OpenCouncil-0.1.0-<arch>.dmg`.
3. Change application code and bump the version.
4. Build the new client with the same update URL:

```bash
DESKTOP_RELEASE_VERSION=0.1.1 \
DESKTOP_UPDATE_URL=http://127.0.0.1:7333/ \
DESKTOP_RELEASE_DIR=release/mac-local-update-new \
pnpm desktop:dist:mac-local-update
```

5. Serve the new update feed:

```bash
pnpm desktop:serve:mac-update release/mac-local-update-new
```

6. Open the installed old app, wait for the update prompt, click `立即升级`,
   and confirm the app restarts as the new version.

This local rehearsal can verify packaging, update metadata, and update download.
The final click-to-install upgrade still requires a trusted macOS signing
certificate. Ad-hoc signed apps may be rejected by Apple System Policy outside a
fully trusted install path, so the signed GitHub workflow remains the source of
truth for customer upgrades.

## Known Non-Goals For First Release

- Windows is not included in the current macOS only release gate.
- macOS universal builds are not included until both x64 and arm64 packaging are verified.
