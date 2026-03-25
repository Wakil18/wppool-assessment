/**
 * Product Configurator — Storefront JS (Phase 3)
 *
 * Reads the configurator definition from the scope data embedded by configurator.liquid,
 * renders fields, evaluates conditions, calculates live price, and submits via /cart/add.js.
 *
 * Cart Transform Function contract (Phase 2b):
 *   properties['_configurator_selections'] = JSON.stringify({ [fieldId]: selectedValue })
 *   properties[field.label] = selectedValue  ← human-readable for order admin
 */
(function () {
  'use strict';

  // Guard against multiple executions when the script tag is rendered more than
  // once across sections/blocks on the same page. Without this, each extra
  // execution attaches an additional 'submit' listener to #configurator-form,
  // causing the cart add to fire once per execution (hence 2x or 3x adds).
  if (window.__configuratorScriptLoaded) return;
  window.__configuratorScriptLoaded = true;

  function initialize() {
    var root = document.getElementById('configurator-root');
    if (!root) return;

    // Enable debug mode via URL param for quick in-browser troubleshooting
    if (location.search.indexOf('configurator_debug=1') !== -1) {
      if (window.ConfiguratorData) window.ConfiguratorData.debug = true;
    }

    var scopeData = window.ConfiguratorData;
    if (!scopeData) {
      console.error('[Configurator] window.ConfiguratorData not set — check configurator.liquid is loaded');
      return;
    }

    log('bootstrap', scopeData);

    var definition = resolveDefinition(scopeData);
    if (!definition || !Array.isArray(definition.fields) || definition.fields.length === 0) {
      // No definition found — metafield may not have storefront access yet,
      // or no Option Set has been configured for this product.
      log('resolveDefinition', 'No definition found — check storefront metafield access and Option Set config');
      return;
    }

    // Sort fields by displayOrder ascending
    var fields = definition.fields.slice().sort(function (a, b) {
      return (a.displayOrder || 0) - (b.displayOrder || 0);
    });

    // Move #configurator-root before <product-form> so it sits inside the
    // product page's add-to-cart area rather than at the end of the body.
    positionConfigurator(root);

    renderFields(fields);
    log('renderFields', fields.length + ' field(s) rendered');
    wireEvents(fields, scopeData);
  }

  // Run immediately if the DOM is already ready, otherwise wait for it
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  // ---------------------------------------------------------------------------
  // DOM positioning — moves the configurator block before <product-form> and
  // hides the native "Buy it now" payment button since the configurator
  // provides its own cart-submission flow.
  // ---------------------------------------------------------------------------

  function positionConfigurator(root) {
    // Try multiple selectors to support Dawn and other themes
    var selectors = [
      'product-form.product-form',
      'product-form',
      '.product-form',
      'form[action*="/cart/add"]',
    ];
    var placed = false;
    for (var s = 0; s < selectors.length; s++) {
      var target = document.querySelector(selectors[s]);
      if (target && target.parentNode) {
        target.parentNode.insertBefore(root, target);
        log('positionConfigurator', 'Moved before ' + selectors[s]);
        placed = true;
        break;
      }
    }
    if (!placed) {
      // Last resort: insert before the native add-to-cart button container
      var addBtn = document.querySelector('[name="add"]');
      if (addBtn) {
        var btnParent = addBtn.closest('.product-form__buttons') || addBtn.parentNode;
        if (btnParent && btnParent.parentNode) {
          btnParent.parentNode.insertBefore(root, btnParent);
          log('positionConfigurator', 'Moved before button container (last resort)');
          placed = true;
        }
      }
    }
    if (!placed) {
      log('positionConfigurator', 'WARNING: could not find a target to position configurator');
    }

    // Hide Dawn's native add-to-cart button area and the accelerated checkout buttons.
    // Our #configurator-add-btn is the only visible trigger; Dawn's button is kept in the
    // DOM (hidden) so we can programmatically click it to trigger Dawn's cart drawer.
    var nativeButtonContainers = document.querySelectorAll(
      '.product-form__buttons, [data-shopify="payment-button"], .shopify-payment-button'
    );
    for (var i = 0; i < nativeButtonContainers.length; i++) {
      nativeButtonContainers[i].style.display = 'none';
    }
    log('positionConfigurator', 'Hid ' + nativeButtonContainers.length + ' native button container(s)');
  }

  // ---------------------------------------------------------------------------
  // Debug logger (no-op unless scopeData.debug is true)
  // ---------------------------------------------------------------------------

  function log(label, data) {
    if (!window.ConfiguratorData || !window.ConfiguratorData.debug) return;
    console.group('[Configurator] ' + label);
    if (data !== undefined) console.log(data);
    console.groupEnd();
  }

  // ---------------------------------------------------------------------------
  // Definition resolution — priority: manual > tags > collection > all
  // ---------------------------------------------------------------------------

  function resolveDefinition(scopeData) {
    // 1. Manual scope — product-specific metafield
    if (scopeData.manualDefinition) {
      log('resolveDefinition', { scope: 'manual', definition: scopeData.manualDefinition });
      return scopeData.manualDefinition;
    }

    // 2. Tags scope — shop tag registry { "tagName": definition }
    if (scopeData.tagRegistry && Array.isArray(scopeData.productTags)) {
      for (var i = 0; i < scopeData.productTags.length; i++) {
        var tag = scopeData.productTags[i];
        if (scopeData.tagRegistry[tag]) {
          log('resolveDefinition', { scope: 'tag:' + tag, definition: scopeData.tagRegistry[tag] });
          return scopeData.tagRegistry[tag];
        }
      }
    }

    // 3. Collection scope — first collection that has a definition set
    if (Array.isArray(scopeData.collectionDefinitions)) {
      for (var j = 0; j < scopeData.collectionDefinitions.length; j++) {
        if (scopeData.collectionDefinitions[j].definition) {
          log('resolveDefinition', { scope: 'collection:' + scopeData.collectionDefinitions[j].id, definition: scopeData.collectionDefinitions[j].definition });
          return scopeData.collectionDefinitions[j].definition;
        }
      }
    }

    // 4. All-products fallback
    if (scopeData.allDefinition) {
      log('resolveDefinition', { scope: 'all', definition: scopeData.allDefinition });
      return scopeData.allDefinition;
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  function renderFields(fields) {
    var container = document.getElementById('configurator-fields');
    if (!container) return;
    container.innerHTML = '';

    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      var wrapper = document.createElement('div');
      wrapper.className = 'configurator-field';
      wrapper.dataset.fieldWrapper = field.id;
      wrapper.style.marginBottom = '16px';

      if (field.type === 'info') {
        var infoEl = document.createElement('p');
        infoEl.className = 'configurator-info-block';
        infoEl.style.cssText = 'padding:10px 14px;background:#f4f6f8;border-left:3px solid #637381;margin:0;font-size:14px;';
        infoEl.textContent = field.label;
        wrapper.appendChild(infoEl);
      } else {
        var labelEl = document.createElement('label');
        labelEl.htmlFor = 'cf_' + field.id;
        labelEl.className = 'configurator-label';
        labelEl.style.cssText = 'display:block;font-weight:600;font-size:14px;margin-bottom:6px;';
        labelEl.textContent = field.label + (field.required ? ' *' : '');
        wrapper.appendChild(labelEl);

        if (field.type === 'dropdown') {
          var select = document.createElement('select');
          select.id = 'cf_' + field.id;
          select.dataset.fieldId = field.id;
          select.className = 'configurator-select';
          select.style.cssText = 'width:100%;padding:8px 10px;border:1px solid #c9cccf;border-radius:4px;font-size:14px;';

          var placeholder = document.createElement('option');
          placeholder.value = '';
          placeholder.textContent = '— Select —';
          select.appendChild(placeholder);

          var opts = field.options || [];
          for (var oi = 0; oi < opts.length; oi++) {
            var opt = opts[oi];
            var optEl = document.createElement('option');
            optEl.value = opt.value;
            optEl.textContent = opt.label + (opt.priceAdder ? ' (+$' + opt.priceAdder + ')' : '');
            select.appendChild(optEl);
          }
          wrapper.appendChild(select);

        } else if (field.type === 'radio') {
          var radioGroup = document.createElement('div');
          radioGroup.id = 'cf_' + field.id;
          radioGroup.dataset.fieldId = field.id;
          radioGroup.className = 'configurator-radio-group';
          radioGroup.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

          var radioOpts = field.options || [];
          for (var ri = 0; ri < radioOpts.length; ri++) {
            var ropt = radioOpts[ri];
            var radioLabel = document.createElement('label');
            radioLabel.className = 'configurator-radio-label';
            radioLabel.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;';

            var radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'cfr_' + field.id;
            radio.value = ropt.value;
            radio.dataset.fieldId = field.id;

            radioLabel.appendChild(radio);
            radioLabel.appendChild(document.createTextNode(
              ropt.label + (ropt.priceAdder ? ' (+$' + ropt.priceAdder + ')' : '')
            ));
            radioGroup.appendChild(radioLabel);
          }
          wrapper.appendChild(radioGroup);

        } else if (field.type === 'text') {
          var input = document.createElement('input');
          input.type = 'text';
          input.id = 'cf_' + field.id;
          input.dataset.fieldId = field.id;
          input.className = 'configurator-text-input';
          input.style.cssText = 'width:100%;padding:8px 10px;border:1px solid #c9cccf;border-radius:4px;font-size:14px;box-sizing:border-box;';
          wrapper.appendChild(input);
        }
      }

      container.appendChild(wrapper);
    }
  }

  // ---------------------------------------------------------------------------
  // Event wiring
  // ---------------------------------------------------------------------------

  function wireEvents(fields, scopeData) {
    var fieldsContainer = document.getElementById('configurator-fields');
    if (!fieldsContainer) return;

    function onAnyChange() {
      updateVisibility(fields);
      updatePrice(fields, scopeData);
    }

    fieldsContainer.addEventListener('change', onAnyChange);
    fieldsContainer.addEventListener('input', onAnyChange);

    // Set initial state
    updateVisibility(fields);
    updatePrice(fields, scopeData);

    var addBtn = document.getElementById('configurator-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        submitConfigurator(fields, scopeData);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Condition evaluation
  // ---------------------------------------------------------------------------

  function evaluateConditions(field, currentValues) {
    var conds = field.conditions;
    if (!conds || conds.length === 0) return true;
    for (var i = 0; i < conds.length; i++) {
      var c = conds[i];
      var val = currentValues[c.fieldId] || '';
      if (c.operator === 'equals' && val !== c.value) return false;
      if (c.operator === 'not_equals' && val === c.value) return false;
    }
    return true;
  }

  function getCurrentValues(fields) {
    var values = {};
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (field.type === 'dropdown') {
        var sel = document.querySelector('[data-field-id="' + field.id + '"]');
        if (sel) values[field.id] = sel.value;
      } else if (field.type === 'radio') {
        var checked = document.querySelector('input[name="cfr_' + field.id + '"]:checked');
        values[field.id] = checked ? checked.value : '';
      } else if (field.type === 'text') {
        var inp = document.querySelector('[data-field-id="' + field.id + '"]');
        if (inp) values[field.id] = inp.value;
      }
    }
    return values;
  }

  function updateVisibility(fields) {
    var currentValues = getCurrentValues(fields);
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      var wrapper = document.querySelector('[data-field-wrapper="' + field.id + '"]');
      if (!wrapper) continue;
      var visible = evaluateConditions(field, currentValues);
      var wasHidden = wrapper.style.display === 'none';
      wrapper.style.display = visible ? '' : 'none';
      if (wasHidden !== !visible) {
        log('updateVisibility', { field: field.id, visible: visible });
      }
      // Clear values of hidden fields so they don't affect price or submit
      if (!visible) {
        if (field.type === 'dropdown') {
          var sel = document.querySelector('[data-field-id="' + field.id + '"]');
          if (sel) sel.value = '';
        } else if (field.type === 'radio') {
          var radios = document.querySelectorAll('input[name="cfr_' + field.id + '"]');
          for (var r = 0; r < radios.length; r++) radios[r].checked = false;
        } else if (field.type === 'text') {
          var inp = document.querySelector('[data-field-id="' + field.id + '"]');
          if (inp) inp.value = '';
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Price calculation
  // ---------------------------------------------------------------------------

  function updatePrice(fields, scopeData) {
    // basePrice from Liquid is in cents (Shopify convention); convert to dollars
    var basePriceDollars = (scopeData.basePrice || 0) / 100;
    var currentValues = getCurrentValues(fields);
    var total = basePriceDollars;

    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (field.type !== 'dropdown' && field.type !== 'radio') continue;
      var wrapper = document.querySelector('[data-field-wrapper="' + field.id + '"]');
      if (wrapper && wrapper.style.display === 'none') continue;
      var selectedValue = currentValues[field.id];
      if (!selectedValue) continue;
      var opts = field.options || [];
      for (var oi = 0; oi < opts.length; oi++) {
        if (opts[oi].value === selectedValue && opts[oi].priceAdder) {
          total += Number(opts[oi].priceAdder);
          break;
        }
      }
    }

    var priceSection = document.getElementById('configurator-price');
    var priceValue = document.getElementById('configurator-price-value');
    if (!priceSection || !priceValue) return;

    priceSection.style.display = '';
    try {
      priceValue.textContent = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: scopeData.currency || 'USD',
      }).format(total);
    } catch (e) {
      priceValue.textContent = (scopeData.currency || 'USD') + ' ' + total.toFixed(2);
    }
  }

  // ---------------------------------------------------------------------------
  // Cart submission
  // ---------------------------------------------------------------------------

  function submitConfigurator(fields, scopeData) {
    var currentValues = getCurrentValues(fields);
    log('submitConfigurator', { variantId: scopeData.variantId, currentValues: currentValues });

    // Validate required fields before doing anything else
    for (var ri = 0; ri < fields.length; ri++) {
      var rf = fields[ri];
      if (rf.type === 'info' || !rf.required) continue;
      var rw = document.querySelector('[data-field-wrapper="' + rf.id + '"]');
      if (rw && rw.style.display === 'none') continue; // hidden by condition — skip
      if (!currentValues[rf.id]) {
        alert('Please complete the required field: ' + rf.label);
        return;
      }
    }

    // selections map keyed by fieldId — consumed by the Cart Transform Function
    var selections = {};
    // human-readable properties for order admin display
    var properties = {};

    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (field.type === 'info') continue;

      var wrapper = document.querySelector('[data-field-wrapper="' + field.id + '"]');
      if (wrapper && wrapper.style.display === 'none') continue;

      var value = currentValues[field.id];
      if (!value) continue;

      // Human-readable: written for all field types so cart page can display selections.
      // Cart transforms only run at checkout, so properties are the only data visible on /cart.
      if (field.type === 'text') {
        properties[field.label] = value;
      } else if (field.type === 'dropdown' || field.type === 'radio') {
        // Use the display label ("Green") rather than the raw value ("green")
        var matchedOption = (field.options || []).find(function (o) { return o.value === value; });
        var displayLabel = matchedOption ? matchedOption.label : value;
        // Append price adder to the cart attribute value so it's visible in cart/order
        if (matchedOption && matchedOption.priceAdder) {
          try {
            var formattedAdder = new Intl.NumberFormat(undefined, {
              style: 'currency',
              currency: scopeData.currency || 'USD',
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            }).format(Number(matchedOption.priceAdder));
            displayLabel += ' (+' + formattedAdder + ')';
          } catch (e) {
            displayLabel += ' (+' + matchedOption.priceAdder + ')';
          }
        }
        properties[field.label] = displayLabel;
      }

      // Machine-readable: raw value keyed by field.id for the Cart Transform Function
      if (field.type === 'dropdown' || field.type === 'radio' || field.type === 'text') {
        selections[field.id] = value;
      }
    }

    // Encode all selections as a single JSON attribute — read by Phase 2b cartTransformRun.
    // Omit for gift card products: Shopify rejects /cart/add.js with 422 when a lineExpand
    // Cart Transform is active and _configurator_selections is present on a gift card line.
    if (!scopeData.isGiftCard && Object.keys(selections).length > 0) {
      properties['_configurator_selections'] = JSON.stringify(selections);
    }

    var addBtn = document.getElementById('configurator-add-btn');
    if (addBtn) {
      addBtn.disabled = true;
      addBtn.innerHTML = '<span class="configurator-spinner"></span>';
    }

    function restoreBtn() {
      if (addBtn) {
        addBtn.disabled = false;
        addBtn.textContent = 'Add to cart';
      }
    }

    function onSuccess() {
      window.location.href = '/cart';
    }

    function onError(message) {
      console.error('[Configurator] Cart add failed:', message);
      restoreBtn();
      alert(message || 'Could not add to cart. Please try again.');
    }
    // This ensures Dawn's cart drawer / mini-cart opens correctly and all theme events fire.
    var forms = document.querySelectorAll('form[action*="/cart/add"]');
    var nativeForm = null;
    for (var fi = 0; fi < forms.length; fi++) {
      if (forms[fi].querySelector('button[type="submit"]')) {
        nativeForm = forms[fi];
        break;
      }
    }

    if (nativeForm) {
      // Update the variant id input
      nativeForm.querySelectorAll('input[type="hidden"][name="id"]').forEach(function (input) {
        input.value = scopeData.variantId;
      });

      // Ensure quantity = 1
      var qtyInput = nativeForm.querySelector('input[name="quantity"]');
      if (qtyInput) {
        qtyInput.value = 1;
      } else {
        qtyInput = document.createElement('input');
        qtyInput.type = 'hidden';
        qtyInput.name = 'quantity';
        qtyInput.value = 1;
        nativeForm.appendChild(qtyInput);
      }

      // Inject all configurator properties as hidden inputs
      var addedInputs = [];
      Object.keys(properties).forEach(function (key) {
        var input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'properties[' + key + ']';
        input.value = properties[key];
        nativeForm.appendChild(input);
        addedInputs.push(input);
      });

      // Intercept window.fetch to detect when Dawn's cart add completes
      var originalFetch = window.fetch;
      var fetchIntercepted = false;

      var safetyTimeout = setTimeout(function () {
        if (!fetchIntercepted) {
          fetchIntercepted = true;
          window.fetch = originalFetch;
          addedInputs.forEach(function (el) { el.remove(); });
          restoreBtn();
        }
      }, 15000);

      window.fetch = function () {
        var args = Array.prototype.slice.call(arguments);
        return originalFetch.apply(this, args).then(function (response) {
          // Dawn may pass a Request object or a plain string as the URL argument
          var reqUrl = (args[0] && typeof args[0] === 'object' && args[0].url) ? args[0].url : String(args[0] || '');
          if (!fetchIntercepted && reqUrl.indexOf('/add') !== -1) {
            fetchIntercepted = true;
            clearTimeout(safetyTimeout);
            window.fetch = originalFetch;
            addedInputs.forEach(function (el) { el.remove(); });
            if (response.ok) {
              onSuccess();
            } else {
              response.clone().json().then(function (err) {
                onError(err.description || 'Could not add to cart.');
              }).catch(function () {
                onError('Could not add to cart.');
              });
            }
          }
          return response;
        }).catch(function (err) {
          window.fetch = originalFetch;
          clearTimeout(safetyTimeout);
          addedInputs.forEach(function (el) { el.remove(); });
          onError(err.message || 'Could not add to cart.');
          throw err;
        });
      };

      var nativeSubmitBtn = nativeForm.querySelector('button[type="submit"]');
      nativeSubmitBtn.disabled = false;
      nativeSubmitBtn.click();

    } else {
      // --- Fallback path: Dawn form not found, post directly to /cart/add.js
      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: scopeData.variantId,
          quantity: 1,
          properties: properties,
        }),
      })
        .then(function (res) {
          if (!res.ok) {
            return res.json().then(function (err) {
              throw new Error(err.description || 'Could not add to cart');
            });
          }
          return res.json();
        })
        .then(onSuccess)
        .catch(function (err) { onError(err.message || err); });
    }
  }
})();
