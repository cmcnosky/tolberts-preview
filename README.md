# Tolbert’s restaurant redesign preview

Public website: https://cmcnosky.github.io/tolberts-preview/

Owner-facing comparison: https://cmcnosky.github.io/tolberts-preview/proposal.html

This is an independent preview, not the restaurant’s official website. The official domain and systems have not been modified. The preview is public and marked noindex. Source provenance and limits are in research.html, operations.html, and audit.html.

## Preview locally

Run `python3 -m http.server 4175` in this folder and open http://localhost:4175/.

## Update the menu

Edit approved data in menu-data.json, then run `python3 scripts/build-menu.py`. The renderer preserves the page shell and regenerates all dish entries, category counts, and category options. Update the displayed checked date only after checking the authoritative menu. The owner must resolve conflicting PDF/SpotOn item details before an official launch.

## Release checks

- `node tests/menu-search.cjs`
- `node tests/calendar-audit.cjs`
- `node tests/music-model.cjs`
- `node --test tests/owner-model.test.cjs`
- `python3 scripts/check-site.py`

Also check the home, menu, music finder, show links, contact draft, and owner proposal in a browser at mobile and desktop sizes. Verify the live calendar and its clearly labeled fallback behavior.

## Publish and ownership

GitHub Pages serves this repository’s main branch root. Publish the reviewed commit, wait for the Pages deployment to succeed, and verify the live URL and primary tasks. Preserve the previous commit for rollback. This static preview is independent of the earlier private hosted Site; they do not update automatically together.

The current integration reads Tolbert’s public WordPress event feed in the visitor’s browser. A production engagement needs owner-approved access, content/update ownership, form delivery, analytics, structured data, redirects, image permissions, and launch testing. These are proposed work, not completed integrations or an agreed contract.

## Presentation finish — November 4, 2026

`guest-finish.css` aligns the menu/music navigation and type with the retained homepage aesthetic. `music.js` provides filter reset and preserves show-link keyboard focus when the live list refreshes. `proposal.html` and `operations.html` are the current owner-review materials; the November 2 PDF and comparison captures remain dated evidence. Header/navigation text is present in all three guest-page shells, so check those together when changing destinations.


## Interactive owner demo — November 5, 2026

Start at the main GitHub Pages website and choose **More → Login** at any screen width. The homepage, menu, and music pages share the same in-site sign-in dialog. Initial demo username and password are both `Steven` (case-sensitive). This is a public, browser-local UI demonstration, not authentication or authorization for production systems. Do not enter private business records or reuse a real password.

The owner room supports menu editing/availability, show editing/photos, weekly and special hours, sample stock counts, a draft → simulated submission → received purchase-order lifecycle, illustrative team roles, activity, settings, and a browser-local password change. Only the Steven demo login works; team entries do not create accounts. No vendor, POS, CMS, payment, or email connection is used by owner actions.

State is stored under `tolberts-owner-demo-v1` in this browser. The demo session uses sessionStorage; a changed demo password is stored as a SHA-256 digest, which is not a production password scheme or security boundary. Settings → Reset demo restores the starting records and `Steven` password. Clearing browser site data does the same.

Successful sign-in opens the owner workspace in the same tab. **Guest website** returns to the restaurant site, where **More → Login** returns to the signed-in workspace; **Guest preview** shows local edits. Logging out returns to the homepage with a signed-out confirmation. Direct `owner.html` bookmarks retain a fallback sign-in and a visible way back to the restaurant.

Guest preview links use `?owner-preview=1` to render this browser's edited menu, events, hours, and contact details. Normal guest URLs continue using the public menu and official calendar integration. The preview flag and local edits do not travel to another person's browser.

Validation: `node --test tests/owner-model.test.cjs` plus the existing site checks above. Stock and supplier prices in this demo are fictional examples. Published event/menu records are only starting content; demo edits are never published as restaurant facts.

## End-to-end audit — November 5, 2026

The calendar keeps names and times from the official REST feed and resolves artist artwork through the official public GraphQL endpoint. The November 5 saved fallback contains 13 events and 13 unchanged local promotional images for November 5–15. Existing browser-local owner edits remain intact; resetting the demo loads the latest packaged baseline.

This revision repairs stale-editor overwrites across tabs, strengthens saved-state and stock-receipt validation, improves keyboard names/focus/skip links, removes research-table sideways scrolling, and completes social metadata for all eight pages. Browser checks and their limits are recorded in audit.html. The current release passes 60 individual regression cases: 13 feed, 7 menu, 19 music model, and 21 owner model. The Node combined runner additionally counts the three legacy suite files as wrapper tests; do not add those wrappers to the individual total.

## Shared login — November 5, 2026

`owner-access.js` and `owner-access.css` provide one generic Login link inside More on each guest page. More is available at every screen width. There are no standalone login links in the public header or footer, and no owner-room promotion on the homepage. The login dialog uses ordinary account wording; existing Steven demo access and the signed-in management workspace remain available.

Full desktop navigation remains above 1100px. Its More menu contains only the additional destinations; below that breakpoint More also contains the primary navigation. The logo and tagline sit together on a brighter, more saturated green background (#A6CC70), limited to their brand block. The logo uses a warmer burnt-orange treatment. The dark tagline is weight 800 in the site’s Barlow Condensed typeface: 11.5px on desktop and 12px in two lines on phones. Desktop headers stay 78px tall; phone headers use 76px to fit the readable caption. Hero, artist imagery, green visit strip, and Playing Today remain as established.

Verify More → Login on home, menu, and music across narrow and wide layouts, Escape/focus return, Steven sign-in, guest return, logout, and the absence of horizontal overflow. Tests and production boundaries are documented above and in audit.html.

## Final audit follow-up — November 5, 2026

The management preview now offsets sticky menu controls, sidebar, and root anchor scroll padding by the measured preview-banner height. This was checked after scrolling on phone and desktop layouts. The owner model now rejects costs, stock values, and order quantities above the interface limits, rejects unsafe order totals, and refuses an over-limit receipt before changing inventory. Two regression cases cover the repaired numeric-state failures.

The browser pass covered all eight pages and all nine owner sections at 320/390/768/1280px, six editor dialogs at 320px, guest search/filter/share/inquiry flows, login, saved content previews, and the simulated purchase lifecycle. Heading semantics, research favicon/theme metadata, audit theme metadata, and private-event inquiry wording were also corrected. The approved visual treatment and single More → Login entrance are preserved. Published delivery verification is recorded with the source package.
