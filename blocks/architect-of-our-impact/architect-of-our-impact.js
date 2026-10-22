import {
  a, button, div, h2, p, span, ul, li,
} from '../../scripts/dom-helpers.js';

function normalizeFieldName(value = '') {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getFields(block) {
  const fields = {};

  Array.from(block.children).forEach((row) => {
    const cells = Array.from(row.children);
    if (cells.length < 2) return;

    const fieldName = normalizeFieldName(cells[0].textContent);
    if (fieldName) fields[fieldName] = cells[1];
  });

  return fields;
}

function getText(cell) {
  return cell?.textContent?.trim() || '';
}

function getPicture(cell) {
  return cell?.querySelector('picture')?.cloneNode(true) || null;
}

function getRichTextHtml(cell) {
  if (!cell) return '';

  const elements = Array.from(cell.children)
    .filter((element) => element.textContent.trim() || element.querySelector('picture, a[href]'));

  if (elements.length) return elements.map((element) => element.outerHTML).join('');
  return cell.innerHTML.trim();
}

function getListItems(cell) {
  if (!cell) return [];

  const items = Array.from(cell.querySelectorAll('li'))
    .map((item) => item.textContent.trim())
    .filter(Boolean);

  if (items.length) return items;

  return getText(cell)
    .split(/\r?\n|⦁/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBlock(block) {
  const fields = getFields(block);

  const ctaLinkCell = fields['cta-link'] || fields['cta-link-used-when-popup-content-is-empty'];
  const ctaAnchor = ctaLinkCell?.querySelector('a[href]');
  const authoredTarget = ctaAnchor?.getAttribute('target') || '_self';

  const profilePicture = getPicture(fields['profile-image-desktop']);
  const mobileProfilePicture = getPicture(fields['profile-image-mobile'])
    || profilePicture?.cloneNode(true)
    || null;
  const popupPicture = getPicture(fields['popup-image'])
    || profilePicture?.cloneNode(true)
    || null;
  const backgroundPicture = getPicture(fields['background-image']);
  const popupBackgroundPicture = getPicture(fields['popup-background-image'])
    || backgroundPicture?.cloneNode(true)
    || null;

  return {
    titleHtml: getRichTextHtml(fields['eyebrow-title']),
    headingHtml: getRichTextHtml(fields.heading || fields.header),
    subHeadingHtml: getRichTextHtml(fields.subheading || fields.subheader),
    backgroundPicture,
    backgroundAlt: getText(fields['background-image-alt']),
    profilePicture,
    mobileProfilePicture,
    profileAlt: getText(fields['profile-image-alt']),
    popupPicture,
    popupAlt: getText(fields['popup-image-alt']),
    popupBackgroundPicture,
    summaryHtml: getRichTextHtml(fields.summary || fields['summary-use-the-toolbar-for-paragraphs-bold']),
    impactRoles: getListItems(fields['impact-roles'] || fields['impact-roles-use-the-bullet-list-toolbar-button']),
    ctaText: getText(fields['cta-label']),
    ctaHref: ctaAnchor?.getAttribute('href') || getText(ctaLinkCell),
    ctaTarget: authoredTarget === '_blank' ? '_blank' : '_self',
    popupHtml: getRichTextHtml(
      fields['popup-content']
      || fields['popup-content-use-the-toolbar-for-paragraphs-headings-bullet-lists'],
    ),
  };
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

  const data = parseBlock(block);
  if (!data.headingHtml && !data.summaryHtml) return;

  const root = div({ class: 'aoi-root' });

  if (data.backgroundPicture) {
    applyAlt(data.backgroundPicture, data.backgroundAlt);
    root.appendChild(div({ class: 'aoi-background' }, data.backgroundPicture.cloneNode(true)));
  }

  const content = div({ class: 'aoi-content' });
  const left = div({ class: 'aoi-left' });
  const topMobile = div({ class: 'aoi-top-mobile' });
  const topDesktop = div({ class: 'aoi-top-desktop' });

  const appendFormatted = (container, tagName, className, html) => {
    if (!html) return;
    const element = document.createElement(tagName);
    element.className = className;
    element.innerHTML = html;
    container.appendChild(element);
  };

  const populateHeading = (container) => {
    appendFormatted(container, 'div', 'aoi-title', data.titleHtml);
    appendFormatted(container, 'h2', 'aoi-heading', data.headingHtml);
    appendFormatted(container, 'div', 'aoi-subheading', data.subHeadingHtml);
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

  // Remove the authored two-column rows and keep only the decorated component.
  block.replaceChildren(root);
}
