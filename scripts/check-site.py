#!/usr/bin/env python3
"""Source-only integrity checks for the Tolbert's static-site export.

The checker intentionally uses only Python's standard library. It does not make
network requests or run JavaScript, so it is suitable for a fast release gate.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from typing import Iterable
from urllib.parse import unquote, urlsplit


SITE_ROOT = Path(__file__).resolve().parents[1]
MENU_DATA = SITE_ROOT / "menu-data.json"
MENU_PAGE = SITE_ROOT / "menu.html"

VOID_ELEMENTS = {
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
}
REFERENCE_ATTRIBUTES = {"href", "src", "poster", "action"}
ARIA_IDREF_ATTRIBUTES = {
    "aria-activedescendant",
    "aria-controls",
    "aria-describedby",
    "aria-details",
    "aria-errormessage",
    "aria-flowto",
    "aria-labelledby",
    "aria-owns",
}
EXTERNAL_SCHEMES = {"data", "http", "https", "mailto", "sms", "tel"}


@dataclass
class Node:
    tag: str
    attrs: dict[str, str | None]
    line: int
    parent: "Node | None" = None
    children: list["Node | str"] = field(default_factory=list)

    def class_tokens(self) -> set[str]:
        return set((self.attrs.get("class") or "").split())

    def descendants(self) -> Iterable["Node"]:
        for child in self.children:
            if isinstance(child, Node):
                yield child
                yield from child.descendants()

    def text(self) -> str:
        parts: list[str] = []

        def collect(node: "Node") -> None:
            for child in node.children:
                if isinstance(child, Node):
                    collect(child)
                else:
                    parts.append(child)

        collect(self)
        return normalize_space("".join(parts))


class PageParser(HTMLParser):
    """Small source DOM sufficient for link, ID, ARIA, alt, and menu checks."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("#document", {}, 1)
        self.stack = [self.root]
        self.nodes: list[Node] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._add_node(tag, attrs, push=tag not in VOID_ELEMENTS)

    def handle_startendtag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        self._add_node(tag, attrs, push=False)

    def _add_node(
        self, tag: str, attrs: list[tuple[str, str | None]], *, push: bool
    ) -> None:
        node = Node(tag, dict(attrs), self.getpos()[0], self.stack[-1])
        self.stack[-1].children.append(node)
        self.nodes.append(node)
        if push:
            self.stack.append(node)

    def handle_endtag(self, tag: str) -> None:
        # HTMLParser is deliberately non-validating. Recover to the closest open
        # matching element so the source tree remains useful for these checks.
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data: str) -> None:
        self.stack[-1].children.append(data)


@dataclass(frozen=True)
class Issue:
    path: Path
    line: int
    message: str

    def display(self) -> str:
        relative = self.path.relative_to(SITE_ROOT)
        return f"{relative}:{self.line}: {self.message}"


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def parse_page(path: Path, issues: list[Issue]) -> PageParser | None:
    parser = PageParser()
    try:
        parser.feed(path.read_text(encoding="utf-8"))
        parser.close()
    except (OSError, UnicodeError) as exc:
        issues.append(Issue(path, 1, f"cannot parse UTF-8 source: {exc}"))
        return None
    return parser


def dynamic_aria_target_allowed(page: Path, node: Node, attribute: str, target: str) -> bool:
    """Allow the one title inserted by music.js before the show dialog opens."""
    return (
        page.name in {"index.html", "music.html"}
        and node.tag == "dialog"
        and node.attrs.get("id") == "show-dialog"
        and attribute == "aria-labelledby"
        and target == "show-title"
    )


def check_page_structure(
    path: Path, parser: PageParser, issues: list[Issue]
) -> set[str]:
    id_nodes: dict[str, list[Node]] = {}

    for node in parser.nodes:
        if "id" in node.attrs:
            identifier = node.attrs["id"]
            if not identifier:
                issues.append(Issue(path, node.line, "empty id attribute"))
            elif identifier != identifier.strip() or re.search(r"\s", identifier):
                issues.append(
                    Issue(path, node.line, f"id contains whitespace: {identifier!r}")
                )
            else:
                id_nodes.setdefault(identifier, []).append(node)

        if node.tag == "img" and "alt" not in node.attrs:
            source = node.attrs.get("src") or "(no src)"
            issues.append(Issue(path, node.line, f"image is missing alt: {source}"))

    for identifier, nodes in id_nodes.items():
        if len(nodes) > 1:
            lines = ", ".join(str(node.line) for node in nodes)
            issues.append(
                Issue(path, nodes[1].line, f"duplicate id {identifier!r} on lines {lines}")
            )

    identifiers = set(id_nodes)
    for node in parser.nodes:
        for attribute in ARIA_IDREF_ATTRIBUTES:
            if attribute not in node.attrs:
                continue
            raw_value = node.attrs[attribute]
            targets = (raw_value or "").split()
            if not targets:
                issues.append(Issue(path, node.line, f"{attribute} has no target"))
                continue
            for target in targets:
                if target in identifiers or dynamic_aria_target_allowed(
                    path, node, attribute, target
                ):
                    continue
                owner = node.attrs.get("id") or node.tag
                issues.append(
                    Issue(
                        path,
                        node.line,
                        f"{attribute} on {owner!r} targets missing id {target!r}",
                    )
                )

    return identifiers


