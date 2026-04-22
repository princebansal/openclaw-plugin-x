# Capability Matrix

| Capability | Tool/action | Status now | Notes |
| --- | --- | --- | --- |
| Account config bring-up | `x.account.connect` | Implemented | Returns readiness, plan, draft path, session path, and current session state |
| OAuth auth URL generation | `x.account.auth_url` | Implemented | Generates/stores PKCE pending state |
| OAuth manual completion | `x.account.complete` | Implemented | Accepts code or redirect URL; callback HTTP route still not wired |
| Authenticated profile read | `x.account.me` | Implemented | Calls `/2/users/me` with user auth |
| Persistent draft create | `x.post.create` | Implemented | Stores durable draft record |
| Persistent reply draft | `x.post.reply` | Implemented | Requires target id/url |
| Persistent quote draft | `x.post.quote` | Implemented | Requires target id/url |
| Persistent thread draft | `x.post.thread` | Implemented | Stores ordered draft steps |
| Explicit approval record | `x.post.approve` | Implemented | Marks stored draft as approved |
| Approved single-post publish | `x.post.publish` | Implemented, constrained by X policy | Real X write path; requires approved draft + valid user token, but some reply publishes can still be rejected by X policy/account restrictions even after plugin approval |
| Media upload | `x.media.upload` | Implemented, proven | Chunked v2 upload flow with metadata/alt text |
| URL resolution | `x.util.resolve_url` | Implemented | Supports x.com and twitter.com post URLs |
| Own timeline read | `x.timeline.me` | Implemented, proven | Fetches latest own tweets with normalization |
| Mentions read | `x.timeline.mentions` | Implemented, proven | Fetches latest mentions with normalization |
| Get post by id/url | `x.post.get` | Implemented, proven | Resolves url optionally, fetches one post, normalizes response |
| Get post + immediate context | `x.post.context` | Implemented | Returns root post plus immediate referenced tweets |
| Like / unlike | `x.engagement.like` | Stubbed | Planning only |
| Repost / undo repost | `x.engagement.repost` | Stubbed | Planning only |
| Bookmark / remove bookmark | `x.engagement.bookmark` | Stubbed | Planning only |
| OAuth callback flow | internal auth | Partial | Manual completion exists; automatic callback handling does not |
| Thread publish | future write path | Not implemented | Current publish path only supports single-post drafts |
| OpenClaw SDK tool registration | plugin entrypoint | Implemented, proven locally | Buildable entrypoint exists and active plugin behavior was validated in-session |
