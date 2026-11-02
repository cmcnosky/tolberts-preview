'use strict';
const MenuSearch = (() => {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'").toLowerCase().trim();
  function textFor({name,description='',price='',category=''}) {
    const aliases = /^(Key Lime Pie|Irish Cream Cheesecake|Seasonal Cobbler a la mode)$/i.test(name) ? 'dessert sweet sweets' : /drinks/i.test(name) ? 'beverage beverages drinks' : '';
    return normalize([name,description,price,category,aliases].join(' '));
  }
  function matches(query,text) { return normalize(query).split(/\s+/).filter(Boolean).every(term => text.includes(term)); }
  return {normalize,textFor,matches};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MenuSearch;
