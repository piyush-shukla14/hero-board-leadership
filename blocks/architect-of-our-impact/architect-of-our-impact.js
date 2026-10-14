import {
  a, button, div, h2, p, span, ul, li,
} from '../../scripts/dom-helpers.js';

const isAuthor = () => window?.origin !== undefined && window.origin.includes('author');

function getText(cell) {
  return cell?.textContent?.trim() || '';
}

function getListItems(el) {
  const items = Array.from(el.querySelectorAll('li'))
    .map((item) => item.textContent.trim())
    .filter(Boolean);

  if (items.length) return items;

  return getText(el)
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

// Picture classification thresholds. Content is authored freeform (rows are grouped by
// the author, not strictly 1:1 with the JSON model field order, and empty optional
// fields are simply omitted), so images are inferred from aspect-ratio/size and short
// text snippets are inferred from text length, rather than relying on label text or
// fixed row/column positions.
const WIDE_ASPECT_RATIO = 1.3;
const SHORT_TEXT_MAX = 60;

function getImgDimensions(picture) {
  const image = picture.querySelector('img');
  const width = Number(image?.getAttribute('width')) || 0;
  const height = Number(image?.getAttribute('height')) || 0;
  return { width, height, area: width * height };
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const BULLET_CHAR = '⦁';

// Legacy fallback only: older content may have been authored as a single flattened
// plain-text paragraph (before this field used the richtext bullet-list toolbar), with
// manual bullet characters ("⦁") separating list items. This performs no content-specific
// guessing (no hardcoded names/headings) — it only recognizes the generic bullet marker.
function buildRichTextHtml(text) {
  if (!text.includes(BULLET_CHAR)) return `<p>${escapeHtml(text)}</p>`;

  const items = text.split(BULLET_CHAR).map((item) => item.trim()).filter(Boolean);
  // If the paragraph starts with the bullet marker itself, every split item is a list
  // item - there is no separate intro sentence before the first bullet.
  if (text.trim().startsWith(BULLET_CHAR)) {
    return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  }

  const [introText, ...rest] = items;
  let html = introText ? `<p>${escapeHtml(introText)}</p>` : '';
  if (rest.length) html += `<ul>${rest.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  return html;
}

// Walks up from a text element to find its top-level block row (the direct child of
// the block element). Authored fields are grouped into rows by the editor, and a single
// row may bundle several adjacent simple fields together (e.g. title/heading/subheading/
// summary can share one row) - this lets callers tell whether two text nodes came from
// the same field-group or a different, later one.
function topRow(block, el) {
  let node = el;
  while (node && node.parentElement !== block) node = node.parentElement;
  return node;
}

function parseBlock(block) {
  const data = {
    impactRoles: [],
  };

  // Separate every <picture> in document order from every plain-text block (<p>, or a
  // real <h1>-<h6>/<ul>/<ol> produced by a richtext field) that has no picture
  // descendant, in document order.
  const pictures = Array.from(block.querySelectorAll('picture'));
  const textParas = Array.from(block.querySelectorAll('p, h1, h2, h3, h4, h5, h6, ul, ol'))
    .filter((el) => !el.querySelector('picture') && !el.closest('ul, ol') && el.textContent.trim())
    .map((el) => ({
      el,
      text: el.textContent.trim(),
      html: el.outerHTML,
      isList: el.tagName === 'UL' || el.tagName === 'OL',
      row: topRow(block, el),
    }));

  // --- Images ---
  const widePictures = [];
  const portraitPictures = [];
  pictures.forEach((picture) => {
    const { width, height, area } = getImgDimensions(picture);
    const aspect = height ? width / height : 0;
    const entry = { picture, area };
    if (aspect >= WIDE_ASPECT_RATIO) {
      widePictures.push(entry);
    } else {
      portraitPictures.push(entry);
    }
  });

  if (widePictures.length) data.backgroundPicture = widePictures[0].picture.cloneNode(true);
  if (widePictures.length > 1) {
    data.popupBackgroundPicture = widePictures[1].picture.cloneNode(true);
  } else if (widePictures.length) {
    data.popupBackgroundPicture = widePictures[0].picture.cloneNode(true);
  }

  // The popup photo is typically a much higher resolution portrait than the small
  // profile photo, so pick the largest-area portrait as the popup image and leave the
  // rest (in document order) for desktop/mobile profile photos.
  if (portraitPictures.length) {
    const popupIndex = portraitPictures.reduce(
      (best, entry, idx) => (entry.area > portraitPictures[best].area ? idx : best),
      0,
    );
    data.popupPicture = portraitPictures[popupIndex].picture.cloneNode(true);
    const profilePortraits = portraitPictures.filter((_, idx) => idx !== popupIndex);
    if (profilePortraits.length) data.profilePicture = profilePortraits[0].picture.cloneNode(true);
    if (profilePortraits.length > 1) {
      data.mobileProfilePicture = profilePortraits[1].picture.cloneNode(true);
    }
  }

  if (!data.mobileProfilePicture && data.profilePicture) {
    data.mobileProfilePicture = data.profilePicture.cloneNode(true);
  }
  if (!data.popupPicture && data.profilePicture) {
    data.popupPicture = data.profilePicture.cloneNode(true);
  }

  // --- Text ---
  data.title = textParas[0]?.text || '';
  data.heading = textParas[1]?.text || '';
  data.subHeading = textParas[2]?.text || '';
  const headingRow = textParas[0]?.row;

  const shortTexts = [];
  const summaryParts = [];
  const popupParts = [];
  // Classification is based on which authored row/field-group a paragraph belongs to,
  // not on its character length: the editor may author the Popup Content field as many
  // short/medium paragraphs (one per line), so length-based guessing would wrongly file
  // most of them under Summary. A real <ul>/<ol> is unambiguous evidence of the Impact
  // Roles field. Any text sharing the same row as the heading is the Summary field;
  // any text in another, later row is the Popup Content field.
  const rest = textParas.slice(3);
  rest.forEach(({
    el, text, html, isList, row,
  }) => {
    if (isList) {
      data.impactRoles = getListItems(el);
      return;
    }
    const isShort = text.length <= SHORT_TEXT_MAX;
    // Short alt-text/CTA-label strings only live in the heading row or in a row that is
    // otherwise entirely empty/standalone (e.g. just the CTA label next to an image). A
    // short paragraph embedded inside a row that also holds longer content (e.g. a short
    // "sub-heading" line sitting among Popup Content paragraphs) belongs to that content,
    // not to the alt-text/CTA bucket - treating it as such would silently drop it.
    const rowHasOnlyThisItem = !rest.some(
      (i) => i !== undefined && i.row === row && i.el !== el && !i.isList,
    );
    if (isShort && (row === headingRow || rowHasOnlyThisItem)) {
      shortTexts.push(text);
    } else if (row === headingRow) {
      summaryParts.push(html);
    } else {
      // Already-structured richtext (real <ul>/<h1-6> markup) can be used as-is;
      // legacy flattened single-paragraph content still needs the text-sniffing builder.
      popupParts.push(/<(ul|ol|h[1-6])[ >]/i.test(html) ? html : buildRichTextHtml(text));
    }
  });

  data.summaryHtml = summaryParts.join('');
  data.popupHtml = popupParts.join('');

  // The CTA label is authored last (after the popup content), any earlier short
  // strings are leftover alt-text metadata for the images.
  if (shortTexts.length) {
    data.ctaText = shortTexts[shortTexts.length - 1];
    const altTexts = shortTexts.slice(0, -1);
    [data.backgroundAlt, data.profileAlt, data.popupAlt] = altTexts;
  }

  // Fallback for legacy content: if Impact Roles wasn't found as a real list in the
  // main text stream above, look for any standalone <ul>/<ol> elsewhere in the block.
  if (!data.impactRoles.length) {
    const standaloneList = Array.from(block.querySelectorAll('ul, ol'))
      .find((list) => !popupParts.some((html) => html.includes(list.outerHTML)));
    if (standaloneList) data.impactRoles = getListItems(standaloneList);
  }

  const anchor = block.querySelector('a[href]');
  if (anchor) {
    data.ctaHref = anchor.getAttribute('href') || '';
    data.ctaTarget = anchor.getAttribute('target') || '_self';
    if (!data.ctaText && anchor.textContent?.trim()) data.ctaText = anchor.textContent.trim();
  }

  return data;
}

function applyAlt(picture, altText) {
  if (!picture || !altText) return;
  picture.querySelectorAll('img').forEach((img) => img.setAttribute('alt', altText));
}

function buildPopup(data, trigger) {
  const overlay = div({ class: 'aoi-popup-overlay', role: 'dialog', 'aria-modal': 'true' });
  const modal = div({ class: 'aoi-popup-modal' });
  const closeBtn = button({ class: 'aoi-popup-close', type: 'button', 'aria-label': 'Close profile details' }, '×');
  let isClosed = false;

  if (data.popupPicture) {
    applyAlt(data.popupPicture, data.popupAlt || data.profileAlt);
    modal.appendChild(div({ class: 'aoi-popup-image' }, data.popupPicture.cloneNode(true)));
  }

  const content = div({ class: 'aoi-popup-content' });

  if (data.popupBackgroundUrl) {
    content.style.backgroundImage = `url('${data.popupBackgroundUrl}')`;
    content.style.backgroundRepeat = 'no-repeat';
    content.style.backgroundSize = 'cover';
    content.style.backgroundPosition = 'center';
  }

  if (data.popupBackgroundPicture) {
    content.appendChild(div({ class: 'aoi-popup-content-bg' }, data.popupBackgroundPicture.cloneNode(true)));
  }

  const inner = div({ class: 'aoi-popup-content-inner' });
  if (data.heading) inner.appendChild(h2({ class: 'aoi-popup-heading' }, data.heading));
  if (data.subHeading) inner.appendChild(p({ class: 'aoi-popup-role' }, data.subHeading));
  if (data.popupHtml) {
    const rich = div({ class: 'aoi-popup-richtext' });
    rich.innerHTML = data.popupHtml;
    inner.appendChild(rich);
  }

  const scrollFade = div({ class: 'aoi-popup-scroll-fade' });
  content.append(closeBtn, inner, scrollFade);
  modal.appendChild(content);
  overlay.appendChild(modal);

  // Hint that there is more content to scroll to: show a bottom fade whenever the
  // popup text overflows its visible area, and hide it once the user reaches the end.
  const updateScrollFade = () => {
    const scrollable = inner.scrollHeight > inner.clientHeight + 1;
    const atBottom = inner.scrollHeight - inner.scrollTop - inner.clientHeight < 4;
    scrollFade.classList.toggle('aoi-popup-scroll-fade-hidden', !scrollable || atBottom);
  };
  inner.addEventListener('scroll', updateScrollFade);
  requestAnimationFrame(updateScrollFade);

  let onKeyDown;

  const close = () => {
    if (isClosed) return;
    isClosed = true;
    document.removeEventListener('keydown', onKeyDown);
    overlay.classList.remove('aoi-popup-visible');
    document.body.classList.remove('aoi-popup-open');
    setTimeout(() => {
      overlay.remove();
      trigger?.focus?.();
    }, 220);
  };

  onKeyDown = (event) => {
    if (event.key === 'Escape') close();
  };

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  document.addEventListener('keydown', onKeyDown);

  return overlay;
}

function buildAction(data) {
  const label = data.ctaText || (data.popupHtml ? 'Read More' : 'Learn More');

  if (data.popupHtml) {
    return button({ class: 'aoi-action', type: 'button' }, span(label));
  }

  if (data.ctaHref) {
    return a(
      {
        class: 'aoi-action',
        href: data.ctaHref,
        target: data.ctaTarget || '_self',
        rel: data.ctaTarget === '_blank' ? 'noopener noreferrer' : null,
      },
      span(label),
    );
  }

  return null;
}

export default function decorate(block) {
  if (isAuthor()) return;

  const data = parseBlock(block);
  if (!data.heading && !data.summaryHtml) return;

  const root = div({ class: 'aoi-root' });

  if (data.backgroundPicture) {
    applyAlt(data.backgroundPicture, data.backgroundAlt);
    root.appendChild(div({ class: 'aoi-background' }, data.backgroundPicture.cloneNode(true)));
  }

  const content = div({ class: 'aoi-content' });
  const left = div({ class: 'aoi-left' });
  const topMobile = div({ class: 'aoi-top-mobile' });
  const topDesktop = div({ class: 'aoi-top-desktop' });

  const populateHeading = (container) => {
    if (data.title) container.appendChild(div({ class: 'aoi-title' }, data.title));
    if (data.heading) container.appendChild(h2({ class: 'aoi-heading' }, data.heading));
    if (data.subHeading) container.appendChild(p({ class: 'aoi-subheading' }, data.subHeading));
  };

  populateHeading(topMobile);
  populateHeading(topDesktop);
  left.append(topMobile, topDesktop);

  if (data.summaryHtml) {
    const summary = div({ class: 'aoi-summary' });
    summary.innerHTML = data.summaryHtml;
    left.appendChild(summary);
  }

  // Match the reference layout: the Read More/CTA link sits immediately after the
  // Summary paragraph(s), with Impact Roles listed below it.
  const action = buildAction(data);
  if (action) {
    if (data.popupHtml) {
      action.addEventListener('click', () => {
        const popup = buildPopup(data, action);
        document.body.appendChild(popup);
        document.body.classList.add('aoi-popup-open');
        requestAnimationFrame(() => popup.classList.add('aoi-popup-visible'));
        popup.querySelector('.aoi-popup-close')?.focus();
      });
    }
    left.appendChild(action);
  }

  if (data.impactRoles.length) {
    const roles = ul({ class: 'aoi-impact-roles' });
    data.impactRoles.forEach((roleText) => roles.appendChild(li({}, roleText)));
    left.appendChild(roles);
  }

  const right = div({ class: 'aoi-right' });
  if (data.profilePicture) {
    applyAlt(data.profilePicture, data.profileAlt);
    right.appendChild(div({ class: 'aoi-profile aoi-profile-desktop' }, data.profilePicture.cloneNode(true)));
  }
  if (data.mobileProfilePicture) {
    applyAlt(data.mobileProfilePicture, data.profileAlt);
    right.appendChild(div({ class: 'aoi-profile aoi-profile-mobile' }, data.mobileProfilePicture.cloneNode(true)));
  }

  content.append(left, right);
  root.appendChild(content);

  block.innerHTML = '';
  block.appendChild(root);
}
