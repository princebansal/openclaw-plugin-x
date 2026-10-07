# openclaw-plugin-x

Draft-first X/Twitter management plugin for OpenClaw.

ClawHub: [OpenClaw X Plugin](https://clawhub.ai/princebansal/plugins/openclaw-plugin-x)

Companion workflow: [X Management skill](https://clawhub.ai/princebansal/skills/x-management)

Source: [GitHub repository](https://github.com/princebansal/openclaw-plugin-x)

## Release notes

### 0.2.18
- Let the user choose automatic Gateway callback or manual paste-back when starting OAuth.
- For automatic callback mode, announce the result through OpenClaw's originating session workflow API; no channel-specific transport is used.
- Keep manual completion independent of callback exchange. X OAuth 2.0 still requires its redirect URI to be registered in the Developer Portal; paste-back avoids depending on a reachable Gateway callback listener, not redirect-URI registration.
- Refresh the declared build and plugin SDK target to OpenClaw 2026.9.8 while retaining minimum Gateway/plugin API compatibility at 2026.5.28.
- Verify both OAuth modes live on OpenClaw 2026.9.8 using isolated temporary account slots; no posts or media were sent.

### 0.2.17
- Add an OpenClaw Gateway OAuth callback route with PKCE state validation, account-bound matching, a ten-minute expiry, and one-time callback claiming; keep manual completion as a fallback.
- Declare the callback route through the supported `registerHttpRoute` API and align OAuth endpoint/scope config metadata with the runtime schema.

### 0.2.16
- Refresh the declared build and plugin SDK target to OpenClaw 2026.9.7.
- Keep the existing minimum Gateway/API compatibility at 2026.5.28; this release is built and checked against the latest stable release, without needlessly dropping older compatible hosts.
- Clarify the compatibility check and release-validation boundary.

### 0.2.15
- Rebuild the published `dist/` artifact so the packaged tool description accurately identifies the live X media upload side effect.

### 0.2.14
- Correct the `x_media_upload` tool label and description: invoking it uploads the specified local file to X; it is not a validation-only action.
- Clarify that media uploads are immediate external actions while post publishing remains approval-gated.

### 0.2.13
- Refresh ClawHub package metadata: remove obsolete manifest fields while retaining provider environment declarations in `setup.providers`.
- Add direct links to the ClawHub plugin and companion skill listings.
- No runtime behavior changes.

This package has been proven locally for the core draft-first workflow:
- OAuth PKCE connect flow with a user-selected automatic Gateway callback or manual code/redirect paste-back mode
- authenticated reads
- follower-list reads
- account-scoped recent search and user timeline search
- durable local drafts
- explicit approval recording
- approval-gated publish for single posts and threads
- media upload and media-backed publish
- multi-account OAuth sessions with account-bound drafts and publish checks

It is **real**, but it is **not fully productized** yet. The main remaining gaps are live engagement actions and continued packaged-runtime validation after each release.

## Current status

### Proven working locally
- OAuth auth URL generation, PKCE callback handling, and selectable manual paste-back completion
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
- live engagement actions for like / repost / bookmark
- deeper conversation expansion beyond immediate referenced posts
- broader public-release validation beyond local/manual QA

## Safety model

This plugin is intentionally draft-first:
- create/reply/quote/thread actions create stored drafts
- `x_post_approve` records explicit approval
- `x_post_publish` only performs a live write for an already-approved draft with valid user credentials
- `x_media_upload` immediately sends the specified local file to X; it does not create a media-upload draft

Approval remains mandatory by design.

## Requirements
- OpenClaw 2026.9.8 host runtime: Node.js 24.16.0+ on Node 24, or 26.1.0+.
- The plugin package itself declares Node.js 22+ in `engines`; the host's runtime requirement takes precedence when running inside OpenClaw.
- OpenClaw version compatible with the package metadata in `package.json`
- Your own X developer app credentials for OAuth-based account access

### OpenClaw compatibility
This source release targets OpenClaw 2026.9.8 and declares that build/API baseline in `package.json`. Its minimum compatible Gateway/plugin API remains 2026.5.28. The current Gateway (2026.9.8) loaded the plugin, and both callback and paste-back OAuth flows were verified live. ClawHub runtime validation passed for 2026.9.8; the packed archive was installed in an isolated directory and its plugin entry, config schema, OAuth tools, and callback route loaded successfully. OpenClaw's plugin APIs are experimental, so re-check them when adopting a newer host release.

Important: this plugin is generic, but OAuth is not shared. Each user installing the plugin should configure their own X developer app credentials. The auth URL is generated from the credentials configured in that user's OpenClaw runtime, not from a generic shared app.

Registry trust note:
- this plugin requires user-supplied X OAuth credentials
- it persists session state and drafts to local JSON files
- recommended stable paths are outside the plugin install directory under `~/.openclaw/state/openclaw-plugin-x/`
- if a registry scanner flags undeclared credentials or persistence, the right fix is to make those runtime expectations explicit, not to hide them

## Install

### Option A: local/path install during development
```bash
cd openclaw-plugin-x
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
5. Start OAuth with `x_account_auth_url` and choose one of two modes:
   - `callback`: approve in the browser; OpenClaw completes the exchange automatically and announces the result in the conversation that started authorization.
   - `paste_back`: approve in the browser, then paste the full redirect URL or code into `x_account_complete`.
6. X OAuth 2.0 requires the redirect URI in the authorization request to be registered on the X app. Paste-back does not depend on the Gateway callback route completing the exchange, but it does not bypass X's redirect-URI registration requirement.

For callback mode, register a Gateway URL ending in `/openclaw-plugin-x/oauth/callback` as the X app callback URL, then set the exact same URL as `redirectUri`. The callback accepts GET requests, requires the unexpired PKCE state created for that exact account, claims it once, and returns a static page without echoing OAuth parameters. The callback route is public (`auth: "plugin"`) by design because the X redirect cannot carry Gateway credentials; the unguessable, short-lived OAuth state is the admission check. On completion, the plugin schedules a channel-agnostic announcement back to the session that initiated authorization. If OpenClaw cannot reach that session, the browser page says so and the connection can be checked with `x_account_me`.

In `paste_back` mode, the plugin does not exchange an OAuth callback automatically. If the browser redirects to the Gateway route, it displays instructions to paste the redirect URL or code into the originating OpenClaw conversation and call `x_account_complete`. If the callback is unreachable, paste the final URL/code from the browser address bar.

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
  "redirectUri": "https://gateway.example.com/openclaw-plugin-x/oauth/callback",
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
npm run build
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
- OAuth automatic completion requires the exact callback URI to be registered with X and reachable by the authorizing browser
- engagement actions are plan-only today
- only approved drafts can be published live today
- API publish eligibility is still constrained by X platform policy and account permissions, not just plugin approval state
- API replies may be rejected for accounts that have not mentioned or otherwise engaged with you; in live testing this surfaced as X API `403 Forbidden` with: `Reply to this conversation is not allowed because you have not been mentioned or otherwise engaged by the author of the post you are replying to.`
- for outreach/distribution, quote posts or manual in-app replies may work when API replies are blocked
- repeat packed-artifact load validation after future releases
- follower-list reads require the OAuth session to include `follows.read`; older sessions created before that scope was added must reconnect

## Release notes for maintainers
- Manual release checks live in `docs/release-checklist.md`
- Current implementation truth/status lives in `docs/implementation-status.md`
- Capability-by-capability status lives in `docs/capability-matrix.md`

## License
MIT
