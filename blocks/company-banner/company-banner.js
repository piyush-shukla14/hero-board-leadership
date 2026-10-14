import {
  a, div, h1, span,
} from '../../scripts/dom-helpers.js';

const isAuthor = () => window?.origin !== undefined && window.origin.includes('author');

function parseBannerData(block) {
  const rows = Array.from(block.children);
  if (!rows.length) return null;

  const pictures = [];
  let headingText = '';
  let subtitleHTML = '';
  let ctaLabel = '';
  let ctaHref = '';
  let ctaTarget = '_self';

  rows.forEach((row) => {
    const rowPictures = Array.from(row.querySelectorAll('picture'));
    if (rowPictures.length) {
      rowPictures.forEach((pic) => pictures.push(pic.cloneNode(true)));
      return;
    }

    const paras = Array.from(row.querySelectorAll('p')).filter((p) => p.textContent.trim() || p.querySelector('a[href]'));
    if (!paras.length) return;

    const linkPara = paras.find((p) => p.querySelector('a[href]'));
    const targetPara = paras.find((p) => /^_self$|^_blank$/i.test(p.textContent.trim()));

    if (linkPara || targetPara) {
      const labelPara = paras.find((p) => p !== linkPara && p !== targetPara);
      const anchor = linkPara?.querySelector('a[href]');
      ctaLabel = labelPara?.textContent?.trim() || anchor?.textContent?.trim() || '';
      ctaHref = anchor?.getAttribute('href') || '';
      ctaTarget = targetPara?.textContent?.trim() || anchor?.getAttribute('target') || '_self';
      return;
    }

    if (!headingText) {
      headingText = paras[0]?.textContent?.trim() || '';
      subtitleHTML = paras.slice(1).map((p) => p.outerHTML).join('');
    } else if (!subtitleHTML) {
      subtitleHTML = paras.map((p) => p.outerHTML).join('');
    }
  });

  if (!pictures.length && !headingText) return null;

  return {
    desktopPicture: pictures[0] || null,
    mobilePicture: pictures[1] || pictures[0]?.cloneNode(true) || null,
    headingText,
    subtitleHTML,
    cta: ctaLabel && ctaHref
      ? { label: ctaLabel, href: ctaHref, target: ctaTarget }
      : null,
  };
}

function buildBanner(data) {
  const slideEl = div({
    class: 'company-banner-slide active',
  });

  const innerEl = div({ class: 'company-banner-slide-inner' });

  if (data.desktopPicture) {
    innerEl.appendChild(div({ class: 'company-banner-bg company-banner-bg-desktop' }, data.desktopPicture));
  }

  if (data.mobilePicture) {
    innerEl.appendChild(div({ class: 'company-banner-bg company-banner-bg-mobile' }, data.mobilePicture));
  }

  const contentEl = div({ class: 'company-banner-content' });
  const textContainer = div({ class: 'company-banner-text-container' });

  // Opening quote is its own flex column (sibling of text-container), matching the
  // AEM reference markup, so it never shifts the first heading line out of alignment
  // with wrapped lines.
  if (data.headingText) {
    contentEl.appendChild(
      span({ class: 'company-banner-quote company-banner-quote-start', 'aria-hidden': 'true' }, '\u201c'),
    );

    textContainer.appendChild(
      h1(
        { class: 'company-banner-heading' },
        span({ class: 'company-banner-heading-text' }, data.headingText),
        span({ class: 'company-banner-quote company-banner-quote-end', 'aria-hidden': 'true' }, '\u201d'),
      ),
    );
  }

  if (data.subtitleHTML) {
    const subtitleEl = div({ class: 'company-banner-subtitle' });
    subtitleEl.innerHTML = data.subtitleHTML;
    textContainer.appendChild(subtitleEl);
  }

  if (data.cta) {
    textContainer.appendChild(
      a(
        {
          class: 'company-banner-cta',
          href: data.cta.href,
          target: data.cta.target,
          rel: data.cta.target === '_blank' ? 'noopener noreferrer' : null,
        },
        data.cta.label,
      ),
    );
  }

  contentEl.appendChild(textContainer);
  innerEl.appendChild(contentEl);
  slideEl.appendChild(innerEl);
  return slideEl;
}

export default function decorate(block) {
  if (isAuthor()) return;

  const bannerData = parseBannerData(block);
  if (!bannerData) return;

  const wrapper = div({ class: 'company-banner-wrapper' });
  const banner = div({ class: 'company-banner' });
  const inner = div({ class: 'company-banner-inner' });
  const carousel = div({ class: 'company-banner-carousel' });
  const slidesContainer = div({ class: 'company-banner-slides' });

  slidesContainer.appendChild(buildBanner(bannerData));
  carousel.appendChild(slidesContainer);
  inner.appendChild(carousel);
  banner.appendChild(inner);
  wrapper.appendChild(banner);

  block.innerHTML = '';
  block.appendChild(wrapper);
}
