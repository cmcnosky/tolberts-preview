#!/usr/bin/env python3
"""Rebuild menu entries and navigation; preserve the reviewed page shell."""
from pathlib import Path
from html import escape
from urllib.parse import quote
import json,re
root=Path(__file__).resolve().parents[1]
items=json.loads((root/'menu-data.json').read_text())
assert isinstance(items,list) and items,'Menu must contain entries'
assert all(isinstance(i,dict) and all(isinstance(i.get(k),str) for k in ['category','name','description','price']) and i['category'] and i['name'] for i in items),'Invalid menu entry'
categories=list(dict.fromkeys(i['category'] for i in items));sections=[]
for n,c in enumerate(categories):
 rows=[]
 for i in [i for i in items if i['category']==c]:
  rows.append(f'<article class="menu-item" data-category="{escape(c)}"><h3>{escape(i["name"])}</h3>'+ (f'<p>{escape(i["description"])}</p>' if i['description'] else '') + f'<div class="item-price">{escape(i["price"]) if i["price"] else "Ask for current pricing"}</div></article>')
 sections.append(f'<section class="menu-group" data-group="{escape(c)}" aria-labelledby="category-{n}"><h2 id="category-{n}">{escape(c)}</h2><div class="dish-grid">'+''.join(rows)+'</div></section>')
options=f'<option value="All dishes">All dishes ({len(items)})</option>'+''.join(f'<option value="{escape(c)}">{escape(c)} ({sum(i["category"]==c for i in items)})</option>' for c in categories)
links=''.join(f'<a href="?category={quote(c)}" data-category="{escape(c)}"'+(' aria-current="true"' if c=='All dishes' else '')+f'>{escape(c)} <span>{len(items) if c=="All dishes" else sum(i["category"]==c for i in items)}</span></a>' for c in ['All dishes']+categories)
p=root/'menu.html';s=p.read_text()
assert s.count('<!-- MENU_START -->')==s.count('<!-- MENU_END -->')==1
s=re.sub(r'(?<=<!-- MENU_START -->).*?(?=<!-- MENU_END -->)',lambda m:''.join(sections),s,flags=re.S)
s=re.sub(r'(<select id="category-select">).*?(</select>)',lambda m:m[1]+options+m[2],s,flags=re.S)
s=re.sub(r'(<nav aria-label="Food categories">).*?(</nav>)',lambda m:m[1]+links+m[2],s,flags=re.S)
s=re.sub(r'(<span id="menu-count" role="status">).*?(</span>)',lambda m:m[1]+f'{len(items)} entries'+m[2],s)
p.write_text(s)
print(f'Rendered {len(items)} entries in {len(categories)} categories. Header, design, and page content preserved.')
