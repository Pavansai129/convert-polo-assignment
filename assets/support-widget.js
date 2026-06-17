

/* ── CUSTOM ELEMENT ──────────────────────────────────────────── */
class SupportWidget extends HTMLElement {

  constructor() {
    super();
  }

  connectedCallback () {
    /* State */
    this._isOpen       = false;
    this._currentScreen  = 'home';
    this._activeCategoryId = null;
    this._activeFaqId      = null;
    this._tooltipTimer     = null;

    /* DOM refs */
    this._triggerBtn    = this.querySelector('#sw-trigger');
    this._overlayEl     = this.querySelector('#sw-overlay');
    this._panelEl       = this.querySelector('#sw-panel');
    this._closePanelBtn = this.querySelector('#sw-close-btn');
    this._tooltipEl     = this.querySelector('#sw-tooltip');
    this._answerBackBtn = this.querySelector('#sw-answer-back-btn');
    this.faqItems = JSON.parse(this.dataset.faqItems || '{}');
    this.faqCategories = JSON.parse(this.dataset.faqCategories || '{}');
    this.arrowIconPrev = this.dataset.arrowIconPrev || '';
    this.arrowIconNext = this.dataset.arrowIconNext || '';
    this.emptyCategoryText = this.dataset.emptyCategoryText || 'No questions in this category yet.';
    console.log('FAQ Items:', this.faqItems);
    console.log('FAQ Categories:', this.faqCategories);
    this._setupTooltips();
    this._setupEventListeners();
  }

  /* ── TOOLTIP SYSTEM ────────────────────────────────────────── */
  _setupTooltips () {
    const contactButtons = this.querySelectorAll('.sw-contact-btn[data-tooltip]');

    contactButtons.forEach(btn => {
      const showTooltip = () => this._showTooltip(btn);
      const hideTooltip = () => this._hideTooltip();

      /* Mouse */
      btn.addEventListener('mouseenter', showTooltip);
      btn.addEventListener('mouseleave', hideTooltip);
      btn.addEventListener('focus',      showTooltip);
      btn.addEventListener('blur',       hideTooltip);

      /* Long-press for touch */
      btn.addEventListener('touchstart', (touchEvent) => {
        this._tooltipTimer = setTimeout(() => {
          touchEvent.preventDefault();
          showTooltip();
          setTimeout(hideTooltip, 2500);
        }, 500);
      }, { passive: true });

      btn.addEventListener('touchend', () => {
        clearTimeout(this._tooltipTimer);
      });
    });
  }

  _showTooltip (anchorElement) {
    const tooltipText = anchorElement.dataset.tooltip;
    if (!tooltipText) return;

    this._tooltipEl.textContent = tooltipText;
    this._tooltipEl.setAttribute('aria-hidden', 'false');

    /* Position tooltip above the anchor */
    const anchorRect = anchorElement.getBoundingClientRect();
    const tooltipWidth = 180; /* estimated max */

    let leftPos = anchorRect.left + anchorRect.width / 2 - tooltipWidth / 2;
    /* Clamp to viewport */
    leftPos = Math.max(8, Math.min(leftPos, window.innerWidth - tooltipWidth - 8));

    this._tooltipEl.style.left = leftPos + 'px';
    this._tooltipEl.style.top  = (anchorRect.top - 40) + 'px';

    /* Measure actual width after paint and re-center */
    requestAnimationFrame(() => {
      const tooltipRect = this._tooltipEl.getBoundingClientRect();
      let correctedLeft = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
      correctedLeft = Math.max(8, Math.min(correctedLeft, window.innerWidth - tooltipRect.width - 8));
      this._tooltipEl.style.left = correctedLeft + 'px';
      this._tooltipEl.style.top  = (anchorRect.top - tooltipRect.height - 8) + 'px';
      this._tooltipEl.classList.add('sw-tooltip--visible');
    });
  }

  _hideTooltip () {
    this._tooltipEl.classList.remove('sw-tooltip--visible');
    this._tooltipEl.setAttribute('aria-hidden', 'true');
  }

