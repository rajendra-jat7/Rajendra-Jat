(function () {
  const money = (cents) => {
    try {
      const cur = (window.Shopify && Shopify.currency && Shopify.currency.active) || 'USD';
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(cents / 100);
    } catch { return (cents / 100).toFixed(2); }
  };
  const strip = (html) => (html || '').replace(/<[^>]+>/g, '').trim();

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-section-type="ecom-product-grid"]').forEach(initSection);
  });

  function initSection(section) {
    const sid = section.dataset.sectionId;
    const modal = section.querySelector('#EcomModal-' + sid);
    const imgEl = modal.querySelector('.ecom-modal__left img');
    const titleEl = modal.querySelector('.ecom-modal__title');
    const priceEl = modal.querySelector('.ecom-modal__price');
    const descEl = modal.querySelector('.ecom-modal__desc');
    const optsWrap = modal.querySelector('.ecom-modal__options');
    const statusEl = modal.querySelector('.ecom-modal__status');

    const productMap = {};
    section.querySelectorAll('.ProductJson').forEach(s => {
      productMap[s.dataset.handle] = JSON.parse(s.textContent);
    });

    const autoJson = section.querySelector('#AutoProductJson-' + sid);
    const autoProduct = autoJson ? JSON.parse(autoJson.textContent) : null;

    let currentProduct = null;
    let selected = [];

    section.querySelectorAll('.ecom-card__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = productMap[btn.dataset.handle];
        openModal(p);
      });
    });

    modal.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeModal));
    function closeModal() { modal.hidden = true; document.body.style.overflow = ''; }

    modal.querySelector('[data-add]').addEventListener('click', addToCart);

    function openModal(product) {
      currentProduct = product;

      const media = (product.media && product.media[0]) || null;
      const featured = media ? media.src : (product.featured_image ? product.featured_image.src : '');
      imgEl.src = featured ? (featured + '&width=900') : '';

      titleEl.textContent = product.title;
      descEl.textContent = strip(product.description_html || product.description);

      // preselect first available variant
      const fav = product.variants.find(v => v.available) || product.variants[0];
      selected = fav.options.slice();

      buildOptions(product);
      updatePrice(getVariant());

      modal.hidden = false;
      document.body.style.overflow = 'hidden';
      statusEl.textContent = '';
    }

    function buildOptions(product) {
      optsWrap.innerHTML = '';
      product.options.forEach((name, idx) => {
        const row = document.createElement('div');
        row.className = 'ecom-option';
        const label = document.createElement('strong');
        label.textContent = name + ':';
        row.appendChild(label);

        const values = Array.from(new Set(product.variants.map(v => v.options[idx])));
        values.forEach(val => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'ecom-chip';
          chip.textContent = val;
          chip.setAttribute('aria-pressed', String(selected[idx] === val));
          chip.addEventListener('click', () => {
            selected[idx] = val;
            row.querySelectorAll('.ecom-chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
            chip.setAttribute('aria-pressed', 'true');
            updatePrice(getVariant());
          });
          row.appendChild(chip);
        });

        optsWrap.appendChild(row);
      });
    }

    function getVariant() {
      const v = currentProduct.variants.find(v =>
        v.options.every((opt, i) => opt === selected[i])
      ) || currentProduct.variants[0];

      modal.dataset.variantId = v.id;
      return v;
    }

    function updatePrice(variant) {
      priceEl.textContent = money(variant.price);
    }

    async function addToCart() {
      const v = getVariant();

      try {
        await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: v.id, quantity: 1 })
        });

        // Auto-add rule: options contain Black and Medium
        const hasBlack = v.options.some(o => (o || '').toLowerCase() === 'black');
        const hasMedium = v.options.some(o => (o || '').toLowerCase() === 'medium');

        if (hasBlack && hasMedium && autoProduct) {
          const autoVar = autoProduct.variants.find(x => x.available) || autoProduct.variants[0];
          if (autoVar) {
            await fetch('/cart/add.js', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: autoVar.id, quantity: 1 })
            });
          }
        }

        statusEl.textContent = 'Added to cart';
      } catch (e) {
        statusEl.textContent = 'Could not add to cart';
      }
    }
  }
})();
