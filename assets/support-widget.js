/* Screen order is used to figure out whether a screen change should be
   treated as "forward" (slide in from the right) or "backward" (slide in
   from the left) when no explicit direction is supplied. */
const SCREEN_ORDER = ['home', 'category', 'answer'];

/* Heading id for each screen — used to move focus to the right place after
   a transition completes, and to keep the dialog's aria-labelledby pointing
   at whichever screen is actually showing. */
const SCREEN_HEADING_IDS = {
  home: 'sw-panel-title',
  category: 'sw-category-title',
  answer: 'sw-answer-title'
};

/* ── CUSTOM ELEMENT ──────────────────────────────────────────── */
class SupportWidget extends HTMLElement {

  constructor() {
    super();
  }

  connectedCallback() {
    /* State */
    this._isOpen = false;
    this._currentScreen = 'home';
    this._activeCategoryId = null;
    this._activeFaqId = null;
    this._answerOrigin = null;
    this._tooltipTimer = null;
    this._isTransitioning = false;
    this._lastFocusedBeforeOpen = null;

    /* DOM refs */
    this._triggerBtn = this.querySelector('#sw-trigger');
    this._overlayEl = this.querySelector('#sw-overlay');
    this._panelEl = this.querySelector('#sw-panel');
    this._closePanelBtn = this.querySelector('#sw-close-btn');
    this._tooltipEl = this.querySelector('#sw-tooltip');
    this._answerBackBtn = this.querySelector('#sw-answer-back-btn');
    this.faqItems = JSON.parse(this.dataset.faqItems || '{}');
    this.faqCategories = JSON.parse(this.dataset.faqCategories || '{}');
    this.arrowIconPrev = this.dataset.arrowIconPrev || '';
    this.arrowIconNext = this.dataset.arrowIconNext || '';
    this.emptyCategoryText = this.dataset.emptyCategoryText || 'No questions in this category yet.';

    this._setupTooltips();
    this._setupEventListeners();
  }

