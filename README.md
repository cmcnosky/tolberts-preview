# Tolbert’s restaurant redesign preview

Public website: https://cmcnosky.github.io/tolberts-preview/

Owner-facing comparison: https://cmcnosky.github.io/tolberts-preview/proposal.html

This is an independent preview, not the restaurant’s official website. The official domain and systems have not been modified. The preview is public and marked noindex. Source provenance and limits are in research.html, operations.html, and audit.html.

## Current visual release — November 9, 2026

The adopted editorial homepage is now `index.html`. The `home-editorial.html` URL remains a compatible copy; `home-classic.html` preserves the previous design, and `compare-homepages.html` labels the archive and current design explicitly. The white logo, cream/chili-red/gold/deep-green palette, and editorial typography extend through guest pages, account management, and review documents. Existing application scripts, account permissions, backend code, and shared business records are unchanged by this release.

All 11 root pages were checked at 320, 768, and 1280 CSS pixels without horizontal page overflow after the narrow-screen story-heading repair. Browser checks exercised menu and music filters, empty states, show details, copyable links, calendar download, keyboard focus return, and inquiry-draft preparation. Small-text contrast and the visible login action were repaired. Live sign-in, session reload, guest preview, and logout passed. All 12 management sections fit at the same three widths; dish/show/text/photo editors opened and were cancelled without business-data writes. See `audit.html` for this release and separately dated earlier live-write evidence.

The frontend Node runner passes 63 tests, including three legacy wrappers. The individually invoked menu/feed/music suites contain 7/13/24 assertions; do not add those to the combined runner count. The unchanged backend separately passes 14 isolated API tests, and its clean rebuild matches the delivered bundle. These checks are not proof of physical-device compatibility, service uptime, or third-party fulfillment.

## Preview locally

Run `python3 -m http.server 4175` in this folder and open http://localhost:4175/.

## Update the menu

Steven edits the shared live preview through More → Login. Menu changes saved there take priority over the repository’s initial data. The files menu-data.json and events.json are the original seed and outage fallback; editing them alone does not replace the shared database. If updating that fallback, run `python3 scripts/build-menu.py` and verify the checked date against an authoritative source. The owner must resolve conflicting PDF/SpotOn item details before an official launch.

## Release checks

- `node tests/menu-search.cjs`
- `node tests/calendar-audit.cjs`
- `node tests/music-model.cjs`
- `node --test tests/*.cjs`
- `python3 scripts/check-site.py`

Also check the home, menu, music finder, show links, contact draft, and owner proposal in a browser at mobile and desktop sizes. Verify the live calendar and its clearly labeled fallback behavior.

## Publish and ownership

GitHub Pages serves this repository’s main branch root. Publish the reviewed commit, wait for the Pages deployment to succeed, and verify the live URL and primary tasks. Preserve the previous commit for rollback. GitHub Pages serves the public interface. The existing hosted project now supplies the authenticated API, shared database, and photo storage. Deploy and verify backend compatibility before publishing frontend changes that depend on it.

The shared show schedule takes priority. The original WordPress feed remains a fallback only when the shared public workspace cannot be loaded. A production engagement needs owner-approved access, content/update ownership, form delivery, analytics, structured data, redirects, image permissions, and launch testing. These are proposed work, not completed integrations or an agreed contract.

## Presentation finish — November 4, 2026

`guest-finish.css` aligns the menu/music navigation and type with the retained homepage aesthetic. `music.js` provides filter reset and preserves show-link keyboard focus when the live list refreshes. `proposal.html` and `operations.html` are the current owner-review materials; the comparison captures remain dated November 2 evidence. The current decision PDF is the revised November 9 buyer brief. Header/navigation text is present in all three guest-page shells, so check those together when changing destinations.


## Shared owner workspace — November 6, 2026

The GitHub Pages website keeps its existing URL and More → Login entrance. The interface connects to a shared Worker API, D1 records, and R2 photograph storage. Sign in as `Steven` with the private password supplied separately. Credentials are authenticated by the shared account service; the current private access handoff is the source for sign-in details. Do not commit credentials or the private access handoff.

Successful saves update the shared workspace. Guest-facing menu, show, hours, contact, copy, and photo changes are available on ordinary public URLs. A device fetches the shared version after sign-in; no manual export/import is needed to move edits between devices. Open visitor pages check for a newer public revision while idle. A connection failure preserves the packaged guest site and reports failed owner saves honestly.

The API validates full records and uses a conditional database revision update. Outdated edits return a conflict rather than replacing a newer saved copy. Public responses are constructed from an explicit guest-facing projection; inventory, purchasing, staff, schedules, activity, credentials, and sessions are not included. Opaque sessions expire and logout revokes them. The Settings password control changes the shared account password.

Backups export workspace data. Restoring a backup replaces the shared workspace for every signed-in device and its public content for every visitor, following review and a recovery download. Photo references point to the shared object store. Team records remain planning records and do not create additional login accounts. Purchase submission and receiving remain simulations: no supplier, POS, payment, payroll, or notification integration is connected.

Legacy browser-local data is not silently published. It can be exported from the previous source release and deliberately imported through the shared backup workflow after review.

Backend source and operational details are supplied separately with the current deliverables. The restaurant’s official domain and existing systems have not been migrated.

## Historical end-to-end audit — November 5, 2026

The calendar keeps names and times from the official REST feed and resolves artist artwork through the official public GraphQL endpoint. The November 5 saved fallback contains 13 events and 13 unchanged local promotional images for November 5–15. Existing browser-local owner edits remain intact; resetting the demo loads the latest packaged baseline.

