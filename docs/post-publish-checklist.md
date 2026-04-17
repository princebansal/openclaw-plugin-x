# Post-Publish Maintainer Checklist

Use this after the initial public release of `openclaw-plugin-x`.

## 1. Install-path verification
- [ ] install the plugin through the real user-facing install path
- [ ] confirm OpenClaw discovers the plugin entrypoint after install
- [ ] confirm config schema loads and renders correctly
- [ ] confirm at least one tool call succeeds after install

## 2. Documentation verification
- [ ] verify README install instructions work end to end
- [ ] verify ClawHub package metadata looks correct
- [ ] verify GitHub repo links and source references look correct
- [ ] keep capability claims aligned with what is actually implemented

## 3. Runtime validation
- [ ] verify `x_account_connect`
- [ ] verify one read tool in install context
- [ ] verify one draft tool in install context
- [ ] verify approval flow still behaves as intended

## 4. Beta release maintenance
- [ ] watch OpenClaw release tags
- [ ] test against next beta release promptly
- [ ] post status in plugin forum thread
- [ ] open a beta-blocker issue/PR if something breaks

## 5. Housekeeping
- [ ] tag GitHub release when appropriate
- [ ] decide whether npm publication is also needed
- [ ] add more automated tests over time
- [ ] revisit manifest metadata for richer setup/onboarding if useful
