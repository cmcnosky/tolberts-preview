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
- `python3 scripts/check-site.py`

Also check the home, menu, music finder, show links, contact draft, and owner proposal in a browser at mobile and desktop sizes. Verify the live calendar and its clearly labeled fallback behavior.

## Publish and ownership

GitHub Pages serves this repository’s main branch root. Publish the reviewed commit, wait for the Pages deployment to succeed, and verify the live URL and primary tasks. Preserve the previous commit for rollback. This static preview is independent of the earlier private hosted Site; they do not update automatically together.

The current integration reads Tolbert’s public WordPress event feed in the visitor’s browser. A production engagement needs owner-approved access, content/update ownership, form delivery, analytics, structured data, redirects, image permissions, and launch testing. These are proposed work, not completed integrations or an agreed contract.
