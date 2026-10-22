import {
  a, button, div, img, sup,
} from '../../scripts/dom-helpers.js';

const QUOTE_START_SVG = '<svg id="start-tag" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" fill="none"><path d="M35 32L23.7742 32L23.7742 20.9442L27.2581 9L33.8387 8.99999L31.8064 16.6996C31.4194 18.0815 30.9355 19.4635 30.5484 20.9442C32.4839 20.9442 34.4194 20.9442 35 20.8455L35 32ZM16.2258 32L5 32L5 20.9442L8.48387 9L15.0645 9L13.0323 16.6996C12.6452 18.0815 12.1613 19.4635 11.7742 20.9442C13.7097 20.9442 15.6452 20.9442 16.2258 20.8455L16.2258 32Z" fill="#FF0000"/></svg>';
const QUOTE_END_SVG = '<svg id="end-tag" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" fill="none"><path d="M5 8L16.2258 8L16.2258 19.0558L12.7419 31L6.16129 31L8.19355 23.3004C8.58065 21.9185 9.06452 20.5365 9.45161 19.0558C7.51613 19.0558 5.58065 19.0558 5 19.1545L5 8ZM23.7742 8L35 7.99999L35 19.0558L31.5161 31L24.9355 31L26.9677 23.3004C27.3548 21.9185 27.8387 20.5365 28.2258 19.0558C26.2903 19.0558 24.3548 19.0558 23.7742 19.1545L23.7742 8Z" fill="#FF0000"/></svg>';

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

function getPicture(field) {
  return field?.querySelector('picture')?.cloneNode(true) || null;
}

function getFieldText(field) {
  return field?.textContent?.trim() || '';
}

function getFieldHTML(field) {
  if (!field) return '';

  const paragraphs = Array.from(field.querySelectorAll(':scope > p'));
  if (paragraphs.length) return paragraphs.map((p) => p.outerHTML).join('');

  return field.innerHTML.trim();
}

function parseBannerData(block) {
  const fields = getFields(block);

  // Supports both authoring labels: Heading/Header and Subtitle/Subheader.
  const headingField = fields.heading || fields.header;
  const subtitleField = fields.subtitle || fields.subheader;

  const desktopPicture = getPicture(fields['desktop-image']);
  const mobilePicture = getPicture(fields['mobile-image'])
    || desktopPicture?.cloneNode(true)
    || null;

  const headingHTML = getFieldHTML(headingField);
  const subtitleHTML = getFieldHTML(subtitleField);

  const ctaLabel = getFieldText(fields['cta-label']);
  const ctaLinkField = fields['cta-link'];
  const authoredLink = ctaLinkField?.querySelector('a[href]');
  const ctaHref = authoredLink?.getAttribute('href')
    || getFieldText(ctaLinkField);

  const authoredTarget = getFieldText(fields['cta-target']).toLowerCase();
  const ctaTarget = authoredTarget === '_blank' ? '_blank' : '_self';

  if (!desktopPicture && !mobilePicture && !headingHTML && !subtitleHTML) return null;

  return {
    desktopPicture,
    mobilePicture,
    headingHTML,
    subtitleHTML,
    cta: ctaLabel && ctaHref
      ? { label: ctaLabel, href: ctaHref, target: ctaTarget }
      : null,
  };
}

function startTag() {
  const el = sup({ class: 'start-tag-wrap' });
  el.innerHTML = QUOTE_START_SVG;
  return el;
}

function endTag() {
  const el = sup({ class: 'end-tag-wrap' });
  el.innerHTML = QUOTE_END_SVG;
  return el;
}

function pictureToImg(picture, className) {
  if (!picture) return null;
  const source = picture.querySelector('img');
  return img({
    class: className,
    src: source?.getAttribute('src') || '',
    alt: source?.getAttribute('alt') || '',
    loading: 'lazy',
  });
}

function buildBanner(data) {
  const container = div({ class: 'leadership-container' });

  const imageWrap = div({ class: 'leadership-image' });
  const desktopImg = pictureToImg(data.desktopPicture, 'image-container');
  const mobileImg = pictureToImg(data.mobilePicture, 'image-container-mob');
  if (desktopImg) imageWrap.appendChild(desktopImg);
  if (mobileImg) imageWrap.appendChild(mobileImg);

  const content = div({ class: 'leadership-content' });
  content.appendChild(div({ class: 'starting-tag' }, startTag()));

  const textContainer = div({ class: 'text-container' });

  if (data.headingHTML) {
    const heading = div({ class: 'heading-text' });
    heading.innerHTML = data.headingHTML;
    heading.appendChild(endTag());
    textContainer.appendChild(heading);
  }

  if (data.subtitleHTML) {
    const subtitleEl = div({ class: 'subheading' });
    subtitleEl.innerHTML = data.subtitleHTML;
    textContainer.appendChild(subtitleEl);
  }

  if (data.cta) {
    textContainer.appendChild(
      button(
        { class: 'learn-more', type: 'button' },
        a(
          {
            href: data.cta.href,
            target: data.cta.target,
            rel: data.cta.target === '_blank' ? 'noopener noreferrer' : null,
          },
          data.cta.label,
        ),
      ),
    );
  }

  content.appendChild(textContainer);
  container.append(imageWrap, content);
  return container;
}

export default function decorate(block) {
  const bannerData = parseBannerData(block);
  if (!bannerData) return;

  const container = buildBanner(bannerData);

  // Removes the original two-column authoring rows, including field labels.
  block.replaceChildren(container);
}
