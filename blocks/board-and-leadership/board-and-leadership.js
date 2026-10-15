import {
  div, button, h2, h3, p, span,
} from '../../scripts/dom-helpers.js';

const isAuthor = () => window?.origin !== undefined && window?.origin.includes('author');

function normalizeKey(value = '') {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-');
}

function sectionIdFromTitle(title = '') {
  return normalizeKey(title).replace(/^-|-$/g, '') || 'section';
}

function parseTermsMeta(currentSection, key, value, cellWithImage) {
  if (!currentSection) return;

  if (!currentSection.terms) {
    currentSection.terms = {
      label: '',
      href: '',
      target: '_self',
      iconPicture: null,
    };
  }

  const anchor = value.querySelector('a[href]');
  const normalizedKey = normalizeKey(key);

  if (['terms-link-label', 'terms-label', 'download-label'].includes(normalizedKey)) {
    currentSection.terms.label = (anchor?.textContent?.trim() || value.textContent?.trim() || '');
  }

  if (['terms-link-url', 'terms-url', 'terms-link-path', 'download-url'].includes(normalizedKey)) {
    currentSection.terms.href = anchor?.getAttribute('href') || value.textContent?.trim() || '';
    currentSection.terms.target = anchor?.getAttribute('target') || '_blank';
  }

  if (['terms-link-icon', 'terms-icon', 'download-icon'].includes(normalizedKey)) {
    currentSection.terms.iconPicture = cellWithImage?.querySelector('picture')?.cloneNode(true)
      || value.querySelector('picture')?.cloneNode(true)
      || null;
  }
}

function parseSocialLinks(cells) {
  const links = [];
  cells.forEach((cell) => {
    Array.from(cell.querySelectorAll('a[href]')).forEach((anchor) => {
      const href = anchor.getAttribute('href');
      if (!href) return;
      const iconPicture = anchor.querySelector('picture')?.cloneNode(true) || null;
      const iconImage = !iconPicture ? anchor.querySelector('img')?.cloneNode(true) || null : null;
      const label = anchor.textContent?.trim() || anchor.getAttribute('aria-label') || 'Profile link';
      links.push({
        href,
        target: anchor.getAttribute('target') || '_blank',
        label,
        iconPicture,
        iconImage,
      });
    });
  });
  return links;
}

/**
 * Parses block rows into sections.
 * A "section header" row has no picture element and an empty or absent second cell.
 * All subsequent rows until the next section header are treated as person cards.
 *
 * Google Doc authoring table structure:
 * | Board and Leadership |  |
 * |---|---|
 * | Board of Directors |  |         ← section header
 * | [picture] | Name\nRole\nBio |   ← person row
 * ...
 * | Leadership Team |  |            ← section header
 * | [picture] | Name\nRole\nBio |   ← person row
 */
function parseSections(block) {
  const rows = Array.from(block.children);
  const sections = [];
  let current = null;

  rows.forEach((row) => {
    const cols = Array.from(row.children);
    const hasPicture = !!row.querySelector('picture');
    const col0Text = cols[0]?.textContent?.trim() || '';
    const col1Text = cols.length > 1 ? (cols[1]?.textContent?.trim() || '') : '';

    const isSectionHeader = !hasPicture && col0Text && !col1Text;
    const isMetaRow = !hasPicture && col0Text && col1Text;

    if (isSectionHeader) {
      current = {
        title: col0Text,
        id: sectionIdFromTitle(col0Text),
        persons: [],
        terms: null,
      };
      sections.push(current);
    } else if (isMetaRow) {
      parseTermsMeta(current, col0Text, cols[1], cols[2]);
    } else if (hasPicture) {
      if (!current) {
        current = {
          title: '',
          id: `section-${sections.length + 1}`,
          persons: [],
          terms: null,
        };
        sections.push(current);
      }
      const picture = row.querySelector('picture');
      const contentCell = cols.length > 1 ? cols[1] : cols[0];
      const paras = Array.from(contentCell.querySelectorAll('p'));
      const extraCells = cols.slice(2);
      const popupPictureCell = extraCells.find((cell) => cell.querySelector('picture'));
      const popupPicture = popupPictureCell?.querySelector('picture')?.cloneNode(true) || picture.cloneNode(true);
      const socialSourceCells = extraCells.filter((cell) => cell !== popupPictureCell);
      const socialLinks = parseSocialLinks(socialSourceCells);
      const metadataText = extraCells
        .map((cell) => cell.textContent?.trim() || '')
        .filter(Boolean)
        .join('\n');
      const disablePopup = /(?:disable\s*popup|no\s*popup)\s*:\s*true/i.test(metadataText);
      const name = paras[0]?.textContent?.trim() || '';
      const role = paras[1]?.textContent?.trim() || '';
      const bioHTML = paras.slice(2).map((el) => el.outerHTML).join('');

      current.persons.push({
        picture: picture.cloneNode(true),
        popupPicture,
        name,
        role,
        bioHTML,
        disablePopup,
        socialLinks,
      });
    }
  });

  return sections;
}

