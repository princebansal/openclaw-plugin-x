# Native Plugin Wiring Notes

## Current reality
This repo now has:
- a native plugin manifest: `openclaw.plugin.json`
- OpenClaw package metadata in `package.json`
- a buildable SDK entrypoint in `src/plugin-entry.ts`
- buildable typed core logic in `src/`
- durable draft/session/approval storage
- a ClawHub-published package
- live validation of authenticated reads, approval-gated publish, and multi-account `accountId` handling

It still needs repeated install/load validation from the distributable artifact as the runtime and package surface evolve.

## Remaining validation risk
A real native plugin entrypoint is only trustworthy when all of these are true:
- `openclaw/plugin-sdk/plugin-entry` resolves during build/runtime
- parameter schema dependencies resolve at runtime
- tool return shapes are accepted by the real runtime contract
- plugin can actually be loaded by OpenClaw via install/path loading

In this repo right now:
- `openclaw` is a package dependency
- `@sinclair/typebox` is installed
- the entrypoint builds locally
- ClawHub package validation/source linking succeeds
- the active local OpenClaw runtime has exercised the tool surface

So the code is real, while packaged-runtime validation remains a release hygiene step.

## Honest next step
### 1. Validate the existing SDK entrypoint
The repo already has `src/plugin-entry.ts` which:
- imports `definePluginEntry` from `openclaw/plugin-sdk/plugin-entry`
- registers the X tool surface explicitly
- delegates execution into `src/router.ts`

### 2. Validate load/install
Then test with one of:
- `openclaw plugins install ./projects/openclaw-plugin-x`
- or plugin path loading via config

### 3. After install works
Proceed to:
- plugin-config-to-runtime wiring validation
- automatic OAuth callback flow (implemented through the Gateway `registerHttpRoute` API)
- further publish/read hardening

## Recommended immediate implementation order
1. validate plugin discovery
2. validate tool invocation
3. validate plugin config wiring
4. then do remaining X auth/media/runtime hardening
5. finally expand capabilities beyond the current guarded surface
