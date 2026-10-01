# openclaw-plugin-x

Draft-first X/Twitter management plugin for OpenClaw.

ClawHub: [OpenClaw X Plugin](https://clawhub.ai/princebansal/plugins/openclaw-plugin-x)

Companion workflow: [X Management skill](https://clawhub.ai/princebansal/skills/x-management)

Source: [GitHub repository](https://github.com/princebansal/openclaw-plugin-x)

## Release notes

### 0.2.13
- Refresh ClawHub package metadata: remove obsolete manifest fields while retaining provider environment declarations in `setup.providers`.
- Add direct links to the ClawHub plugin and companion skill listings.
- No runtime behavior changes.

This package has been proven locally for the core draft-first workflow:
- OAuth PKCE connect flow with manual code/redirect completion
- authenticated reads
- follower-list reads
- account-scoped recent search and user timeline search
- durable local drafts
- explicit approval recording
- approval-gated publish for single posts and threads
- media upload and media-backed publish
- multi-account OAuth sessions with account-bound drafts and publish checks

It is **real**, but it is **not fully productized** yet. The main remaining gaps are automatic OAuth callback handling and continued packaged-runtime validation after each release.

## Current status

### Proven working locally
- OAuth auth URL generation and manual completion
- session persistence and token refresh handling
- `x_account_me`
- `x_followers_list`
- `x_posts_search`
- `x_user_posts_search`
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
- live publish from a non-default account using explicit `accountId`
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
- `follows.read`
- `offline.access`
- `media.write`

Important: if you upgrade from an older plugin build that did not request `follows.read`, existing sessions must reconnect through the OAuth flow before follower-list reads will work.

### Multiple accounts

Account-sensitive tools accept an optional `accountId`. If omitted, the plugin uses `default`.

You can configure per-account overrides under `accounts` while keeping shared defaults at the top level:

```json
{
  "clientId": "shared-client-id",
  "clientSecret": "shared-client-secret",
  "redirectUri": "http://127.0.0.1:8787/x/callback",
  "sessionFilePath": "~/.openclaw/state/openclaw-plugin-x/session.json",
  "draftsFilePath": "~/.openclaw/state/openclaw-plugin-x/drafts.json",
  "accounts": {
    "personal": {},
    "life": {
      "userId": "123"
    }
  }
}
```

Each OAuth session is stored by exact `accountId`, and every draft is stamped with the account that created it. Approval and publish reject mismatched accounts, so a draft from one account cannot be accidentally published from another.

Important: `accountId` is a local slot id, not the X username unless you choose to make it one. Similar ids such as `dontdieeveryday` and `dont-die-everyday` can point at different persisted sessions. Always verify a non-default account with `x_account_me({ accountId })` before publishing.

## Tool surface

### Auth / account
- `x_account_connect`
- `x_account_auth_url`
- `x_account_complete`
- `x_account_me`

### Read
- `x_followers_list` (`userId?`, `maxResults?`, `paginationToken?`, `allPages?`, `maxPages?`)
- `x_posts_search` (`query`, `maxResults?`, `paginationToken?`) - authenticated recent X search, not a full archive search
- `x_user_posts_search` (`query`, `userId?`, `maxResults?`, `maxPages?`, `limit?`, `paginationToken?`) - account/user timeline search for older own-post lookup
- `x_timeline_me` (`maxResults?`, `paginationToken?`)
- `x_timeline_mentions` (`maxResults?`, `paginationToken?`)
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

### Follower tracking pattern
- call `x_followers_list` with `allPages: true` when you need a full follower snapshot
- if the response returns `partial: true`, continue with `nextPaginationToken`
- compare the returned `usernames` list against your stored prior snapshot to detect unfollowers

### Post search pattern
- use `x_posts_search` for X recent search with an account-scoped user token; it follows X recent-search semantics and may not find older posts
- use `x_user_posts_search` when you need to find older posts from one account timeline, especially "find my own old post about..." workflows
- `x_user_posts_search` paginates `/2/users/:id/tweets` and does local AND-token text matching, which is useful for "find my own older post about X" workflows
- if the response returns `partial: true`, continue with `nextPaginationToken` or increase `maxPages`

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
clawhub package validate . --openclaw-version <target-openclaw-version>
clawhub package publish . --version <version> --changelog "<release summary>" --tags latest
```

`clawhub package publish` accepts the validated package folder (or a GitHub source); keep the ClawHub CLI current and follow its current help output when preparing a release.

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
- API publish eligibility is still constrained by X platform policy and account permissions, not just plugin approval state
- API replies may be rejected for accounts that have not mentioned or otherwise engaged with you; in live testing this surfaced as X API `403 Forbidden` with: `Reply to this conversation is not allowed because you have not been mentioned or otherwise engaged by the author of the post you are replying to.`
- for outreach/distribution, quote posts or manual in-app replies may work when API replies are blocked
- public install/load validation still needs one clean pass from the distributable artifact
- follower-list reads require the OAuth session to include `follows.read`; older sessions created before that scope was added must reconnect

## Release notes for maintainers
- Manual release checks live in `docs/release-checklist.md`
- Current implementation truth/status lives in `docs/implementation-status.md`
- Capability-by-capability status lives in `docs/capability-matrix.md`

## License
MIT