/**
 * Builds a single person card element.
 */
function buildCard(person, sectionIdx, personIdx) {
  const card = div({
    class: `bal-card${person.disablePopup ? ' bal-card-static' : ''}`,
    'data-section': sectionIdx,
    'data-person': personIdx,
  });
  if (!person.disablePopup) {
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `View profile of ${person.name}`);
  }

  const imageWrapper = div({ class: 'bal-card-image' }, person.picture);
  const info = div(
    { class: 'bal-card-info' },
    h3({ class: 'bal-card-name' }, person.name),
    div({ class: 'bal-card-divider' }),
    p({ class: 'bal-card-role' }, person.role),
  );

  card.appendChild(imageWrapper);
  card.appendChild(info);
  return card;
}

/**
 * Builds the popup/modal for a person's full profile.
 */
function buildPopup(person) {
  const overlay = div({ class: 'bal-popup-overlay', 'aria-modal': 'true', role: 'dialog' });

  const modal = div({ class: 'bal-popup-modal' });

  const closeBtn = button({ class: 'bal-popup-close', 'aria-label': 'Close profile' }, '×');

  const imageCol = div(
    { class: 'bal-popup-image-col' },
    person.popupPicture.cloneNode(true),
  );

  const bioCol = div({ class: 'bal-popup-bio-col' });
  bioCol.appendChild(h2({ class: 'bal-popup-name' }, person.name));
  bioCol.appendChild(p({ class: 'bal-popup-role' }, person.role));

  if (person.bioHTML) {
    const bioWrapper = div({ class: 'bal-popup-bio' });
    bioWrapper.innerHTML = person.bioHTML;
    bioCol.appendChild(bioWrapper);
  }

  if (person.socialLinks?.length) {
    const socialContainer = div({ class: 'bal-popup-social' });
    person.socialLinks.forEach((item) => {
      const socialLink = document.createElement('a');
      socialLink.className = 'bal-popup-social-link';
      socialLink.href = item.href;
      socialLink.target = item.target || '_blank';
      if (socialLink.target === '_blank') socialLink.rel = 'noopener noreferrer';
      socialLink.setAttribute('aria-label', item.label || 'Profile link');

      if (item.iconPicture) {
        socialLink.appendChild(item.iconPicture.cloneNode(true));
      } else if (item.iconImage) {
        socialLink.appendChild(item.iconImage.cloneNode(true));
      } else {
        socialLink.textContent = item.label || 'Link';
      }

      socialContainer.appendChild(socialLink);
    });
    bioCol.appendChild(socialContainer);
  }

  modal.appendChild(closeBtn);
  modal.appendChild(imageCol);
  modal.appendChild(bioCol);
  overlay.appendChild(modal);
  return overlay;
}

function openPopup(popup) {
  document.body.appendChild(popup);
  document.body.classList.add('bal-popup-open');
  popup.classList.add('bal-popup-visible');
  popup.querySelector('.bal-popup-close')?.focus();
}

function closePopup(popup, trigger) {
  popup.classList.remove('bal-popup-visible');
  document.body.classList.remove('bal-popup-open');
  setTimeout(() => {
    if (popup.parentNode) popup.parentNode.removeChild(popup);
    trigger?.focus?.();
  }, 300);
}

/**
 * Wires up tab-switching behaviour.
 */
function getInitialTabIndex(sections) {
  const params = new URLSearchParams(window.location.search);
  const tabCandidates = [
    params.get('tab'),
    params.get('key1'),
    window.location.hash ? window.location.hash.replace('#', '') : '',
  ].filter(Boolean);

  if (!tabCandidates.length) return 0;

  const normalized = tabCandidates.map((value) => normalizeKey(value));
  const matchIndex = sections.findIndex((section) => {
    const sid = normalizeKey(section.id || '');
    const title = normalizeKey(section.title || '');
    return normalized.some((target) => target === sid || target === title);
  });

  return matchIndex >= 0 ? matchIndex : 0;
}

