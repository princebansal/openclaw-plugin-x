# Release Checklist

Use this before any public npm/plugin-manifest/ClawHub-style release.

## 1. Metadata and packaging
- [ ] `package.json` version is intentional
- [ ] `package.json` description matches actual capabilities
- [ ] packaged files include `dist`, manifests, `README.md`, `env.example`, and `LICENSE`
- [ ] `openclaw.plugin.json` version matches `package.json`
- [ ] `plugin.manifest.json` version matches `package.json`
- [ ] tool names in manifests match the implemented router surface
- [ ] no private credentials or machine-specific paths are committed

## 2. Build and typecheck
- [ ] `npm install`
- [ ] `npm run check`
- [ ] `npm run build`
- [ ] build output exists under `dist/`

## 3. Install/load validation
- [ ] test installation from the packed artifact or installable package, not only the source tree
- [ ] confirm OpenClaw discovers the plugin entrypoint successfully
- [ ] confirm the plugin config schema renders/loads as expected
- [ ] confirm at least one tool invocation succeeds after install

## 4. Auth validation
- [ ] `x_account_connect` reports an honest readiness plan
- [ ] `x_account_auth_url` returns a usable auth URL
- [ ] `x_account_complete` succeeds via auth code or redirect URL
- [ ] refreshed session persists to the configured session store

## 5. Read-path smoke test
- [ ] `x_account_me`
- [ ] `x_timeline_me`
- [ ] `x_timeline_mentions`
- [ ] `x_post_get`
- [ ] `x_post_context`
- [ ] `x_util_resolve_url`

## 6. Draft/approval/publish smoke test
- [ ] `x_post_create`
- [ ] `x_post_reply`
- [ ] `x_post_quote`
- [ ] `x_post_thread` creates a durable thread draft
- [ ] `x_post_approve`
- [ ] `x_post_publish` succeeds for an approved single-post draft, or the release notes/README clearly document any current X-side policy restrictions observed during publish attempts
- [ ] `x_post_publish` succeeds for an approved thread draft

## 7. Media smoke test
- [ ] `x_media_upload` succeeds for a representative file
- [ ] alt text path works if used
- [ ] media-backed single-post publish succeeds

## 8. Honesty check before release
- [ ] README does not imply automatic OAuth callback support
- [ ] README does not imply live engagement actions exist
- [ ] README describes thread publish honestly and does not overstate its validation level
- [ ] implementation-status docs still match reality
- [ ] known limitations are still accurate

## 9. Optional final packaging checks
- [ ] run `npm pack` and inspect the tarball contents
- [ ] verify install instructions against a fresh machine or clean workspace
- [ ] tag/release notes clearly describe proven vs not-yet-proven behavior
