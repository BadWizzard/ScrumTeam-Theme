---
title: Privacy policy
---

# Privacy policy — Dark Modern for ScrumLaunch Teams

Last updated: 2026-08-25.

**Dark Modern for ScrumLaunch Teams does not collect, transmit, or sell any
user data.**

## What the extension stores

The extension saves exactly one thing: your chosen theme mode (Dark, Light,
or System) and your customized colors, contrast and saturation for the dark
and light themes. This is stored using the standard `chrome.storage.sync`
API, which is:

- **Local to your own Chrome profile** — it is not sent to us or to any
  third party, and we (the extension's author) have no access to it.
- **Synced by Google** across your own signed-in Chrome browsers, the same
  way Chrome syncs your bookmarks or other extension settings, under
  Google's own Chrome Sync privacy terms.

No other data — no browsing history, no page content, no personal
information, no analytics, no telemetry — is read, stored, or transmitted by
this extension.

## Permissions

The extension requests a single permission, `storage`, used only to save the
theme preference described above. Its content script only runs on
`teams.scrumlaunch.com`; it cannot read or act on any other site.

## Remote code

The extension contains no remote code. Everything it runs ships inside the
extension package; nothing is fetched or evaluated at runtime.

## Contact

Questions about this policy can be raised via the project's issue tracker:
https://github.com/BadWizzard/ScrumTeam-Theme
