import {
  div, button, h2, h3, p, span,
} from '../../scripts/dom-helpers.js';

function normalizeKey(value = '') {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function sectionIdFromTitle(title = '') {
  return normalizeKey(title) || 'section';
}

function getText(cell) {
  return cell?.textContent?.trim() || '';
}

function getPicture(cell) {
  return cell?.querySelector('picture')?.cloneNode(true) || null;
}

function getRichTextHtml(cell) {
  if (!cell) return '';
  const children = Array.from(cell.children)
    .filter((child) => child.textContent.trim() || child.querySelector('picture, a[href]'));
  return children.length ? children.map((child) => child.outerHTML).join('') : cell.innerHTML.trim();
}

function getLink(cell, defaultTarget = '_blank') {
  const anchor = cell?.querySelector('a[href]');
  return {
    href: anchor?.getAttribute('href') || getText(cell),
    target: anchor?.getAttribute('target') || defaultTarget,
  };
}

function getBoolean(cell) {
  return ['true', 'yes', '1', 'disable', 'disabled'].includes(getText(cell).toLowerCase());
}

function emptySection(title = '') {
  return {
    title,
    id: sectionIdFromTitle(title),
    persons: [],
    terms: { label: '', href: '', target: '_blank', iconPicture: null },
  };
}

function emptyPerson() {
  return {
    picture: null,
    popupPicture: null,
    popupBackgroundPicture: null,
    name: '',
    nameHTML: '',
    role: '',
    roleHTML: '',
    bioHTML: '',
    disablePopup: false,
    socialLinks: [],
  };
}

function addSocialLink(person, fields, suffix = '') {
  const icon = getPicture(fields[`social-link-${suffix}icon`] || fields[`social-${suffix}icon`]);
  const urlCell = fields[`social-link-${suffix}url`] || fields[`social-${suffix}url`];
  const label = getText(fields[`social-link-${suffix}label`] || fields[`social-${suffix}label`]);
  const { href, target } = getLink(urlCell);
  if (href) person.socialLinks.push({ href, target, label: label || 'Profile link', iconPicture: icon, iconImage: null });
}

function finalizePerson(section, person, fields) {
  if (!section || !person) return;

  person.picture = getPicture(fields['card-image']);
  person.popupPicture = getPicture(fields['popup-image-optional'] || fields['popup-image'])
    || person.picture?.cloneNode(true)
    || null;
  person.popupBackgroundPicture = getPicture(fields['popup-background-image']);
  person.name = getText(fields.name);
  person.nameHTML = getRichTextHtml(fields.name);
  person.role = getText(fields.role);
  person.roleHTML = getRichTextHtml(fields.role);
  person.bioHTML = getRichTextHtml(fields['bio-html-text'] || fields.bio);
  person.disablePopup = getBoolean(fields['disable-popup']);

  addSocialLink(person, fields, '1-');
  addSocialLink(person, fields, '2-');

  if (person.picture && (person.name || person.role)) section.persons.push(person);
}

/**
 * Named-row document format:
 * Section | Board of Directors
 * Terms Link Label | Terms and Conditions
 * Terms Link URL | /terms
 * Terms Link Icon | [image]
 * Profile | (blank)
 * Card Image | [image]
 * Name | Person name
 * Role | Person role
 * Bio | Rich text
 * ...repeat Profile marker for each card, and Section marker for each tab.
 */
function parseSections(block) {
  const sections = [];
  let currentSection = null;
  let currentPerson = null;
  let personFields = {};

  const finishPerson = () => {
    finalizePerson(currentSection, currentPerson, personFields);
    currentPerson = null;
    personFields = {};
  };

  Array.from(block.children).forEach((row) => {
    const cells = Array.from(row.children);
    if (!cells.length) return;

    const key = normalizeKey(getText(cells[0]));
    const value = cells[1];
    if (!key) return;

    if (['section', 'board-and-leadership-section'].includes(key)) {
      finishPerson();
      currentSection = emptySection(getText(value));
      sections.push(currentSection);
      return;
    }

    if (['section-title', 'tab-name', 'tab-title'].includes(key)) {
      finishPerson();
      const title = getText(value);

      // A component marker is commonly followed by a separate Section Title row.
      // Reuse that empty section instead of creating a second section.
      if (currentSection && !currentSection.title && !currentSection.persons.length) {
        currentSection.title = title;
        currentSection.id = sectionIdFromTitle(title);
      } else {
        currentSection = emptySection(title);
        sections.push(currentSection);
      }
      return;
    }

    if (['profile', 'board-and-leadership-profile'].includes(key)) {
      finishPerson();
      if (!currentSection) {
        currentSection = emptySection('');
        sections.push(currentSection);
      }
      currentPerson = emptyPerson();
      return;
    }

    if (!currentSection) {
      currentSection = emptySection('');
      sections.push(currentSection);
    }

    if (key === 'tab-query-param-name') return;
    if (key === 'terms-link-label') currentSection.terms.label = getText(value);
    else if (key === 'terms-link-url') Object.assign(currentSection.terms, getLink(value));
    else if (key === 'terms-link-icon') currentSection.terms.iconPicture = getPicture(value);
    else {
      if (!currentPerson) currentPerson = emptyPerson();
      personFields[key] = value;
    }
  });

  finishPerson();
  return sections.filter((section) => section.persons.length || section.title);
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
  const nameElement = h3({ class: 'bal-card-name' });
  nameElement.innerHTML = person.nameHTML || person.name;
  const roleElement = p({ class: 'bal-card-role' });
  roleElement.innerHTML = person.roleHTML || person.role;
  const info = div(
    { class: 'bal-card-info' },
    nameElement,
    div({ class: 'bal-card-divider' }),
    roleElement,
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

  if (person.popupBackgroundPicture) {
    const backgroundImage = person.popupBackgroundPicture.querySelector('img');
    const backgroundUrl = backgroundImage?.getAttribute('src');
    if (backgroundUrl) {
      bioCol.classList.add('has-background-image');
      bioCol.style.backgroundImage = `url("${backgroundUrl.replace(/"/g, '%22')}")`;
    }
  }
  const popupName = h2({ class: 'bal-popup-name' });
  popupName.innerHTML = person.nameHTML || person.name;
  const popupRole = p({ class: 'bal-popup-role' });
  popupRole.innerHTML = person.roleHTML || person.role;
  bioCol.append(popupName, popupRole);

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

  const sections = parseSections(block);
  if (!sections.length) return;

  // Show the tab navigation even when only one named section is authored.
  const useTabs = sections.length > 0 && sections.every((s) => s.title);

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

  // Remove document field labels and keep only the decorated tabs/cards.
  block.replaceChildren(root);
}
