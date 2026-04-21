# openclaw-plugin-x

Draft-first X/Twitter management plugin for OpenClaw.

This package has been proven locally for the core single-account workflow:
- OAuth PKCE connect flow with manual code/redirect completion
- authenticated reads
- durable local drafts
- explicit approval recording
- approval-gated publish for single posts and threads
- media upload and media-backed publish

It is **real**, but it is **not fully productized** yet. The main remaining gaps are release polish, install/load validation in a public-facing runtime path, and automatic OAuth callback handling.

## Current status

### Proven working locally
- OAuth auth URL generation and manual completion
- session persistence and token refresh handling
- `x_account_me`
- `x_timeline_me`
- `x_timeline_mentions`
- `x_post_get`
- `x_post_context`
- `x_post_create`
- `x_post_reply`
- `x_post_quote`
- `x_post_thread` as durable draft creation
- `x_post_approve`
- `x_post_publish` for approved single-post drafts and approved thread drafts
- `x_media_upload`
- media-backed single-post publish
- X/Twitter post URL resolution

### Not done yet
- automatic OAuth callback HTTP handling inside OpenClaw
- live engagement actions for like / repost / bookmark
- deeper conversation expansion beyond immediate referenced posts
- broader public-release validation beyond local/manual QA

## Safety model

This plugin is intentionally draft-first:
- create/reply/quote/thread actions create stored drafts
- `x_post_approve` records explicit approval
- `x_post_publish` only performs a live write for an already-approved draft with valid user credentials

Approval remains mandatory by design.

## Requirements
- Node.js 22+
- OpenClaw version compatible with the package metadata in `package.json`
- Your own X developer app credentials for OAuth-based account access

Important: this plugin is generic, but OAuth is not shared. Each user installing the plugin should configure their own X developer app credentials. The auth URL is generated from the credentials configured in that user's OpenClaw runtime, not from a generic shared app.

Registry trust note:
- this plugin requires user-supplied X OAuth credentials
- it persists session state and drafts to local JSON files
- recommended stable paths are outside the plugin install directory under `~/.openclaw/state/openclaw-plugin-x/`
- if a registry scanner flags undeclared credentials or persistence, the right fix is to make those runtime expectations explicit, not to hide them

## Install

### Option A: local/path install during development
```bash
cd projects/openclaw-plugin-x
npm install
npm run check
npm run build
```

Then install/load it through your OpenClaw plugin flow using the built package directory.

### Option B: packed/published package
This repository includes the package metadata and native OpenClaw manifest needed for external distribution:
- `package.json`
- `openclaw.plugin.json`

It also currently ships `plugin.manifest.json` for compatibility with the existing local release flow.

Before public publication, do one more install/load validation from the packed artifact, not just from the source tree.

## Setup

1. Copy the example env file and fill in the values you actually need.
2. Build the plugin.
3. Configure/load it in OpenClaw.
4. Run `x_account_connect` to inspect readiness.
5. Start OAuth with `x_account_auth_url`.
6. Complete OAuth with `x_account_complete` using either the auth code or the full redirect URL.

### Example env bring-up
```bash
cp env.example .env
npm run build
```

### Environment variables
Required for OAuth flow:
- `X_CLIENT_ID`
- `X_CLIENT_SECRET`
- `X_REDIRECT_URI`

Commonly needed:
- `X_BEARER_TOKEN`
- `X_ACCESS_TOKEN`
- `X_REFRESH_TOKEN`
- `X_USER_ID`

Defaults exist, but may be overridden when needed:
- `X_API_BASE_URL`
- `X_UPLOAD_API_BASE_URL`
- `X_OAUTH_AUTHORIZE_URL`
- `X_OAUTH_TOKEN_URL`
- `X_OAUTH_SCOPES`
- `X_DRAFTS_FILE_PATH`
- `X_SESSION_FILE_PATH`

Important: do not point `X_SESSION_FILE_PATH` or `X_DRAFTS_FILE_PATH` inside the plugin install directory under `~/.openclaw/extensions/...`. OpenClaw plugin updates replace that directory and will wipe plugin-local files stored there.

These files may contain sensitive OAuth session material, including access tokens and refresh tokens when OAuth connect is used. Treat them as local secrets and keep them in a user-private path.

Recommended stable paths:
- `X_SESSION_FILE_PATH=~/.openclaw/state/openclaw-plugin-x/session.json`
- `X_DRAFTS_FILE_PATH=~/.openclaw/state/openclaw-plugin-x/drafts.json`

Typical scope set now includes:
- `tweet.read`
- `tweet.write`
- `users.read`
- `offline.access`
- `media.write`

## Tool surface

### Auth / account
- `x_account_connect`
- `x_account_auth_url`
- `x_account_complete`
- `x_account_me`

### Read
- `x_timeline_me`
- `x_timeline_mentions`
- `x_post_get`
- `x_post_context`
- `x_util_resolve_url`

### Draft / approval / publish
- `x_post_create`
- `x_post_reply`
- `x_post_quote`
- `x_post_thread`
- `x_post_approve`
- `x_post_publish`

### Media
- `x_media_upload`

### Scaffold-only engagement
- `x_engagement_like`
- `x_engagement_repost`
- `x_engagement_bookmark`

## Development
```bash
npm run check
npm run build
npm pack --dry-run
```

## Publish path
Recommended public release flow:

```bash
clawhub package publish <source> --dry-run
clawhub package publish <source>
```

Where `<source>` can be a local folder, `owner/repo`, `owner/repo@ref`, or a GitHub URL.

For consumers:

```bash
openclaw plugins install clawhub:<package-name>
```

This plugin is designed to pair with an agent-side skill such as `x-management` for the full draft-first workflow.

## Known limitations
- plugin drafts are local plugin drafts, not X-native drafts shown in X apps
- OAuth completion is currently manual; automatic callback handling is not implemented
- engagement actions are plan-only today
- only approved drafts can be published live today
- public install/load validation still needs one clean pass from the distributable artifact

## Release notes for maintainers
- Manual release checks live in `docs/release-checklist.md`
- Current implementation truth/status lives in `docs/implementation-status.md`
- Capability-by-capability status lives in `docs/capability-matrix.md`

## License
MIT
