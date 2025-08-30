// @ts-nocheck
/* Ecom Grid: vanilla JS quick view + add to cart + auto-bundle */
(function () {
  const sections = document.querySelectorAll('.ecom-grid');
  if (!sections.length) return;

  sections.forEach(initGrid);

  function initGrid(section) {
    const sectionId = section.id.replace('ecom-grid-', '');
    const modal = section.querySelector('[data-grid-modal]');
    const closeEls = modal.querySelectorAll('[data-modal-close]');
    const imgEl = modal.querySelector('[data-modal-image]');
    const titleEl = modal.querySelector('[data-modal-title]');
    const priceEl = modal.querySelector('[data-modal-price]');
    const descEl = modal.querySelector('[data-modal-desc]');
    const formEl = modal.querySelector('[data-modal-form]');
    const optionsWrap = modal.querySelector('[data-options-wrap]');
    const variantIdInput = modal.querySelector('[data-variant-id]');
    const statusEl = modal.querySelector('[data-status]');

    // Settings for the auto-add rule (Soft Winter Jacket)
    const bundleProductSetting = getSetting(section, 'bundle_product'); // product id in Liquid isn't exposed here
    // We'll inject bundle variant id from data attribute on the section container via Liquid
    // So read them from dataset if present.
    // To make it robust, fallback to fetching product JSON by handle if needed (omitted for simplicity in test).

    // Attach click handlers to cards
    section.querySelectorAll('.ecom-grid__card').forEach((card, index) => {
      const btn = card.querySelector('.ecom-grid__quick');
      if (!btn || btn.disabled) return;

      btn.addEventListener('click', () => openQuickView(sectionId, index));
      // Also allow clicking image
      const img = card.querySelector('.ecom-grid__img');
      if (img) {
        img.style.cursor = 'pointer';
        img.addEventListener('click', () => openQuickView(sectionId, index));
      }
    });

    closeEls.forEach((el) => el.addEventListener('click', closeModal));
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    function openQuickView(secId, cardIndex) {
      // Grab embedded product JSON
      const jsonEl = document.getElementById(`product-json-${secId}-${cardIndex}`);
      if (!jsonEl) return;
      const product = tryParse(jsonEl.textContent);
      if (!product) return;

      // Hydrate modal
      titleEl.textContent = product.title || '';
      descEl.textContent = product.description || '';
      imgEl.src = (product.images && product.images[0]) || product.featured_image || '';
      imgEl.alt = product.title || '';

      // Default price (from first available variant)
      const firstAvailable = product.variants.find(v => v.available) || product.variants[0];
      if (firstAvailable) {
        priceEl.textContent = firstAvailable.price_formatted || product.price_from || '';
        variantIdInput.value = firstAvailable.id;
      }

      // Build option selectors (Color/Size/etc)
      optionsWrap.innerHTML = '';
      const selects = [];
      (product.options || []).forEach((opt, optIndex) => {
        const field = document.createElement('div');
        field.className = 'ecom-field';

        const label = document.createElement('label');
        label.className = 'ecom-label';
        label.textContent = opt.name;

        const select = document.createElement('select');
        select.className = 'ecom-select';
        select.setAttribute('data-opt-index', String(optIndex));

        opt.values.forEach(val => {
          const option = document.createElement('option');
          option.value = val;
          option.textContent = val;
          select.appendChild(option);
        });

        field.appendChild(label);
        field.appendChild(select);
        optionsWrap.appendChild(field);
        selects.push(select);
      });

      // When options change, find matching variant
      function updateVariantFromSelections() {
        const chosen = selects.map(s => s.value);
        const match = product.variants.find(v => arrayEqualsCaseInsensitive(v.options, chosen));
        if (match) {
          variantIdInput.value = match.id;
          priceEl.textContent = match.price_formatted || priceEl.textContent;
          // Update image if you want to map by variant (optional)
        } else {
          // No exact match; keep previous but show a note
          // (For the test, silent is fine)
        }
      }
      selects.forEach(s => s.addEventListener('change', updateVariantFromSelections));
      // Initialize selects to match the firstAvailable
      if (firstAvailable && firstAvailable.options) {
        selects.forEach((s, i) => {
          const target = firstAvailable.options[i];
          if (target) s.value = target;
        });
      }
      updateVariantFromSelections();

      // Submit: Add to cart
      formEl.onsubmit = async (e) => {
        e.preventDefault();
        clearStatus();

        const variantId = variantIdInput.value;
        if (!variantId) {
          setStatus('Please select available options.', true);
          return;
        }

        try {
          // Add main product
          await addToCart([{ id: Number(variantId), quantity: 1 }]);

          // If selection contains BOTH Black and Medium, auto add bundle product
          const selectedOptions = selects.map(s => (s.value || '').trim().toLowerCase());
          const hasBlack = selectedOptions.includes('black');
          const hasMedium = selectedOptions.includes('medium');

          if (hasBlack && hasMedium) {
            const bundleVariantId = await resolveBundleVariantId(section);
            if (bundleVariantId) {
              await addToCart([{ id: Number(bundleVariantId), quantity: 1 }]);
            }
          }

          setStatus('Added to cart ✓');
          // Optional: open cart drawer if your theme supports, or redirect to /cart
          // window.location.href = '/cart';
        } catch (err) {
          console.error(err);
          setStatus('Could not add to cart. Try again.', true);
        }
      };

      openModal();
    }

    function openModal() {
      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
      document.documentElement.style.overflow = 'hidden';
    }

    function closeModal() {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      document.documentElement.style.overflow = '';
      clearStatus();
    }

    function clearStatus() {
      statusEl.textContent = '';
      statusEl.classList.remove('is-error');
    }

    function setStatus(msg, isError) {
      statusEl.textContent = msg;
      statusEl.classList.toggle('is-error', !!isError);
    }
  }

  // Utilities
  function tryParse(text) {
    try { return JSON.parse(text); } catch (_) { return null; }
  }
  function arrayEqualsCaseInsensitive(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (String(a[i]).toLowerCase() !== String(b[i]).toLowerCase()) return false;
    }
    return true;
  }

  async function addToCart(items) {
    const res = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ items })
    });
    if (!res.ok) throw new Error('addToCart failed');
    return res.json();
  }

  // Read bundle variant id from a data element we’ll inject from Liquid
  async function resolveBundleVariantId(sectionEl) {
    // 1) Preferred: read from a hidden script tag injected by Liquid with the bundle product JSON
    const bundleScript = sectionEl.querySelector('[data-bundle-json]');
    if (bundleScript) {
      try {
        const data = JSON.parse(bundleScript.textContent);
        // Choose first available variant
        const v = (data.variants || []).find(v => v.available) || (data.variants || [])[0];
        return v ? v.id : null;
      } catch (_) {}
    }
    return null;
  }

  // Helper to fetch a setting if ever needed later (not used now)
  function getSetting(sectionEl, key) {
    return sectionEl?.dataset?.[key] || null;
  }
})();
// @ts-nocheck