def srcset_urls(value: str) -> Iterable[str]:
    """Yield ordinary (non-data) URLs from an HTML srcset value."""
    for candidate in value.split(","):
        candidate = candidate.strip()
        if not candidate:
            continue
        url = candidate.split()[0]
        if not url.startswith("data:"):
            yield url


def local_references(parser: PageParser) -> Iterable[tuple[Node, str, str]]:
    for node in parser.nodes:
        for attribute in REFERENCE_ATTRIBUTES:
            value = node.attrs.get(attribute)
            if value is not None:
                yield node, attribute, value
        srcset = node.attrs.get("srcset")
        if srcset:
            for value in srcset_urls(srcset):
                yield node, "srcset", value


def resolve_local_target(source: Path, url_path: str) -> Path:
    decoded = unquote(url_path)
    if decoded.startswith("/"):
        # This export is deployed below a project path. Root-relative references
        # would silently leave that path, so callers report them as nonportable.
        return SITE_ROOT.parent / "__root_relative_reference__" / decoded.lstrip("/")
    target = (source.parent / decoded).resolve() if decoded else source.resolve()
    if target.is_dir():
        target /= "index.html"
    return target


def check_local_references(
    pages: dict[Path, PageParser],
    page_ids: dict[Path, set[str]],
    issues: list[Issue],
) -> int:
    checked = 0
    root = SITE_ROOT.resolve()

    # Take a snapshot because a future root page may link by fragment to an
    # additional HTML file that must be parsed and cached during this pass.
    for page, parser in list(pages.items()):
        for node, attribute, value in local_references(parser):
            try:
                parsed = urlsplit(value)
            except ValueError as exc:
                issues.append(
                    Issue(page, node.line, f"invalid {attribute} URL {value!r}: {exc}")
                )
                continue

            scheme = parsed.scheme.lower()
            if scheme in EXTERNAL_SCHEMES or parsed.netloc:
                continue
            if scheme:
                # Other named schemes are not filesystem references.
                continue
            if parsed.path.startswith("/"):
                issues.append(
                    Issue(
                        page,
                        node.line,
                        f"root-relative {attribute} is not portable from the project path: {value!r}",
                    )
                )
                continue

            target = resolve_local_target(page, parsed.path)
            checked += 1
            try:
                target.relative_to(root)
            except ValueError:
                issues.append(
                    Issue(page, node.line, f"local {attribute} escapes the site root: {value!r}")
                )
                continue

            if not target.is_file():
                issues.append(
                    Issue(page, node.line, f"missing local {attribute} target: {value!r}")
                )
                continue

            if not parsed.fragment:
                continue
            if target.suffix.lower() not in {".html", ".htm"}:
                continue

            target_parser = pages.get(target)
            if target_parser is None:
                target_parser = parse_page(target, issues)
                if target_parser is None:
                    continue
                pages[target] = target_parser
                page_ids[target] = check_page_structure(target, target_parser, issues)

            fragment = unquote(parsed.fragment)
            if fragment not in page_ids[target]:
                issues.append(
                    Issue(
                        page,
                        node.line,
                        f"fragment {fragment!r} is missing from {target.relative_to(root)}",
                    )
                )

    return checked


def first_descendant(node: Node, *, tag: str | None = None, class_name: str | None = None) -> Node | None:
    for child in node.descendants():
        if tag is not None and child.tag != tag:
            continue
        if class_name is not None and class_name not in child.class_tokens():
            continue
        return child
    return None


def nearest_menu_group(node: Node) -> str:
    parent = node.parent
    while parent is not None:
        if parent.tag == "section" and "menu-group" in parent.class_tokens():
            return normalize_space(parent.attrs.get("data-group") or "")
        parent = parent.parent
    return ""


