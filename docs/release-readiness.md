# OpenClaw X Plugin, Release Readiness

This is a practical release-readiness assessment for `openclaw-plugin-x`, based on the current repository state and the OpenClaw plugin docs.

## Status summary

### Ready now
- GitHub repo exists and is pushed
- `package.json` contains OpenClaw metadata
- `openclaw.plugin.json` exists
- entrypoint uses `definePluginEntry`
- focused SDK import style is used
- Node engine is aligned to `>=22`
- typecheck passes
- `npm pack --dry-run` passes
- secret audit found no concrete credential values in the repo

### Should fix or validate before public plugin release
- perform a true install/load validation from packed artifact or equivalent installable source
- confirm OpenClaw discovers and loads the plugin cleanly outside the source-tree dev path
- confirm config schema renders/loads correctly in a real install path
- confirm at least one tool call succeeds after that install
- confirm `openclaw.plugin.json` version matches `package.json`
- confirm `plugin.manifest.json` version matches `package.json`
- decide final public publish route for the plugin: ClawHub, npm, or both
- ensure the machine used for plugin publishing has the newer ClawHub CLI if using the documented `clawhub package publish ...` flow

### Nice to have later
- richer manifest metadata for setup/onboarding/discovery if desired
- stronger automated tests instead of only manual smoke validation
- beta-release maintenance workflow after public release

## Doc-aligned checklist for this plugin

### Packaging and metadata
- [x] `package.json` includes `openclaw.extensions`
- [x] `package.json` includes compat/build metadata
- [x] `openclaw.plugin.json` is present
- [x] `definePluginEntry(...)` is used
- [x] focused import paths are used
- [x] `npm pack --dry-run` succeeds
- [ ] `openclaw.plugin.json` version checked against `package.json`
- [ ] `plugin.manifest.json` version checked against `package.json`

### Validation
- [x] `npm run check`
- [x] build artifacts exist
- [ ] packed-artifact install/load validation
- [ ] real post-install tool smoke test in install context

### Runtime honesty
- [x] README states missing automatic OAuth callback handling
- [x] README states engagement actions are not live
- [x] README states thread publish is not implemented
- [x] README frames the plugin as real but not fully productized

### Publish path reality
- Docs say external plugins can be published through ClawHub or npm.
- The current machine's installed `clawhub` CLI is older and supports skill publishing, but does not expose `clawhub package publish`.
- Therefore, plugin release is blocked on either:
  - newer ClawHub CLI, or
  - npm route, or
  - another machine/session with newer ClawHub support.

## Recommendation

### Skill
Publish sooner. It is structurally simple and already in good shape for ClawHub-style release once authenticated.

### Plugin
Treat the GitHub repo as available now, but do one more release-hardening pass before calling it fully public-release ready.

Minimum bar before plugin release:
1. install from packed artifact or equivalent external install path
2. verify plugin discovery/load in OpenClaw
3. run at least one real tool smoke test after install
4. confirm manifest versions align
5. use the final intended publish route cleanly