  /* ── EVENT LISTENERS ───────────────────────────────────────── */
  _setupEventListeners () {
    this._triggerBtn.addEventListener('click', () => this._openPanel());
    this._closePanelBtn.addEventListener('click', () => this._closePanel());
    this._overlayEl.addEventListener('click', () => this._closePanel());
    document.addEventListener('keydown', (keyEvent) => {
      if (!this._isOpen) return;
      if (keyEvent.key === 'Escape') {
        keyEvent.preventDefault();
        this._closePanel();
        return;
      }
      if (keyEvent.key === 'Tab') {
        this._handleFocusTrap(keyEvent);
      }
    });

    this._panelEl.addEventListener('click', (clickEvent) => {
      const actionTarget = clickEvent.target.closest('[data-action]');
      if (!actionTarget) return;

      const action = actionTarget.dataset.action;

      switch (action) {
        case 'open-category':
          this._showCategoryScreen(actionTarget.dataset.categoryId);
          break;

        case 'open-answer':
          this._showAnswerScreen({
            faqId:         actionTarget.dataset.faqId,
            question:      actionTarget.dataset.question,
            answer:        actionTarget.dataset.answer,
            categoryLabel: actionTarget.dataset.categoryLabel,
            categoryId:    actionTarget.dataset.categoryId
          });
          break;

        case 'go-home':
          this._showHomeScreen();
          break;

        case 'go-to-faq':
          const faqData = this.faqItems[actionTarget.dataset.faqId];
          if (faqData) {
            this._showAnswerScreen({
              faqId:         faqData.id,
              question:      faqData.question,
              answer:        faqData.answer,
              categoryLabel: faqData.categoryLabel,
              categoryId:    faqData.categoryId
            });
          }
          break;

        case 'go-to-category-from-answer':
          if (this._activeCategoryId) {
            this._showCategoryScreen(this._activeCategoryId);
          }
          break;
      }
    });

    this._answerBackBtn.addEventListener('click', () => {
      if (this._activeCategoryId) {
        this._showCategoryScreen(this._activeCategoryId);
      } else {
        this._showHomeScreen();
      }
    });
  }

  _openPanel () {
    this._isOpen = true;
    document.body.style.overflow = 'hidden';
    this.classList.add('sw--open');
    this._triggerBtn.setAttribute('aria-expanded', 'true');
  }

  _closePanel () {
    this._isOpen = false;
    document.body.style.overflow = '';
    this.classList.remove('sw--open');
    this._triggerBtn.setAttribute('aria-expanded', 'false');
    this._hideTooltip();

    const panelTransitionDuration = (parseFloat(
      getComputedStyle(this._panelEl).transitionDuration
    ) || 0.32) * 1000;

    setTimeout(() => {
      this._triggerBtn.focus({ preventScroll: true });
    }, panelTransitionDuration * 0.6);
  }

