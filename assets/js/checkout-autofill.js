// Checkout Autofill - Adapted from dust-wave-shop
// Fixes browser/password manager autofill for Snipcart checkout

(function() {
  'use strict';

  // Suppress Snipcart internal warning about province field type switching
  var originalWarn = console.warn;
  console.warn = function() {
    var msg = arguments[0];
    if (typeof msg === 'string' && msg.indexOf('Field province was registered as a Select') > -1) {
      return; // Suppress this specific Snipcart internal warning
    }
    originalWarn.apply(console, arguments);
  };

  // US State abbreviation to full name mapping
  var stateAbbreviations = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
    'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
    'DC': 'District of Columbia', 'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii',
    'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
    'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine',
    'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota',
    'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska',
    'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico',
    'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
    'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'PR': 'Puerto Rico',
    'RI': 'Rhode Island', 'SC': 'South Carolina', 'SD': 'South Dakota', 'TN': 'Tennessee',
    'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont', 'VA': 'Virginia', 'VI': 'Virgin Islands',
    'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
    'GU': 'Guam', 'AS': 'American Samoa', 'MP': 'Northern Mariana Islands'
  };

  // Field mappings for autocomplete attributes
  var fieldMappings = [
    { selector: 'input[id^="name_"], [name="name"]', autocomplete: 'name' },
    { selector: 'input[id^="email_"], [name="email"]', autocomplete: 'email' },
    { selector: 'input[id^="address1_"], [name="address1"]', autocomplete: 'address-line1' },
    { selector: 'input[id^="address2_"], [name="address2"]', autocomplete: 'address-line2' },
    { selector: 'input[id^="city_"], [name="city"]', autocomplete: 'address-level2' },
    { selector: 'input[id^="postalCode_"], [name="postalCode"]', autocomplete: 'postal-code' },
    { selector: 'input[id^="phone_"], [name="phone"]', autocomplete: 'tel' }
  ];

  // Auto-select United States in country dropdown
  function selectUSCountry() {
    var snipcartEl = document.getElementById('snipcart');
    if (!snipcartEl) return false;
    
    // Check for mobile: native <select> element
    var countrySelect = snipcartEl.querySelector('select[name="country"]');
    if (countrySelect) {
      if (countrySelect.value === 'US') return true;
      countrySelect.value = 'US';
      countrySelect.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    
    // Desktop: typeahead input
    var labels = snipcartEl.querySelectorAll('label');
    var countryLabel = null;
    labels.forEach(function(lbl) {
      if (lbl.textContent.toLowerCase().includes('country')) {
        countryLabel = lbl;
      }
    });
    
    if (!countryLabel) return false;
    
    var formField = countryLabel.closest('.snipcart-form__field');
    if (!formField) return false;
    
    var input = formField.querySelector('input');
    if (!input) return false;
    
    // Skip if US already selected
    var selectedItem = formField.querySelector('.snipcart-typeahead__select, .snipcart-form__select__label');
    if (selectedItem && selectedItem.textContent.includes('United States')) return true;
    if (formField.textContent.includes('United States') && input.value === '') return true;
    
    // Type "United States" to trigger typeahead
    input.value = 'United States';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Click the US option when dropdown appears
    function tryClickOption(attempts) {
      if (attempts <= 0) return;
      
      var options = snipcartEl.querySelectorAll('.snipcart-typeahead__suggestion, li[role="option"], .snipcart-dropdown__list-item');
      for (var i = 0; i < options.length; i++) {
        if (options[i].textContent.trim() === 'United States') {
          options[i].click();
          return;
        }
      }
      setTimeout(function() { tryClickOption(attempts - 1); }, 200);
    }
    
    setTimeout(function() { tryClickOption(5); }, 300);
    
    return true;
  }

  // Fix autocomplete attributes on checkout form fields
  function fixCheckoutAutocomplete() {
    var snipcartEl = document.getElementById('snipcart');
    if (!snipcartEl) return;

    // Apply autocomplete attributes to standard fields
    fieldMappings.forEach(function(mapping) {
      var fields = snipcartEl.querySelectorAll(mapping.selector);
      fields.forEach(function(field) {
        if (field.getAttribute('autocomplete') !== mapping.autocomplete) {
          field.setAttribute('autocomplete', mapping.autocomplete);
        }
      });
    });

    // Inject proxy input for state/province autofill
    injectAutofillProxyForState(snipcartEl);
  }

  // Inject a proxy input for password manager state autofill
  function injectAutofillProxyForState(snipcartEl) {
    if (document.getElementById('autofill-state-proxy')) return;

    // Find province/state field by looking for fields containing province or state in their HTML
    var formFields = snipcartEl.querySelectorAll('.snipcart-form__field');
    var provinceField = null;
    
    formFields.forEach(function(el) {
      var html = el.innerHTML.toLowerCase();
      var hasProvinceName = html.indexOf('province') > -1 || html.indexOf('state') > -1 || html.indexOf('region') > -1;
      // Avoid matching "United States" in country field
      var isCountryField = html.indexOf('country') > -1;
      if (hasProvinceName && !isCountryField) {
        provinceField = el;
      }
    });
    
    if (!provinceField) return;

    // Ensure province field has relative positioning for absolute child
    var currentPosition = window.getComputedStyle(provinceField).position;
    if (currentPosition === 'static') {
      provinceField.style.position = 'relative';
    }
    
    // Create proxy input that password managers can detect
    var proxy = document.createElement('input');
    proxy.type = 'text';
    proxy.name = 'state';
    proxy.id = 'autofill-state-proxy';
    proxy.autocomplete = 'address-level1';
    proxy.placeholder = 'State (for autofill)';
    proxy.tabIndex = -1;
    
    // Absolutely positioned so it doesn't affect layout, but visible enough for password managers
    proxy.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:40px;opacity:0.01;border:none;background:transparent;pointer-events:none;z-index:-1;';

    // Insert inside province field
    provinceField.appendChild(proxy);

    // Handle proxy autofill
    function handleProxyFill() {
      var val = proxy.value.trim().toUpperCase();
      if (!val) return;

      // Convert abbreviation to full name
      var stateName = stateAbbreviations[val] || null;
      
      // Check if it's already a full state name
      if (!stateName) {
        for (var abbr in stateAbbreviations) {
          if (stateAbbreviations[abbr].toUpperCase() === val) {
            stateName = stateAbbreviations[abbr];
            break;
          }
        }
      }
      
      // Fall back to the raw value if no match
      if (!stateName) stateName = val;

      // Find typeahead input
      var typeaheadInput = provinceField.querySelector('.snipcart-typeahead input');
      if (!typeaheadInput) return;

      // Set value and trigger input
      typeaheadInput.value = stateName;
      typeaheadInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Click matching dropdown option
      setTimeout(function() {
        var options = snipcartEl.querySelectorAll('.snipcart-typeahead__dropdown-content li, .snipcart-dropdown__list-item, .snipcart-dropdown__content li');
        options.forEach(function(opt) {
          if (opt.textContent.trim() === stateName) {
            opt.click();
          }
        });
      }, 200);
      
      // Clear proxy for reuse
      proxy.value = '';
    }

    proxy.addEventListener('input', handleProxyFill);
    proxy.addEventListener('change', handleProxyFill);
    
    // Fallback polling for password managers that don't trigger events
    var checkInterval = setInterval(function() {
      if (!document.body.contains(proxy)) {
        clearInterval(checkInterval);
        return;
      }
      if (proxy.value) {
        handleProxyFill();
      }
    }, 500);
  }

  // Initialize when Snipcart is ready
  document.addEventListener('snipcart.ready', function() {
    // Listen for route changes to checkout
    Snipcart.events.on('theme.routechanged', function(routesChange) {
      if (routesChange.to && (routesChange.to.indexOf('checkout') !== -1 || routesChange.to.indexOf('billing') !== -1 || routesChange.to.indexOf('shipping') !== -1)) {
        // Select country first, with retry
        setTimeout(function() {
          if (!selectUSCountry()) {
            setTimeout(selectUSCountry, 500);
            setTimeout(selectUSCountry, 1000);
          }
        }, 300);
        // Then fix autocomplete with multiple retries for dynamic loading
        setTimeout(fixCheckoutAutocomplete, 100);
        setTimeout(fixCheckoutAutocomplete, 500);
        setTimeout(fixCheckoutAutocomplete, 1000);
      }
    });

    // Also use MutationObserver to catch dynamically added form fields
    var snipcartEl = document.getElementById('snipcart');
    if (snipcartEl) {
      var observer = new MutationObserver(function(mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var mutation = mutations[i];
          if (mutation.addedNodes.length) {
            var hasFormField = Array.from(mutation.addedNodes).some(function(node) {
              return node.querySelector && node.querySelector('.snipcart-form__field');
            });
            if (hasFormField) {
              setTimeout(fixCheckoutAutocomplete, 50);
            }
          }
        }
      });

      observer.observe(snipcartEl, { childList: true, subtree: true });
    }
  });
})();
