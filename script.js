const setFooterYear = () => {
  const footerYear = document.querySelector('[data-year]');
  if (footerYear) {
    footerYear.textContent = new Date().getFullYear();
  }
};

const bindImageLightbox = () => {
  const modal = document.getElementById('imageModal');
  const modalImage = document.getElementById('modalImage');
  const modalTitle = document.getElementById('imageModalTitle');
  const closeButton = document.querySelector('.image-modal-close');

  if (!modal || !modalImage || !modalTitle || !closeButton) return;

  const openModal = (image) => {
    if (!image) return;
    modalImage.src = image.src;
    modalImage.alt = image.alt || 'Expanded preview';
    modalTitle.textContent = image.alt || 'Preview';
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  document.addEventListener('click', (event) => {
    const image = event.target.closest('.lightbox-image');
    if (image) {
      openModal(image);
    }
  });

  closeButton.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => {
    if (event.target.matches('[data-close="true"]')) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('is-open')) {
      closeModal();
    }
  });
};

const bindNewsImageFallback = () => {
  document.addEventListener('error', (event) => {
    const image = event.target;
    if (
      !(image instanceof HTMLImageElement) ||
      image.dataset.newsImageFailed === 'true' ||
      (!image.closest('.news-summary-card') && image.id !== 'storyImage')
    ) {
      return;
    }

    image.dataset.newsImageFailed = 'true';
    image.hidden = true;
    image.closest('.news-summary-card')?.classList.add('text-only');
  }, true);
};

const bindMobileNavigation = () => {
  const toggle = document.querySelector('.nav-toggle');
  const nav = toggle?.closest('.nav');
  const links = document.getElementById(toggle?.getAttribute('aria-controls') || '');
  if (!toggle || !nav || !links) return;

  const setExpanded = (expanded) => {
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', expanded ? 'Close navigation menu' : 'Open navigation menu');
    nav.classList.toggle('menu-open', expanded);
  };

  toggle.addEventListener('click', () => {
    setExpanded(toggle.getAttribute('aria-expanded') !== 'true');
  });

  links.addEventListener('click', (event) => {
    if (event.target.closest('a')) setExpanded(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setExpanded(false);
      toggle.focus();
    }
  });

  document.addEventListener('click', (event) => {
    if (!nav.contains(event.target)) setExpanded(false);
  });

  window.matchMedia('(min-width: 641px)').addEventListener('change', (event) => {
    if (event.matches) setExpanded(false);
  });
};

setFooterYear();
bindImageLightbox();
bindNewsImageFallback();
bindMobileNavigation();
