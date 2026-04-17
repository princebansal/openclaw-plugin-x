# Native Plugin Wiring Notes

## Current reality
This repo now has:
- a native plugin manifest: `openclaw.plugin.json`
- OpenClaw package metadata in `package.json`
- a buildable SDK entrypoint in `src/plugin-entry.ts`
- buildable typed core logic in `src/`
- durable draft/session/approval scaffold

It still does **not** have end-to-end proof that the plugin entrypoint has been validated against the installed OpenClaw runtime.

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
- but no live install/load validation has been run yet

So the code now looks materially closer to real, but runtime proof is still the missing step.

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
- automatic OAuth callback flow
- media upload transport
- further publish/read hardening

## Recommended immediate implementation order
1. validate plugin discovery
2. validate tool invocation
3. validate plugin config wiring
4. then do remaining X auth/media/runtime hardening
5. finally expand capabilities beyond the current guarded surface