  _getFocusableElements () {
    return Array.from(this._panelEl.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(el => !el.closest('[hidden]') && el.offsetParent !== null);
  }

  _getFirstFocusableElement () {
    return this._getFocusableElements()[0] || null;
  }

  _handleFocusTrap (keyEvent) {
    const focusableElements = this._getFocusableElements();
    const firstElement = focusableElements[0];
    const lastElement  = focusableElements[focusableElements.length - 1];

    if (!firstElement) return;

    if (keyEvent.shiftKey) {
      if (document.activeElement === firstElement) {
        keyEvent.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        keyEvent.preventDefault();
        firstElement.focus();
      }
    }
  }

  _setActiveScreen (screenName) {
    this._currentScreen = screenName;
    this._panelEl.querySelectorAll('.sw-screen').forEach(screenEl => {
      const isActive = screenEl.dataset.screen === screenName;
      screenEl.classList.toggle('sw-screen--active', isActive);
      if (isActive) screenEl.removeAttribute('hidden');
      else          screenEl.setAttribute('hidden', '');
    });
  }

  _showHomeScreen () {
    this._activeCategoryId = null;
    this._activeFaqId      = null;
    this._setActiveScreen('home');
    const homeTitle = this._panelEl.querySelector('#sw-panel-title');
    if (homeTitle) homeTitle.focus({ preventScroll: true });
  }

  _showCategoryScreen (categoryId) {
    this._activeCategoryId = categoryId;

    const categoryData  = this.faqCategories[categoryId] || {};
    const faqListEl     = this._panelEl.querySelector('#sw-category-faq-list');
    const categoryTitle = this._panelEl.querySelector('#sw-category-title');
    categoryTitle.textContent = categoryData.name || 'Category';
    faqListEl.innerHTML = '';

    const categoryFaqs = Object.values(this.faqItems).filter(faq => faq.categoryId === categoryId);

    if (categoryFaqs.length === 0) {
      faqListEl.innerHTML = `<p class="sw-empty">${this.emptyCategoryText}</p>`;
    } else {
      categoryFaqs.forEach(faq => {
        const faqButton = document.createElement('button');
        faqButton.className            = 'sw-faq-item';
        faqButton.dataset.action       = 'open-answer';
        faqButton.dataset.faqId        = faq.id;
        faqButton.dataset.question     = faq.question;
        faqButton.dataset.answer       = faq.answer;
        faqButton.dataset.categoryLabel = faq.categoryLabel;
        faqButton.dataset.categoryId   = faq.categoryId;
        faqButton.setAttribute('role', 'listitem');
        faqButton.innerHTML = `
          <span class="sw-faq-item__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 8h14M5 8a2 2 0 1 0 0-4h14a2 2 0 1 0 0 4M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/>
            </svg>
          </span>
          <span>
            <p class="sw-faq-item__question">${this._escapeHtml(faq.question)}</p>
            <p class="sw-faq-item__category">${this._escapeHtml(faq.categoryLabel)}</p>
          </span>`;
        faqListEl.appendChild(faqButton);
      });
    }

    this._setActiveScreen('category');
    requestAnimationFrame(() => categoryTitle.focus({ preventScroll: true }));
  }

  _showAnswerScreen ({ faqId, question, answer, categoryLabel, categoryId }) {
    this._activeFaqId      = faqId;
    this._activeCategoryId = categoryId || this._activeCategoryId;

    /* Populate answer */
    this._panelEl.querySelector('#sw-answer-title').textContent         = question;
    // this._panelEl.querySelector('#sw-answer-category-label').textContent = categoryLabel;
    this._panelEl.querySelector('#sw-answer-text').innerHTML             = answer;

    /* Category pill — clicking takes user to category screen */
    const categoryPill  = this._panelEl.querySelector('#sw-answer-category-btn');
    const categoryPillLabel = this._panelEl.querySelector('#sw-answer-category-btn-label');
    categoryPillLabel.textContent   = categoryLabel;
    categoryPill.dataset.categoryId = this._activeCategoryId;

    /* Prev / Next navigation within same category */
    const navContainer = this._panelEl.querySelector('#sw-answer-nav');
    navContainer.innerHTML = '';

    const siblingFaqs = Object.values(this.faqItems).filter(
      faq => faq.categoryId === this._activeCategoryId
    );
    const currentIndex = siblingFaqs.findIndex(faq => faq.id === faqId);

    if (currentIndex > 0) {
      const previousFaq = siblingFaqs[currentIndex - 1];
      navContainer.appendChild(
        this._buildNavLink(previousFaq.question, previousFaq, 'prev')
      );
    }
    if (currentIndex >= 0 && currentIndex < siblingFaqs.length - 1) {
      const nextFaq = siblingFaqs[currentIndex + 1];
      navContainer.appendChild(
        this._buildNavLink(nextFaq.question, nextFaq, 'next')
      );
    }

    this._setActiveScreen('answer');
    requestAnimationFrame(() => {
      const answerTitle = this._panelEl.querySelector('#sw-answer-title');
      if (answerTitle) answerTitle.focus({ preventScroll: true });
    });
  }

  _buildNavLink (labelText, faq, direction) {
    const navBtn = document.createElement('button');
    navBtn.className      = `sw-answer-nav__link sw-answer-nav__link--${direction}`;
    navBtn.dataset.action = 'go-to-faq';
    navBtn.dataset.faqId  = faq.id;
    navBtn.dataset.question = faq.question;
    navBtn.dataset.answer = faq.answer;
    navBtn.dataset.categoryLabel = faq.categoryLabel;
    navBtn.dataset.categoryId = faq.categoryId;
    navBtn.innerHTML = `
        ${direction === 'prev'
          ? this.arrowIconPrev
          : this.arrowIconNext}
      <p class="sw-answer-nav__label">${this._escapeHtml(labelText)}</p>`;
    return navBtn;
  }

  _escapeHtml (rawString) {
    const tempDiv = document.createElement('div');
    tempDiv.textContent = rawString;
    return tempDiv.innerHTML;
  }
}

customElements.define('support-widget', SupportWidget);