def check_menu(parser: PageParser, issues: list[Issue]) -> tuple[int, int]:
    try:
        data = json.loads(MENU_DATA.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        issues.append(Issue(MENU_DATA, 1, f"cannot read menu JSON: {exc}"))
        return 0, 0

    if not isinstance(data, list):
        issues.append(Issue(MENU_DATA, 1, "menu JSON root must be a list"))
        return 0, 0
    if len(data) != 71:
        issues.append(Issue(MENU_DATA, 1, f"expected 71 menu entries; found {len(data)}"))

    expected: list[tuple[str, str, str, str]] = []
    for index, item in enumerate(data, start=1):
        if not isinstance(item, dict):
            issues.append(Issue(MENU_DATA, 1, f"entry {index} is not an object"))
            continue
        fields: dict[str, str] = {}
        valid = True
        for key in ("category", "name", "description", "price"):
            value = item.get(key)
            if not isinstance(value, str):
                issues.append(
                    Issue(MENU_DATA, 1, f"entry {index} field {key!r} must be a string")
                )
                valid = False
            else:
                fields[key] = normalize_space(value)
        if not valid:
            continue
        if not fields["category"] or not fields["name"]:
            issues.append(
                Issue(MENU_DATA, 1, f"entry {index} requires a category and name")
            )
            continue
        expected.append(
            (
                fields["category"],
                fields["name"],
                fields["description"],
                fields["price"] or "Ask for current pricing",
            )
        )

    item_nodes = [
        node
        for node in parser.nodes
        if node.tag == "article" and "menu-item" in node.class_tokens()
    ]
    if len(item_nodes) != 71:
        issues.append(
            Issue(MENU_PAGE, 1, f"expected 71 rendered .menu-item entries; found {len(item_nodes)}")
        )

    actual: list[tuple[str, str, str, str]] = []
    for index, node in enumerate(item_nodes, start=1):
        heading = first_descendant(node, tag="h3")
        description = first_descendant(node, tag="p")
        price = first_descendant(node, class_name="item-price")
        if heading is None:
            issues.append(Issue(MENU_PAGE, node.line, f"rendered entry {index} has no h3"))
        if price is None:
            issues.append(
                Issue(MENU_PAGE, node.line, f"rendered entry {index} has no .item-price")
            )
        category = normalize_space(node.attrs.get("data-category") or "")
        group = nearest_menu_group(node)
        if group != category:
            issues.append(
                Issue(
                    MENU_PAGE,
                    node.line,
                    f"rendered entry {index} category {category!r} is inside group {group!r}",
                )
            )
        actual.append(
            (
                category,
                heading.text() if heading else "",
                description.text() if description else "",
                price.text() if price else "",
            )
        )

    for index, (wanted, rendered) in enumerate(zip(expected, actual), start=1):
        if wanted != rendered:
            issues.append(
                Issue(
                    MENU_PAGE,
                    item_nodes[index - 1].line,
                    f"rendered entry {index} differs from menu-data.json: expected {wanted!r}; found {rendered!r}",
                )
            )

    if len(expected) != len(actual):
        issues.append(
            Issue(
                MENU_PAGE,
                1,
                f"menu JSON/rendered entry count differs: {len(expected)} vs {len(actual)}",
            )
        )

    return len(data), len(item_nodes)


def main() -> int:
    issues: list[Issue] = []
    html_paths = sorted(SITE_ROOT.glob("*.html"))
    if not html_paths:
        print(f"FAIL: no root HTML pages found in {SITE_ROOT}")
        return 1

    pages: dict[Path, PageParser] = {}
    page_ids: dict[Path, set[str]] = {}
    for path in html_paths:
        resolved = path.resolve()
        parser = parse_page(resolved, issues)
        if parser is None:
            continue
        pages[resolved] = parser
        page_ids[resolved] = check_page_structure(resolved, parser, issues)

    reference_count = check_local_references(pages, page_ids, issues)
    menu_parser = pages.get(MENU_PAGE.resolve())
    menu_json_count = menu_html_count = 0
    if menu_parser is None:
        issues.append(Issue(MENU_PAGE, 1, "menu page was not parsed"))
    else:
        menu_json_count, menu_html_count = check_menu(menu_parser, issues)

    if issues:
        print(f"FAIL: {len(issues)} source-integrity issue(s)")
        for issue in issues:
            print(f"- {issue.display()}")
        return 1

    id_count = sum(len(identifiers) for identifiers in page_ids.values())
    print(
        "PASS: "
        f"{len(html_paths)} root HTML pages; "
        f"{reference_count} local references; "
        f"{id_count} unique IDs; "
        f"menu JSON/HTML {menu_json_count}/{menu_html_count} entries."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
