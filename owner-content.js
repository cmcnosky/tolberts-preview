/* Shared content contract for Tolbert's owner workspace and guest website. */
((root) => {
  'use strict';

  const field = (key, label, selector, defaultValue, type = 'text', maxLength = 240, options = {}) => Object.freeze({
    key,
    label,
    selector,
    defaultValue,
    type,
    maxLength,
    group: options.group || options.section || 'Website text',
    ...options
  });
  const image = (key, label, selector, defaultValue, altKey, captionKey = '') => Object.freeze({
    key,
    label,
    selector,
    defaultValue,
    altKey,
    captionKey,
    group: 'Website photos'
  });

  const fields = Object.freeze([
    field('home.heroHeadline', 'Homepage headline', '.hero-copy > h1', 'Hot chili.\nCold beer.\nLive music.', 'textarea', 100, {render: 'lines', maxLines: 3, emphasisLine: 2, section: 'Homepage'}),
    field('home.heroIntro', 'Homepage introduction', '.hero-copy > p', 'Frank’s Bowl of Red. A band on the Main Street stage. Pull up a chair.', 'textarea', 240, {section: 'Homepage'}),
    field('home.menuHeadline', 'Food-section headline', '#menu .section-heading h2', 'Know\nyour red.', 'textarea', 70, {render: 'lines', maxLines: 2, emphasisLine: 1, section: 'Homepage food'}),
    field('home.menuIntro', 'Food-section introduction', '#menu .heading-aside > p', 'The original family chili. The pinto-bean version. Donkey Tails for the table. This is Tolbert’s.', 'textarea', 300, {section: 'Homepage food'}),
    field('home.musicHeadline', 'Music-section headline', '#music .section-heading h2', 'On the bill.\nAt Tolbert’s.', 'textarea', 70, {render: 'lines', maxLines: 2, emphasisLine: 1, section: 'Homepage music'}),
    field('home.musicIntro', 'Music-section introduction', '#music .heading-aside > p', 'Texas blues, country, and tribute nights. Find your next show below.', 'textarea', 300, {section: 'Homepage music'}),
    field('home.visitEyebrow', 'Visit-section label', '#visit .visit-copy > .eyebrow', 'MAIN STREET AT FRANKLIN', 'text', 80, {section: 'Visit'}),
    field('home.visitHeadline', 'Visit-section headline', '#visit .visit-copy > h2', 'Look for\nthe red sign.', 'textarea', 70, {render: 'lines', maxLines: 2, emphasisLine: 1, section: 'Visit'}),
    field('home.storyEyebrow', 'Story-section label', '#story .story-copy > .eyebrow', 'FROM THE TEXAS FILES', 'text', 80, {section: 'Story'}),
    field('home.storyHeadline', 'Story-section headline', '#story .story-copy > h2', 'A newspaperman.\nA chili parlor.\nA Texas story.', 'textarea', 120, {render: 'lines', maxLines: 3, emphasisLine: 2, section: 'Story'}),
    field('home.storyIntro', 'Story introduction', '#story .story-copy > p:nth-of-type(1)', 'Frank X. Tolbert was a newspaperman, a storyteller, and a champion of Texas chili. He wrote A Bowl of Red and helped launch the first Terlingua chili cook-off in 1967.', 'textarea', 500, {section: 'Story'}),
    field('home.storyHistory', 'Story history', '#story .story-copy > p:nth-of-type(2)', 'In 1976, Frank and his son opened Tolbert’s in Dallas. In 2006, his daughter Kathleen and her husband Paul Ryan brought the family tradition to Grapevine’s Main Street.', 'textarea', 500, {section: 'Story'}),
    field('home.storyClosing', 'Story closing', '#story .story-copy > p:nth-of-type(3)', 'The setting has changed. The family’s Bowl of Red recipe lives on.', 'textarea', 300, {section: 'Story'}),
    field('home.privateEventEyebrow', 'Groups-and-events label', '#groups .gather-content > .eyebrow', 'BIRTHDAYS. REUNIONS. A ROOM FULL OF FRIENDS.', 'text', 100, {section: 'Groups and events'}),
    field('home.privateEventHeadline', 'Groups-and-events headline', '#groups .gather-content > h2', 'Your crowd.\nOur parlor.', 'textarea', 80, {render: 'lines', maxLines: 2, emphasisLine: 1, section: 'Groups and events'}),
    field('home.privateEventIntro', 'Groups-and-events introduction', '#groups .gather-content > p', 'Planning a gathering, booking a band, or feeding a crowd with chili? Talk to the Tolbert’s team.', 'textarea', 360, {section: 'Groups and events'}),
    field('home.inquiryIntro', 'Inquiry-dialog introduction', '#inquiry-dialog > p', 'Tell Tolbert’s what you have in mind. This prepares an email for you to review and send.', 'textarea', 360, {section: 'Groups and events'}),
    field('menu.pageEyebrow', 'Menu-page label', '.menu-page-heading .eyebrow', 'TOLBERT’S RESTAURANT & CHILI PARLOR', 'text', 100, {section: 'Menu page'}),
    field('menu.pageHeadline', 'Menu-page headline', '.menu-page-heading h1', 'The parlor menu.', 'text', 100, {section: 'Menu page'}),
    field('menu.pageIntro', 'Menu-page introduction', '.menu-page-heading .menu-title-row > div > p', 'Find your usual. Discover your next favorite. Dishes, ingredients, and prices.', 'textarea', 320, {section: 'Menu page'}),
    field('music.pageEyebrow', 'Music-page label', '.music-page-head > .eyebrow', 'THE MAIN STREET STAGE · GRAPEVINE, TEXAS', 'text', 100, {section: 'Music page'}),
    field('music.pageHeadline', 'Music-page headline', '.music-page-head > h1', 'Find your night.', 'text', 100, {section: 'Music page'}),
    field('music.pageIntro', 'Music-page introduction', '.music-page-head > h1 + p', 'Pick a date. Find a band. Make a plan with your people.', 'textarea', 320, {section: 'Music page'}),
    field('links.contactEmail', 'Contact email', 'a[href^="mailto:tolbertsrestaurant@gmail.com"]', 'tolbertsrestaurant@gmail.com', 'email', 254, {target: 'attribute', attribute: 'href', attributePrefix: 'mailto:', all: true, textSelector: '#visit .visit-links a[href^="mailto:"]', textSuffix: ' ↗', group: 'Links'}),
    field('links.orderOnline', 'Online-ordering link', 'a[href*="order.spoton.com"]', 'https://order.spoton.com/rbbt-tolberts-restaurant-and-chili-parlor-15291/grapevine-tx/64e7d0d48137b6003f171eba', 'url', 1200, {target: 'attribute', attribute: 'href', all: true, allowedProtocols: ['https:'], group: 'Links'}),
    field('links.facebook', 'Facebook link', 'a[href*="facebook.com/tolbertsrestaurant"]', 'https://www.facebook.com/tolbertsrestaurant', 'url', 800, {target: 'attribute', attribute: 'href', all: true, allowedProtocols: ['https:'], group: 'Links'}),
    field('links.instagram', 'Instagram link', 'a[href*="instagram.com/tolbertsrestaurant"]', 'https://www.instagram.com/tolbertsrestaurant/', 'url', 800, {target: 'attribute', attribute: 'href', all: true, allowedProtocols: ['https:'], group: 'Links'}),
    field('links.newsletter', 'Chilihead Club signup link', 'a[href*="constantcontact.com"]', 'https://visitor.r20.constantcontact.com/manage/optin?v=0014Ogu2wnBvl8_ZbMlMzQ9KVX9rpr_smoVitHZKZig-keypGiny6WIeEEgXcEOx1-AiOhKLXw2Q2L0sW0VsGJ6VT7G5BoeQ4qErEvgGW2CZEo%3D', 'url', 1600, {target: 'attribute', attribute: 'href', all: true, allowedProtocols: ['https:'], group: 'Links'}),
    field('home.mainStreetAlt', 'Main Street photograph description', '.sign-print img', 'The tall Tolbert’s sign at Main and Franklin in downtown Grapevine', 'textarea', 240, {target: 'alt', section: 'Photographs'}),
    field('home.mainStreetCaptionTop', 'Main Street photograph caption, first line', '.sign-print figcaption span:first-child', 'MAIN & FRANKLIN', 'text', 80, {section: 'Photographs'}),
    field('home.mainStreetCaptionBottom', 'Main Street photograph caption, second line', '.sign-print figcaption span:last-child', 'GRAPEVINE, TEXAS', 'text', 80, {section: 'Photographs'}),
    field('home.stageAlt', 'Stage photograph description', '.stage-print img', 'A band playing to a room full of guests at Tolbert’s', 'textarea', 240, {target: 'alt', section: 'Photographs'}),
    field('home.stageCaption', 'Stage photograph caption', '.stage-print figcaption', 'Dinner has an encore.', 'text', 100, {section: 'Photographs'}),
    field('home.menuPhotoAlt', 'Food photograph description', '.food-feature img', 'A close-up of Tolbert’s Bowl of Red', 'textarea', 240, {target: 'alt', section: 'Photographs'}),
    field('home.menuPhotoCaption', 'Food photograph caption', '.food-feature .food-tag', 'FRANK X. TOLBERT’S ORIGINAL RECIPE', 'text', 100, {section: 'Photographs'}),
    field('home.storyPhotoAlt', 'Story photograph description', '.story-image img', 'Tolbert’s wooden bar, Texas flags and brick walls', 'textarea', 240, {target: 'alt', section: 'Photographs'}),
    field('home.storyPhotoCaption', 'Story photograph caption', '.story-image .photo-note', 'Inside the chili parlor.', 'text', 100, {section: 'Photographs'}),
    field('home.privateEventPhotoAlt', 'Groups-and-events photograph description', '#groups > img', 'Guests gathered for live music inside Tolbert’s', 'textarea', 240, {target: 'alt', section: 'Photographs'}),
    field('home.socialStageAlt', 'Social-strip stage photograph description', '.social-strip > img:first-child', 'Musicians performing on the Tolbert’s stage', 'textarea', 240, {target: 'alt', section: 'Photographs'}),
    field('home.socialDiningAlt', 'Social-strip dining photograph description', '.social-strip > img:last-child', 'The warm dining room at Tolbert’s on Main Street', 'textarea', 240, {target: 'alt', section: 'Photographs'})
  ]);

  const images = Object.freeze([
    image('home.mainStreetPhoto', 'Main Street photograph', '.sign-print img', 'assets/main-street.webp', 'home.mainStreetAlt', 'home.mainStreetCaptionTop'),
    image('home.stagePhoto', 'Stage photograph', '.stage-print img', 'assets/music-room.webp', 'home.stageAlt', 'home.stageCaption'),
    image('home.menuPhoto', 'Food photograph', '.food-feature img', 'assets/hero-chili.webp', 'home.menuPhotoAlt', 'home.menuPhotoCaption'),
    image('home.storyPhoto', 'Story photograph', '.story-image img', 'assets/bar.webp', 'home.storyPhotoAlt', 'home.storyPhotoCaption'),
    image('home.privateEventPhoto', 'Groups-and-events photograph', '#groups > img', 'assets/music-room.webp', 'home.privateEventPhotoAlt'),
    image('home.socialStagePhoto', 'Social-strip stage photograph', '.social-strip > img:first-child', 'assets/stage.webp', 'home.socialStageAlt'),
    image('home.socialDiningPhoto', 'Social-strip dining photograph', '.social-strip > img:last-child', 'assets/dining-room.webp', 'home.socialDiningAlt')
  ]);

  const fieldByKey = new Map(fields.map(item => [item.key, item]));
  const imageByKey = new Map(images.map(item => [item.key, item]));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const normalizeLink = (definition, value) => {
    const source = String(value ?? '').trim().slice(0, definition.maxLength);
    try {
      const url = new URL(source);
      if (!definition.allowedProtocols?.includes(url.protocol)) return definition.defaultValue;
      if (url.protocol === 'mailto:') {
        const address = decodeURIComponent(url.pathname).trim();
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? `mailto:${address}` : definition.defaultValue;
      }
      return url.href;
    } catch {
      return definition.defaultValue;
    }
  };
  const normalizeText = (definition, value) => {
    if (definition.type === 'url') return normalizeLink(definition, value);
    const source = String(value ?? '').replace(/\r\n?/g, '\n').trim();
    if (definition.type === 'email') return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(source)
      ? source.slice(0, definition.maxLength)
      : definition.defaultValue;
    return source.slice(0, definition.maxLength);
  };
  const normalizeImageValue = (key, value) => {
    const definition = imageByKey.get(key);
    if (!definition) return '';
    const source = String(value || '');
    if (/^assets\/[a-zA-Z0-9._-]+$/.test(source)) return source;
    if (/^shared:[a-f0-9]{64}\.(?:webp|png|jpg)$/.test(source)) return source;
    if (source.length <= 850000 && /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/i.test(source)) return source;
    return definition.defaultValue;
  };
  const normalizeContent = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result = {};
    fields.forEach(definition => {
      if (own(value, definition.key)) result[definition.key] = normalizeText(definition, value[definition.key]);
    });
    return result;
  };
  const normalizeImages = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result = {};
    images.forEach(definition => {
      if (own(value, definition.key)) result[definition.key] = normalizeImageValue(definition.key, value[definition.key]);
    });
    return result;
  };

  const api = Object.freeze({
    fields,
    images,
    fieldKeys: Object.freeze(fields.map(item => item.key)),
    imageKeys: Object.freeze(images.map(item => item.key)),
    defaults: Object.freeze({
      content: Object.freeze(Object.fromEntries(fields.map(item => [item.key, item.defaultValue]))),
      images: Object.freeze(Object.fromEntries(images.map(item => [item.key, item.defaultValue])))
    }),
    getField: key => fieldByKey.get(key) || null,
    getImage: key => imageByKey.get(key) || null,
    normalizeFieldValue: (key, value) => {
      const definition = fieldByKey.get(key);
      return definition ? normalizeText(definition, value) : '';
    },
    normalizeImageValue,
    normalizeContent,
    normalizeImages
  });

  root.OwnerContent = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