This revision repairs stale-editor overwrites across tabs, strengthens saved-state and stock-receipt validation, improves keyboard names/focus/skip links, removes research-table sideways scrolling, and completes social metadata for all eight pages. Browser checks and their limits are recorded in audit.html. The current release passes 60 individual regression cases: 13 feed, 7 menu, 19 music model, and 21 owner model. The Node combined runner additionally counts the three legacy suite files as wrapper tests; do not add those wrappers to the individual total.

## Historical shared login — November 5, 2026

`owner-access.js` and `owner-access.css` provide one generic Login link inside More on each guest page. More is available at every screen width. There are no standalone login links in the public header or footer, and no owner-room promotion on the homepage. The login dialog uses ordinary account wording; existing Steven demo access and the signed-in management workspace remain available.

Full desktop navigation remains above 1100px. Its More menu contains only the additional destinations; below that breakpoint More also contains the primary navigation. The logo and tagline sit together on a brighter, more saturated green background (#A6CC70), limited to their brand block. The logo uses a warmer burnt-orange treatment. The dark tagline is weight 800 in the site’s Barlow Condensed typeface: 11.5px on desktop and 12px in two lines on phones. Desktop headers stay 78px tall; phone headers use 76px to fit the readable caption. Hero, artist imagery, green visit strip, and Playing Today remain as established.

Verify More → Login on home, menu, and music across narrow and wide layouts, Escape/focus return, Steven sign-in, guest return, logout, and the absence of horizontal overflow. Tests and production boundaries are documented above and in audit.html.

## Historical final audit follow-up — November 5, 2026

The management preview now offsets sticky menu controls, sidebar, and root anchor scroll padding by the measured preview-banner height. This was checked after scrolling on phone and desktop layouts. The owner model now rejects costs, stock values, and order quantities above the interface limits, rejects unsafe order totals, and refuses an over-limit receipt before changing inventory. Two regression cases cover the repaired numeric-state failures.

The browser pass covered all eight pages and all nine owner sections at 320/390/768/1280px, six editor dialogs at 320px, guest search/filter/share/inquiry flows, login, saved content previews, and the simulated purchase lifecycle. Heading semantics, research favicon/theme metadata, audit theme metadata, and private-event inquiry wording were also corrected. The approved visual treatment and single More → Login entrance are preserved. Published delivery verification is recorded with the source package.

## Historical browser-local audit - earlier November 6, 2026

The guest appearance is retained. The current saved calendar contains 12 shows checked against the official feed on November 6, with packaged artist artwork. Same-day records with malformed set times no longer break Playing Today. Calendar descriptions avoid duplicate punctuation.

Management writes now restore the last saved state when storage rejects an edit. Saved orders require consistent suppliers and valid lifecycle timestamps; receipts validate before changing stock. Asynchronous editors detect replacement state from another tab. The expanded workspace adds new dishes and categories, per-dish photographs, editable website copy and images, inventory archives, draft-order revision, staff scheduling with overlap checks, and portable backup/restore. The More → Login flow and browser-local simulated purchasing remain as before.

The public business case now opens with five concrete guest benefits and the production deliverables. Earlier audit notes are collapsed and retain their original dates. The release suites pass 85 named cases: 21 music, 13 feed, 7 menu, 31 owner-model, 5 owner-content, and 8 persistence cases. All 12 management sections were checked at actual inner widths of 320, 768, and 1280 CSS pixels—36 recorded layout checks—without horizontal page overflow or broken loaded images. Exercised workflows include a new dish with a new category, price, and fully contained photograph surviving save/reload into Guest preview; an edited homepage introduction surviving preview reload; a saved shift and rejected overlap; real backup and pre-restore recovery downloads; and a sample purchase draft revised from two units/$108 to three units/$162. These remain browser-local demonstrations: they do not publish to the public site, provide secure staff accounts, or connect vendors, payments, real inventory, payroll, or notifications. The checks are not physical-device, screen-reader, security, or production certification.

The published-site follow-up exercised price save/reload/preview, a new dish with a new category and uploaded photograph, actual backup and recovery downloads, and restoration to the original 71 dishes. An ordinary second-tab save closed the older editor and loaded its saved value. The save path now also rereads the stored snapshot before writing, rejecting changes based on an older snapshot even when the storage event has not arrived. The focused persistence suite covers this delayed event, invalid incoming data, inaccessible storage, quota/write failures, rollback, and explicit reset. This check narrows a browser-local race; it does not make localStorage transactional or replace a shared production backend.

## Final review — November 9, 2026

The public proposal and decision PDF now match the supported evaluation, negotiable build price, three included post-launch months, and optional $200/month care offer. The shared calendar is correctly described as the primary source; WordPress and packaged data are fallbacks. Defined self-edit controls are distinct from customization labor. Backup copy now explains photo-store dependencies.

The audit covers eight guest/review routes and twelve management sections at 320, 768, and 1280 CSS pixels, guest search/filter/share/calendar/draft behavior, shared save/reload, uploaded photo persistence, and backup restore with recovery download. Test records were removed and business records matched the baseline afterward, apart from audit activity. The audit page records the exact limits.

Playing Today preserves an ongoing overnight performance after midnight. Frontend/backend validation imposes consistent text/collection bounds without truncating existing records. Deploy the corresponding backend before the frontend. Preserve the owner workspace and provider bindings; the official restaurant systems remain separate.
