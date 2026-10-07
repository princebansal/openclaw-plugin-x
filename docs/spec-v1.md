# OpenClaw X Plugin — v1 Spec

## Goal
Provide a draft-first, approval-gated OpenClaw plugin foundation for managing one or more X/Twitter accounts from OpenClaw.

## Product stance
- Start Prince-first
- Keep all write operations in draft mode
- Require explicit approval for every post, reply, quote, or thread publish
- Keep live publish guarded behind approval + user auth, then harden it with real endpoint/runtime validation
- Open-source later if the implementation is genuinely clean and useful

## v1 in scope
- account connection/config shape
- persistent draft creation for post / reply / quote / thread
- explicit approval recording
- URL resolution
- media file validation
- normalized error model
- typed internal router and client structure
- native OpenClaw plugin entrypoint
- OAuth/session architecture with durable session persistence and refresh support
- multi-account session storage keyed by exact `accountId`
- account-bound drafts, approval, and publish
- guarded publish primitives for posts, replies, quotes, and threads
- account-scoped recent search and user timeline search
- follower-list reads
- media upload and media-backed publish

## v1 out of scope
- autonomous posting
- DMs
- analytics
- scheduling
- automatic likes/reposts/follows
- stealth background behavior

## Safety model
- all write-intent actions create durable drafts first
- approval is modeled explicitly through `x.post.approve`
- live publish is only eligible through `x.post.publish` after approval and valid user auth
- config sets approval mode to `always`

## Planned tool surface
- `x.account.connect`
- `x.account.auth_url`
- `x.account.complete`
- `x.account.me`
- `x.followers.list`
- `x.posts.search`
- `x.user_posts.search`
- `x.post.create`
- `x.post.reply`
- `x.post.quote`
- `x.post.thread`
- `x.post.approve`
- `x.media.upload`
- `x.timeline.mentions`
- `x.timeline.me`
- `x.post.get`
- `x.post.context`
- `x.engagement.like`
- `x.engagement.repost`
- `x.engagement.bookmark`
- `x.util.resolve_url`

## State model
### Durable config
Use OpenClaw plugin config for:
- client id
- client secret
- redirect uri
- the exact redirect URI must be registered on the X Developer Portal app for both OAuth completion modes
- api base url
- approval mode
- optional per-account overrides under `accounts`
- optional draft store location
- optional session store location

### Durable local store
Use a minimal local file store now, later replaceable with runtime store / sqlite:
- pending drafts
- approval state
- account id for every draft
- timestamps
- minimal metadata

### Session/ephemeral state
For OAuth and runtime handoff work:
- PKCE verifier
- OAuth state
- short-lived callback context

## UX model
### OAuth connection
- X OAuth 2.0 requires the exact `redirectUri` sent in the authorization request to be registered on the X Developer Portal app, regardless of completion mode.
- At authorization start, let the user choose automatic Gateway callback completion or manual paste-back through `x_account_complete`.
- Callback mode additionally requires the registered Gateway callback URL to be reachable from the browser. Paste-back avoids relying on the Gateway callback handler to exchange the code; it does not remove X's redirect-URI registration requirement.

### Draft flow
1. agent gathers context
2. agent creates draft via plugin tool
3. plugin returns draft id + previewable content
4. human approves
5. plugin records approval
6. only then should the guarded publish path be eligible

### Read flow
1. agent fetches mentions / own posts / target post context
2. agent drafts candidate text
3. human approves before anything goes live

## Implementation phases
### Phase 1
- stabilize scaffold
- persistent draft storage
- quote support
- approval recording
- manifest cleanup
- skill authoring

### Phase 2
- real plugin config wiring
- loader/install validation inside the target OpenClaw runtime
- endpoint verification against X API docs/behavior

### Phase 3
- automatic OAuth callback flow
- deeper read/context expansion

### Phase 4
- continue hardening guarded publish path
- add live engagement actions if they can remain approval-gated
- document setup and connection flow