  /* ── TOOLTIP SYSTEM ────────────────────────────────────────── */
  _setupTooltips() {
    const contactButtons = this.querySelectorAll('.sw-contact-btn[data-tooltip]');

    contactButtons.forEach(btn => {
      const showTooltip = () => this._showTooltip(btn);
      const hideTooltip = () => this._hideTooltip();

      /* Mouse */
      btn.addEventListener('mouseenter', showTooltip);
      btn.addEventListener('mouseleave', hideTooltip);
      btn.addEventListener('focus', showTooltip);
      btn.addEventListener('blur', hideTooltip);

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

  _showTooltip(anchorElement) {
    if (window.innerWidth < 481) return;
    if (!anchorElement) return;
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
    this._tooltipEl.style.top = (anchorRect.top - 40) + 'px';

    /* Measure actual width after paint and re-center */
    requestAnimationFrame(() => {
      const tooltipRect = this._tooltipEl.getBoundingClientRect();
      let correctedLeft = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
      correctedLeft = Math.max(8, Math.min(correctedLeft, window.innerWidth - tooltipRect.width - 8));
      this._tooltipEl.style.left = correctedLeft + 'px';
      this._tooltipEl.style.top = (anchorRect.top - tooltipRect.height - 8) + 'px';
      this._tooltipEl.classList.add('sw-tooltip--visible');
    });
  }

  _hideTooltip() {
    this._tooltipEl.classList.remove('sw-tooltip--visible');
    this._tooltipEl.setAttribute('aria-hidden', 'true');
  }

  /* ── EVENT LISTENERS ───────────────────────────────────────── */
  _setupEventListeners() {
    this._triggerBtn?.addEventListener('click', () => this._openPanel());
    this._closePanelBtn?.addEventListener('click', () => this._closePanel());
    this._overlayEl?.addEventListener('click', () => this._closePanel());
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

    this._panelEl?.addEventListener('click', (clickEvent) => {
      const actionTarget = clickEvent.target.closest('[data-action]');
      if (!actionTarget) return;

      const action = actionTarget.dataset.action;

      switch (action) {
        case 'open-category':
          this._showCategoryScreen(actionTarget.dataset.categoryId);
          break;

        case 'open-answer':
          this._answerOrigin = this._currentScreen;
          this._showAnswerScreen({
            faqId: actionTarget.dataset.faqId,
            question: actionTarget.dataset.question,
            answer: actionTarget.dataset.answer,
            categoryLabel: actionTarget.dataset.categoryLabel,
            categoryId: actionTarget.dataset.categoryId
          });
          break;

        case 'go-home':
          this._showHomeScreen();
          break;

        case 'go-to-faq': {
          const faqData = this.faqItems[actionTarget.dataset.faqId];
          if (faqData) {
            this._showAnswerScreen({
              faqId: faqData.id,
              question: faqData.question,
              answer: faqData.answer,
              categoryLabel: faqData.categoryLabel,
              categoryId: faqData.categoryId,
              /* "next" pushes forward, "prev" goes backward — matches the
                 arrow direction the user actually clicked. */
              direction: actionTarget.dataset.navDirection === 'prev' ? 'backward' : 'forward'
            });
          }
          break;
        }

        case 'go-to-category-from-answer':
          if (this._activeCategoryId) {
            this._showCategoryScreen(this._activeCategoryId);
          }
          break;
      }
    });

    this._answerBackBtn?.addEventListener('click', () => {
      if (this._answerOrigin === 'category' && this._activeCategoryId) {
        this._showCategoryScreen(this._activeCategoryId);
      } else {
        this._showHomeScreen();
      }
    });
  }

  _openPanel() {
    this._isOpen = true;
    this._lastFocusedBeforeOpen = document.activeElement;
    document.body.style.overflow = 'hidden';
    this.classList.add('sw--open');
    this._triggerBtn.setAttribute('aria-expanded', 'true');

    /* Move focus inside the dialog so the Tab-trap below actually has
       something of ours to trap. Without this, focus stays on the trigger
       button (which sits outside .sw-panel), so Tab can escape the widget
       entirely on the very first press. */
    requestAnimationFrame(() => {
      const headingId = SCREEN_HEADING_IDS[this._currentScreen];
      const heading = headingId && this._panelEl.querySelector(`#${headingId}`);
      const focusTarget = heading || this._getFirstFocusableElement() || this._panelEl;
      focusTarget.focus({ preventScroll: true });
    });
  }

  _closePanel() {
    this._isOpen = false;
    document.body.style.overflow = '';
    this.classList.remove('sw--open');
    this._triggerBtn.setAttribute('aria-expanded', 'false');
    this._hideTooltip();

    const panelTransitionDuration = (parseFloat(
      getComputedStyle(this._panelEl).transitionDuration
    ) || 0.32) * 1000;

    setTimeout(() => {
      /* Return focus to wherever it came from (normally the trigger
         button), falling back to the trigger if that element is gone. */
      const refocusTarget = (this._lastFocusedBeforeOpen && document.contains(this._lastFocusedBeforeOpen))
        ? this._lastFocusedBeforeOpen
        : this._triggerBtn;
      refocusTarget.focus({ preventScroll: true });
      this._lastFocusedBeforeOpen = null;
    }, panelTransitionDuration * 0.6);
  }

  _getFocusableElements() {
    return Array.from(this._panelEl.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(el =>
      !el.closest('[hidden]') &&
      !el.closest('[inert]') &&
      !el.closest('[aria-hidden="true"]') &&
      el.offsetParent !== null
    );
  }

  _getFirstFocusableElement() {
    return this._getFocusableElements()[0] || null;
  }

  _handleFocusTrap(keyEvent) {
    const focusableElements = this._getFocusableElements();
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

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

  /* ── SCREEN TRANSITIONS ───────────────────────────────────────
     Figures out forward/backward automatically from SCREEN_ORDER unless
     the caller passes an explicit direction (used for prev/next FAQ nav,
     which moves sideways within the same screen depth). */
  _resolveDirection(targetScreen, explicitDirection) {
    if (explicitDirection) return explicitDirection;
    const fromIndex = SCREEN_ORDER.indexOf(this._currentScreen);
    const toIndex = SCREEN_ORDER.indexOf(targetScreen);
    return toIndex >= fromIndex ? 'forward' : 'backward';
  }

  _transitionToScreen(targetScreen, { direction = 'forward', onComplete } = {}) {
    const incomingEl = this._panelEl.querySelector(`[data-screen="${targetScreen}"]`);
    if (!incomingEl) return;

    const outgoingEl = this._panelEl.querySelector('.sw-screen--active');

    /* Already showing this screen and nothing is mid-animation: just
       refocus and bail. */
    if (outgoingEl === incomingEl && !this._isTransitioning) {
      if (onComplete) onComplete();
      return;
    }

    /* Ignore new navigation while a transition is running so rapid clicks
       can't leave two screens half-animated at once. */
    if (this._isTransitioning) return;

    this._isTransitioning = true;
    this._currentScreen = targetScreen;

    const headingId = SCREEN_HEADING_IDS[targetScreen];
    if (headingId) this._panelEl.setAttribute('aria-labelledby', headingId);

    const enterClass = direction === 'forward' ? 'sw-screen--enter-forward' : 'sw-screen--enter-backward';
    const exitClass = direction === 'forward' ? 'sw-screen--exit-forward' : 'sw-screen--exit-backward';
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let settled = false;
    let fallbackTimer = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(fallbackTimer);
      incomingEl.removeEventListener('transitionend', finish);

      incomingEl.classList.remove(
        'sw-screen--enter-forward', 'sw-screen--enter-backward',
        'sw-screen--exit-forward', 'sw-screen--exit-backward'
      );
      incomingEl.removeAttribute('aria-hidden');
      incomingEl.inert = false;

      if (outgoingEl && outgoingEl !== incomingEl) {
        outgoingEl.classList.remove(
          'sw-screen--active',
          'sw-screen--exit-forward', 'sw-screen--exit-backward'
        );
        outgoingEl.setAttribute('hidden', '');
        outgoingEl.removeAttribute('aria-hidden');
        outgoingEl.inert = false;
      }

      this._isTransitioning = false;
      if (onComplete) onComplete();
    };

    /* Put the incoming screen at its off-screen starting position and make
       the outgoing screen non-interactive (it's about to slide away). */
    incomingEl.removeAttribute('hidden');
    incomingEl.inert = false;
    incomingEl.classList.add('sw-screen--active', enterClass);

    if (outgoingEl && outgoingEl !== incomingEl) {
      outgoingEl.inert = true;
      outgoingEl.setAttribute('aria-hidden', 'true');
    }

    if (prefersReducedMotion) {
      finish();
      return;
    }

    /* Force a reflow so the browser commits the starting transform/opacity
       above before we flip to the resting state below — otherwise both
       style changes can get batched into one frame and the transition
       never visibly runs. */
    void incomingEl.offsetWidth;

    requestAnimationFrame(() => {
      incomingEl.classList.remove(enterClass);
      if (outgoingEl && outgoingEl !== incomingEl) {
        outgoingEl.classList.add(exitClass);
      }
    });

    incomingEl.addEventListener('transitionend', finish);
    /* Fallback in case transitionend never fires for some reason. */
    fallbackTimer = setTimeout(finish, 420);
  }

  _showHomeScreen() {
    this._activeCategoryId = null;
    this._activeFaqId = null;
    this._answerOrigin = null;

    const direction = this._resolveDirection('home');
    this._transitionToScreen('home', {
      direction,
      onComplete: () => {
        const homeTitle = this._panelEl.querySelector('#sw-panel-title');
        if (homeTitle) homeTitle.focus({ preventScroll: true });
      }
    });
  }

  _showCategoryScreen(categoryId, { direction: explicitDirection } = {}) {
    this._activeCategoryId = categoryId;

    const categoryData = this.faqCategories[categoryId] || {};
    const faqListEl = this._panelEl.querySelector('#sw-category-faq-list');
    const categoryTitle = this._panelEl.querySelector('#sw-category-title');
    categoryTitle.textContent = categoryData.name || 'Category';
    faqListEl.innerHTML = '';

    const categoryFaqs = Object.values(this.faqItems).filter(faq => faq.categoryId === categoryId);

    if (categoryFaqs.length === 0) {
      faqListEl.innerHTML = `<p class="sw-empty">${this._escapeHtml(this.emptyCategoryText)}</p>`;
    } else {
      categoryFaqs.forEach(faq => {
        const faqButton = document.createElement('button');
        faqButton.className = 'sw-faq-item';
        faqButton.type = 'button';
        faqButton.dataset.action = 'open-answer';
        faqButton.dataset.faqId = faq.id;
        faqButton.dataset.question = faq.question;
        faqButton.dataset.answer = faq.answer;
        faqButton.dataset.categoryLabel = faq.categoryLabel;
        faqButton.dataset.categoryId = faq.categoryId;
        faqButton.setAttribute('role', 'listitem');
        faqButton.innerHTML = `
          <span class="sw-faq-item__icon">${categoryData.icon}</span>
          <span>
            <p class="sw-faq-item__question">${this._escapeHtml(faq.question)}</p>
            <p class="sw-faq-item__category">${this._escapeHtml(faq.categoryLabel)}</p>
          </span>`;
        faqListEl.appendChild(faqButton);
      });
    }

    const direction = this._resolveDirection('category', explicitDirection);
    this._transitionToScreen('category', {
      direction,
      onComplete: () => categoryTitle.focus({ preventScroll: true })
    });
  }

  _populateAnswerContent({ faqId, question, answer, categoryLabel, categoryId }) {
    this._activeFaqId = faqId;
    this._activeCategoryId = categoryId || this._activeCategoryId;

    this._panelEl.querySelector('#sw-answer-title').textContent = question;
    this._panelEl.querySelector('#sw-answer-text').innerHTML = answer;

    const categoryPill = this._panelEl.querySelector('#sw-answer-category-btn');
    const categoryPillLabel = this._panelEl.querySelector('#sw-answer-category-btn-label');
    categoryPillLabel.textContent = categoryLabel;
    categoryPill.dataset.categoryId = this._activeCategoryId;

    const navContainer = this._panelEl.querySelector('#sw-answer-nav');
    navContainer.innerHTML = '';

    const siblingFaqs = Object.values(this.faqItems).filter(
      faq => faq.categoryId === this._activeCategoryId
    );
    const currentIndex = siblingFaqs.findIndex(faq => faq.id === faqId);

    if (currentIndex > 0) {
      navContainer.appendChild(this._buildNavLink(siblingFaqs[currentIndex - 1], 'prev'));
    }
    if (currentIndex >= 0 && currentIndex < siblingFaqs.length - 1) {
      navContainer.appendChild(this._buildNavLink(siblingFaqs[currentIndex + 1], 'next'));
    }
  }

  _swapAnswerContent(faqData, direction) {
    const bodyEl = this._panelEl.querySelector('#sw-answer-body');
    const headingEl = this._panelEl.querySelector('.sw-answer-heading');

    /* Defensive fallback if the markup hasn't been updated with the
       #sw-answer-body wrapper yet — just swap instantly instead of breaking. */
    if (!bodyEl) {
      this._populateAnswerContent(faqData);
      const fallbackTitle = this._panelEl.querySelector('#sw-answer-title');
      if (fallbackTitle) fallbackTitle.focus({ preventScroll: true });
      return;
    }

    this._isTransitioning = true;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const exitClass = direction === 'forward' ? 'sw-answer-body--exit-forward' : 'sw-answer-body--exit-backward';
    const enterClass = direction === 'forward' ? 'sw-answer-body--enter-forward' : 'sw-answer-body--enter-backward';
    const headingExitClass = direction === 'forward' ? 'sw-answer-heading--exit-forward' : 'sw-answer-heading--exit-backward';
    const headingEnterClass = direction === 'forward' ? 'sw-answer-heading--enter-forward' : 'sw-answer-heading--enter-backward';

    const swapContentAndEnter = () => {
      /* Swap the actual content while the block is faded out/off-position,
         so the user never sees the old and new answers overlap. */
      this._populateAnswerContent(faqData);

      /* The clicked Prev/Next button was just destroyed and rebuilt by the
         line above. Re-anchor focus immediately — otherwise it falls back
         to <body> for the rest of this animation and Tab can escape the
         panel, the exact bug we fixed earlier for screen transitions. */
      const answerTitle = this._panelEl.querySelector('#sw-answer-title');
      if (answerTitle) answerTitle.focus({ preventScroll: true });

      bodyEl.classList.remove(exitClass);
      if (headingEl) headingEl.classList.remove(headingExitClass);

      if (prefersReducedMotion) {
        this._isTransitioning = false;
        return;
      }

      bodyEl.classList.add(enterClass);
      if (headingEl) headingEl.classList.add(headingEnterClass);

      void bodyEl.offsetWidth; /* force reflow before animating to resting state */

      requestAnimationFrame(() => {
        bodyEl.classList.remove(enterClass);
        if (headingEl) headingEl.classList.remove(headingEnterClass);
      });

      let enterSettled = false;
      let enterFallback = null;
      const finishEnter = () => {
        if (enterSettled) return;
        enterSettled = true;
        clearTimeout(enterFallback);
        bodyEl.removeEventListener('transitionend', finishEnter);
        this._isTransitioning = false;
      };
      bodyEl.addEventListener('transitionend', finishEnter);
      enterFallback = setTimeout(finishEnter, 420);
    };

    if (prefersReducedMotion) {
      swapContentAndEnter();
      return;
    }

    bodyEl.classList.add(exitClass);
    if (headingEl) headingEl.classList.add(headingExitClass);

    let exitSettled = false;
    let exitFallback = null;
    const finishExit = () => {
      if (exitSettled) return;
      exitSettled = true;
      clearTimeout(exitFallback);
      bodyEl.removeEventListener('transitionend', finishExit);
      swapContentAndEnter();
    };
    bodyEl.addEventListener('transitionend', finishExit);
    exitFallback = setTimeout(finishExit, 420);
  }

  _showAnswerScreen({ faqId, question, answer, categoryLabel, categoryId, direction: explicitDirection } = {}) {
    if (this._isTransitioning) return; // ignore rapid clicks mid-animation

    const direction = this._resolveDirection('answer', explicitDirection);

    /* Already on the answer screen, just moving to a sibling FAQ via
       Prev/Next — animate the content in place. A full screen-to-screen
       transition would be a no-op here since source and destination are
       literally the same screen element. */
    if (this._currentScreen === 'answer') {
      this._swapAnswerContent({ faqId, question, answer, categoryLabel, categoryId }, direction);
      return;
    }

    this._populateAnswerContent({ faqId, question, answer, categoryLabel, categoryId });
    this._transitionToScreen('answer', {
      direction,
      onComplete: () => {
        const answerTitle = this._panelEl.querySelector('#sw-answer-title');
        if (answerTitle) answerTitle.focus({ preventScroll: true });
      }
    });
  }

  _buildNavLink(faq, navDirection) {
    const navBtn = document.createElement('button');
    navBtn.type = 'button';
    navBtn.className = `sw-answer-nav__link sw-answer-nav__link--${navDirection}`;
    navBtn.dataset.action = 'go-to-faq';
    navBtn.dataset.faqId = faq.id;
    navBtn.dataset.navDirection = navDirection;
    navBtn.innerHTML = `
        ${navDirection === 'prev' ? this.arrowIconPrev : this.arrowIconNext}
      <p class="sw-answer-nav__label">${this._escapeHtml(faq.question)}</p>`;
    return navBtn;
  }

  _escapeHtml(rawString) {
    const tempDiv = document.createElement('div');
    tempDiv.textContent = rawString;
    return tempDiv.innerHTML;
  }
}

customElements.define('support-widget', SupportWidget);