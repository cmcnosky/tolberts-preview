'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Content = require('../owner-content.js');

test('content contract has unique, selector-backed keys and exact defaults', () => {
  assert.equal(new Set(Content.fieldKeys).size, Content.fieldKeys.length);
  assert.equal(new Set(Content.imageKeys).size, Content.imageKeys.length);
  assert.ok(Content.fieldKeys.includes('home.heroHeadline'));
  assert.ok(Content.fieldKeys.includes('menu.pageIntro'));
  assert.ok(Content.fieldKeys.includes('music.pageIntro'));
  assert.ok(Content.imageKeys.includes('home.mainStreetPhoto'));
  for (const item of [...Content.fields, ...Content.images]) {
    assert.ok(item.key);
    assert.ok(item.label);
    assert.ok(item.selector);
    assert.equal(Content.defaults[item.type ? 'content' : 'images'][item.key], item.defaultValue);
  }
});

test('content normalization accepts known keys, bounds text, and ignores unknown keys', () => {
  const normalized = Content.normalizeContent({
    'home.heroIntro': `  ${'x'.repeat(300)}  `,
    'home.heroHeadline': '  First\r\nSecond  ',
    unknown: 'do not retain'
  });
  assert.equal(normalized['home.heroIntro'].length, Content.getField('home.heroIntro').maxLength);
  assert.equal(normalized['home.heroHeadline'], 'First\nSecond');
  assert.equal(Object.hasOwn(normalized, 'unknown'), false);
  assert.equal(Content.normalizeContent(null).constructor, Object);
});

test('link normalization accepts only the configured safe protocol', () => {
  assert.equal(Content.getField('links.contactEmail').textSelector, '#visit .visit-links a[href^="mailto:"]');
  assert.equal(Content.normalizeFieldValue('links.contactEmail', 'new@example.com'), 'new@example.com');
  assert.equal(Content.normalizeFieldValue('links.contactEmail', 'mailto:new@example.com'), Content.defaults.content['links.contactEmail']);
  assert.equal(Content.normalizeFieldValue('links.orderOnline', 'https://example.com/order'), 'https://example.com/order');
  assert.equal(Content.normalizeFieldValue('links.orderOnline', 'javascript:alert(1)'), Content.defaults.content['links.orderOnline']);
});

test('blank editable copy stays blank while absent optional maps preserve the page defaults', () => {
  assert.deepEqual(Content.normalizeContent({}), {});
  assert.deepEqual(Content.normalizeImages({}), {});
  assert.equal(Content.normalizeFieldValue('home.heroIntro', '   '), '');
  assert.deepEqual(Content.normalizeContent({'home.heroIntro': '   '}), {'home.heroIntro': ''});
});

test('image normalization accepts packaged and bounded demo images and rejects other URLs', () => {
  const data = 'data:image/png;base64,AA==';
  assert.equal(Content.normalizeImageValue('home.stagePhoto', 'assets/music-room.webp'), 'assets/music-room.webp');
  assert.equal(Content.normalizeImageValue('home.stagePhoto', data), data);
  assert.equal(Content.normalizeImageValue('home.stagePhoto', 'https://example.com/image.jpg'), Content.defaults.images['home.stagePhoto']);
  assert.equal(Content.normalizeImageValue('unknown', data), '');
  assert.deepEqual(Content.normalizeImages({unknown: data}), {});
});