function initTabs(tabsNav, tabPanels, defaultIndex = 0) {
  const tabBtns = Array.from(tabsNav.querySelectorAll('.bal-tab-btn'));

  function activate(idx, userAction = false) {
    tabBtns.forEach((btn, i) => {
      const active = i === idx;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.setAttribute('tabindex', active ? '0' : '-1');
    });
    tabPanels.forEach((panel, i) => {
      const active = i === idx;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });

    if (userAction) {
      tabBtns[idx]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }

  tabBtns.forEach((btn, idx) => {
    btn.addEventListener('click', () => activate(idx, true));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = (idx + 1) % tabBtns.length;
        activate(next);
        tabBtns[next].focus();
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = (idx - 1 + tabBtns.length) % tabBtns.length;
        activate(prev);
        tabBtns[prev].focus();
      }
    });
  });

  const validIndex = defaultIndex >= 0 && defaultIndex < tabBtns.length ? defaultIndex : 0;
  activate(validIndex);
}

function buildTermsSection(section) {
  const { terms } = section;
  if (!terms?.label || !terms?.href) return null;

  const wrapper = div({ class: 'bal-terms' });
  const link = document.createElement('a');
  link.className = 'bal-terms-link';
  link.href = terms.href;
  link.target = terms.target || '_blank';
  if (link.target === '_blank') link.rel = 'noopener noreferrer';

  if (terms.iconPicture) {
    link.appendChild(terms.iconPicture.cloneNode(true));
  }

  const label = document.createElement('span');
  label.className = 'bal-terms-label';
  label.textContent = terms.label;
  link.appendChild(label);

  wrapper.appendChild(link);
  return wrapper;
}

export default function decorate(block) {
  if (isAuthor()) return;

  const sections = parseSections(block);
  if (!sections.length) return;

  const useTabs = sections.length > 1 && sections.every((s) => s.title);

  const root = div({ class: 'bal-root' });

  /* ------ Tabs navigation ------ */
  if (useTabs) {
    const tabsNav = div({ class: 'bal-tabs-nav', role: 'tablist', 'aria-label': 'Board and leadership sections' });
    sections.forEach((section, index) => {
      tabsNav.appendChild(
        button({
          class: 'bal-tab-btn',
          role: 'tab',
          id: `bal-tab-${index}`,
          'aria-controls': `bal-panel-${index}`,
          'data-tabid': section.id,
          'aria-selected': 'false',
          tabindex: '-1',
          type: 'button',
        }, span(section.title)),
      );
    });
    root.appendChild(tabsNav);
  }

  /* ------ Tab panels / grids ------ */
  const tabPanels = [];

  sections.forEach((section, sIdx) => {
    const panel = div({
      class: 'bal-panel',
      id: `bal-panel-${sIdx}`,
      role: useTabs ? 'tabpanel' : null,
      'aria-labelledby': useTabs ? `bal-tab-${sIdx}` : null,
    });

    if (!useTabs && section.title) {
      panel.appendChild(h2({ class: 'bal-section-title' }, section.title));
    }

    const grid = div({ class: 'bal-grid' });

    section.persons.forEach((person, pIdx) => {
      const card = buildCard(person, sIdx, pIdx);

      const openCard = () => {
        if (person.disablePopup) return;
        const popup = buildPopup(person);
        openPopup(popup);

        const closeBtn = popup.querySelector('.bal-popup-close');
        let isClosed = false;
        let handleKey;

        const handleClose = () => {
          if (isClosed) return;
          isClosed = true;
          document.removeEventListener('keydown', handleKey);
          closePopup(popup, card);
        };

        handleKey = (e) => {
          if (e.key === 'Escape') {
            handleClose();
          }
        };

        closeBtn.addEventListener('click', handleClose, { once: true });

        popup.addEventListener('click', (e) => {
          if (e.target === popup) handleClose();
        });

        document.addEventListener('keydown', handleKey);
      };

      if (!person.disablePopup) {
        card.addEventListener('click', openCard);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openCard();
          }
        });
      }

      grid.appendChild(card);
    });

    panel.appendChild(grid);
    const termsSection = buildTermsSection(section);
    if (termsSection) panel.appendChild(termsSection);
    root.appendChild(panel);
    tabPanels.push(panel);
  });

  if (useTabs) {
    const tabsNav = root.querySelector('.bal-tabs-nav');
    initTabs(tabsNav, tabPanels, getInitialTabIndex(sections));
  }

  block.innerHTML = '';
  block.appendChild(root);
}
