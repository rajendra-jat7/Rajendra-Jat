// @ts-nocheck

// ecom-grid.js — Vanilla JS only
(function () {
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Money formatting — will show store's formatted money if you prefer server-side
  const formatMoney = (cents, symbol = '') => {
    const v = (Number(cents) / 100).toFixed(2);
    return symbol ? `${symbol}${v}` : v;
  };

  const gridSection = document.querySelector('.ecom-product-grid');
  if (!gridSection) return;

  const modal     = $('.ecom-modal', gridSection);
  const imgEl     = $('.ecom-modal__img', modal);
  const titleEl   = $('.ecom-modal__title', modal);
  const priceEl   = $('.ecom-modal__price', modal);
  const descEl    = $('.ecom-modal__desc', modal);
  const optionsEl = $('[data-options]', modal);
  const addBtn    = $('[data-add-to-cart]', modal);
  const statusEl  = $('.ecom-modal__status', modal);

  let activeProduct = null;
  let selectedOptions = []; // [{name, value}]
  let selectedVariant = null;
  let upsell = null;

  // Read upsell product json if present
  const upsellScript = $('.UpsellJson', gridSection);
  upsell = upsellScript ? JSON.parse(upsellScript.textContent.trim()) : null;

  // Card click -> open modal
  gridSection.addEventListener('click', (e) => {
    const card = e.target.closest('[data-quick-view]');
    if (!card) return;

    const pj = card.querySelector('.ProductJson');
    if (!pj) return;

    activeProduct = JSON.parse(pj.textContent.trim());
    openModal(activeProduct);
  });

  function openModal(product) {
    // media
    const fm = product.featured_image || product.images?.[0] || null;
    imgEl.src = fm ? (typeof fm === 'string' ? fm : fm.src) : '';
    imgEl.alt = product.title;

    // text
    titleEl.textContent = product.title;
    const cleanDesc = (product.body_html || '').replace(/<[^>]+>/g, '');
    descEl.textContent = cleanDesc.slice(0, 300);

    // default selected options = first variant's options
    selectedOptions = product.options.map((name, idx) => ({
      name,
      value: product.variants[0].options[idx]
    }));

    // build options rows
    optionsEl.innerHTML = '';
    product.options.forEach((optName, optIndex) => {
      const values = Array.from(new Set(product.variants.map(v => v.options[optIndex])));
      const row = document.createElement('div');
      row.className = 'ecom-option';
      const label = document.createElement('strong');
      label.textContent = optName + ':';
      row.append(label);

      values.forEach(val => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = (optName.toLowerCase() === 'color') ? 'ecom-swatch' : 'ecom-chip';
        btn.textContent = val;
        btn.setAttribute('aria-pressed', val === selectedOptions[optIndex].value ? 'true' : 'false');
        btn.addEventListener('click', () => {
          selectedOptions[optIndex].value = val;
          $$('.ecom-swatch, .ecom-chip', row).forEach(b => b.setAttribute('aria-pressed', 'false'));
          btn.setAttribute('aria-pressed', 'true');
          refreshVariant();
        });
        row.append(btn);
      });

      optionsEl.append(row);
    });

    refreshVariant();
    modal.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    statusEl.textContent = '';
  }

  // Close modal
  modal.addEventListener('click', (e) => {
    if (e.target.matches('[data-close]')) {
      modal.hidden = true;
      document.documentElement.style.overflow = '';
      statusEl.textContent = '';
    }
  });

  function refreshVariant() {
    const v = activeProduct.variants.find(variant =>
      selectedOptions.every((opt, i) => variant.options[i] === opt.value)
    );
    selectedVariant = v || activeProduct.variants.find(v => v.available) || activeProduct.variants[0];
    priceEl.textContent = formatMoney(selectedVariant.price);
  }

  async function addToCart(variantId, qty = 1) {
    const res = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ id: variantId, quantity: qty })
    });
    if (!res.ok) throw new Error('Add to cart failed');
    return res.json();
  }

  async function maybeAutoAddUpsell() {
    if (!upsell || !Array.isArray(selectedOptions)) return;
    const hasBlack  = selectedOptions.some(o => String(o.value).toLowerCase() === 'black');
    const hasMedium = selectedOptions.some(o => String(o.value).toLowerCase() === 'medium');

    if (hasBlack && hasMedium && activeProduct.handle !== upsell.handle) {
      const uv = upsell.variants.find(v => v.available) || upsell.variants[0];
      if (uv) {
        try { await addToCart(uv.id, 1); } catch (e) {}
      }
    }
  }

  addBtn?.addEventListener('click', async () => {
    if (!selectedVariant) return;
    addBtn.disabled = true;
    statusEl.textContent = 'Adding…';
    try {
      await addToCart(selectedVariant.id, 1);
      await maybeAutoAddUpsell();
      statusEl.textContent = 'Added to cart ✔';
      document.dispatchEvent(new CustomEvent('cart:refresh'));
    } catch (e) {
      statusEl.textContent = 'Error adding to cart';
    } finally {
      addBtn.disabled = false;
    }
  });
})();
