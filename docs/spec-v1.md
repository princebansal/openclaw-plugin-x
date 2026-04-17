# OpenClaw X Plugin — v1 Spec

## Goal
Provide a draft-first, approval-gated OpenClaw plugin foundation for managing an X/Twitter account from OpenClaw.

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
- single-post guarded publish primitive

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
- api base url
- approval mode
- optional draft store location
- optional session store location

### Durable local store
Use a minimal local file store now, later replaceable with runtime store / sqlite:
- pending drafts
- approval state
- timestamps
- minimal metadata

### Session/ephemeral state
For OAuth and runtime handoff work:
- PKCE verifier
- OAuth state
- short-lived callback context

## UX model
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
- media upload transport
- deeper read/context expansion

### Phase 4
- harden guarded publish path
- extend publish beyond single-post drafts if needed
- document setup and connection flow
