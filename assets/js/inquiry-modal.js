// inquiry-modal.js
// Shared inquiry form modal for SUNWEAVE site.
// Replaces mailto: CTAs with a Web3Forms-powered popup that collects
// contact info before sending the inquiry.
//
// Usage:
//   <button class="btn open-inquiry" data-inquiry="Quote" data-product="Tropical Flamingo">
//     Get a Quote & Sample
//   </button>
//
  // Required fields: name (联系人), email (邮箱)
  // Phone / WhatsApp is optional.
  // Posts to Web3Forms using the access key configured below.

(function () {
  'use strict';

  // --- Configuration --------------------------------------------------------
  var ACCESS_KEY = 'e235b518-c2c8-4957-8e91-5fbdfd7d44d1';
  var RECIPIENT_EMAIL = 'sjxsix@126.com';
  var ENDPOINT = 'https://api.web3forms.com/submit';

  // --- Inject styles --------------------------------------------------------
  var styleId = 'sw-inquiry-modal-style';
  if (!document.getElementById(styleId)) {
    var css = document.createElement('style');
    css.id = styleId;
    css.textContent =
      '.sw-modal-backdrop{' +
        'position:fixed;inset:0;z-index:100;' +
        'background:rgba(26,11,46,.55);backdrop-filter:blur(6px);' +
        'display:flex;align-items:center;justify-content:center;' +
        'padding:1rem;opacity:0;visibility:hidden;transition:opacity .25s ease,visibility .25s' +
      '}' +
      '.sw-modal-backdrop.active{opacity:1;visibility:visible}' +
      '.sw-modal{' +
        'width:100%;max-width:460px;background:var(--card);color:var(--fg);' +
        'border:1px solid var(--card-border);border-radius:22px;' +
        'box-shadow:var(--shadow);padding:1.6rem 1.5rem 1.4rem;' +
        'transform:translateY(12px) scale(.98);transition:transform .25s ease' +
      '}' +
      '.sw-modal-backdrop.active .sw-modal{transform:translateY(0) scale(1)}' +
      '.sw-modal-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.1rem}' +
      '.sw-modal-title{font-size:1.2rem;font-weight:800;margin:0}' +
      '.sw-modal-close{' +
        'background:transparent;border:none;color:var(--fg-soft);font-size:1.4rem;' +
        'cursor:pointer;line-height:1;padding:.25rem;border-radius:50%' +
      '}' +
      '.sw-modal-close:hover{background:var(--section-bg)}' +
      '.sw-modal-group{margin-bottom:.9rem}' +
      '.sw-modal-label{display:block;font-size:.82rem;font-weight:600;margin-bottom:.35rem;color:var(--fg-soft)}' +
      '.sw-modal-label .required{color:#FF4D6D;margin-left:.15rem}' +
      '.sw-modal-input,' +
      '.sw-modal-textarea{' +
        'width:100%;padding:.7rem .9rem;font-size:.95rem;font-family:inherit;' +
        'background:var(--bg);color:var(--fg);border:1px solid var(--card-border);' +
        'border-radius:12px;outline:none;transition:border-color .2s,box-shadow .2s' +
      '}' +
      '.sw-modal-input:focus,.sw-modal-textarea:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(255,111,163,.18)}' +
      '.sw-modal-input::placeholder,.sw-modal-textarea::placeholder{color:var(--fg-soft);opacity:.55}' +
      '.sw-modal-textarea{min-height:90px;resize:vertical}' +
      '.sw-modal-error{color:#FF4D6D;font-size:.82rem;margin-top:.25rem;display:none}' +
      '.sw-modal-footer{display:flex;gap:.6rem;margin-top:1.2rem}' +
      '.sw-modal-footer .btn{flex:1;justify-content:center}' +
      '.sw-modal-footer .btn.secondary{' +
        'background:transparent;color:var(--fg);border:1.5px solid var(--card-border);box-shadow:none' +
      '}' +
      '.sw-modal-status{text-align:center;padding:1.2rem .5rem}' +
      '.sw-modal-status h3{margin:.6rem 0 .3rem;font-size:1.15rem}' +
      '.sw-modal-status p{margin:0;color:var(--fg-soft);font-size:.9rem}' +
      '.sw-modal-spinner{' +
        'width:32px;height:32px;border:3px solid var(--card-border);' +
        'border-top-color:var(--brand);border-radius:50%;' +
        'animation:sw-spin 1s linear infinite;margin:0 auto .8rem' +
      '}' +
      '@keyframes sw-spin{to{transform:rotate(360deg)}}' +
      '@media (max-width:480px){.sw-modal{padding:1.3rem 1.1rem 1.2rem}}';
    document.head.appendChild(css);
  }

  // --- Inject modal HTML ----------------------------------------------------
  var backdrop = document.createElement('div');
  backdrop.className = 'sw-modal-backdrop';
  backdrop.id = 'swInquiryModal';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.innerHTML =
    '<div class="sw-modal">' +
      '<div class="sw-modal-header">' +
        '<h2 class="sw-modal-title" id="swInquiryTitle">Send Inquiry</h2>' +
        '<button class="sw-modal-close" aria-label="Close">&times;</button>' +
      '</div>' +
      '<form id="swInquiryForm" novalidate>' +
        '<div class="sw-modal-group">' +
          '<label class="sw-modal-label">Contact Person <span class="required">*</span></label>' +
          '<input class="sw-modal-input" name="name" type="text" placeholder="Your name / contact person" required>' +
          '<div class="sw-modal-error">Please enter your name / contact person</div>' +
        '</div>' +
        '<div class="sw-modal-group">' +
          '<label class="sw-modal-label">Email <span class="required">*</span></label>' +
          '<input class="sw-modal-input" name="email" type="email" placeholder="your@email.com" required>' +
          '<div class="sw-modal-error">Please enter a valid email address</div>' +
        '</div>' +
        '<div class="sw-modal-group">' +
          '<label class="sw-modal-label">Phone / WhatsApp</label>' +
          '<input class="sw-modal-input" name="phone" type="tel" placeholder="+86 138 0000 0000">' +
          '<div class="sw-modal-error">Please enter your phone number</div>' +
        '</div>' +
        '<div class="sw-modal-group">' +
          '<label class="sw-modal-label">Message / Requirements</label>' +
          '<textarea class="sw-modal-textarea" name="message" placeholder="Tell us what you need: product, quantity, target market..."></textarea>' +
        '</div>' +
        '<input type="hidden" name="access_key" value="' + ACCESS_KEY + '">' +
        '<input type="hidden" name="subject" id="swInquirySubject" value="New inquiry from SUNWEAVE website">' +
        '<input type="hidden" name="from_name" id="swInquiryFromName" value="SUNWEAVE website visitor">' +
        '<input type="hidden" name="product" id="swInquiryProduct" value="">' +
        '<input type="hidden" name="inquiry_type" id="swInquiryType" value="General">' +
        '<div class="sw-modal-footer">' +
          '<button type="submit" class="btn">Submit Inquiry</button>' +
          '<button type="button" class="btn secondary sw-modal-cancel">Cancel</button>' +
        '</div>' +
      '</form>' +
      '<div id="swInquiryStatus" class="sw-modal-status" style="display:none"></div>' +
    '</div>';
  document.body.appendChild(backdrop);

  // --- Elements -------------------------------------------------------------
  var form = document.getElementById('swInquiryForm');
  var statusEl = document.getElementById('swInquiryStatus');
  var titleEl = document.getElementById('swInquiryTitle');
  var subjectEl = document.getElementById('swInquirySubject');
  var fromNameEl = document.getElementById('swInquiryFromName');
  var productEl = document.getElementById('swInquiryProduct');
  var typeEl = document.getElementById('swInquiryType');

  var currentInquiryType = 'General';
  var currentProduct = '';

  // --- Helpers --------------------------------------------------------------
  function openModal(type, product) {
    currentInquiryType = type || 'General';
    currentProduct = product || '';

    titleEl.textContent =
      currentInquiryType === 'Factory Tour' ? 'Book a Factory Tour' :
      currentInquiryType === 'Quote' && currentProduct ? 'Quote & Sample — ' + currentProduct :
      currentInquiryType === 'Quote' ? 'Get a Quote & Sample' :
      currentInquiryType;

    subjectEl.value = currentProduct
      ? '[SUNWEAVE] ' + currentInquiryType + ' request for ' + currentProduct
      : '[SUNWEAVE] ' + currentInquiryType + ' request';
    fromNameEl.value = 'SUNWEAVE Website - ' + (currentProduct || currentInquiryType);
    productEl.value = currentProduct;
    typeEl.value = currentInquiryType;

    form.style.display = 'block';
    statusEl.style.display = 'none';
    form.reset();
    clearErrors();
    backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    backdrop.classList.remove('active');
    document.body.style.overflow = '';
  }

  function clearErrors() {
    var errors = form.querySelectorAll('.sw-modal-error');
    for (var i = 0; i < errors.length; i++) errors[i].style.display = 'none';
    var inputs = form.querySelectorAll('.sw-modal-input, .sw-modal-textarea');
    for (var i = 0; i < inputs.length; i++) inputs[i].style.borderColor = '';
  }

  function showFieldError(input) {
    var group = input.closest('.sw-modal-group');
    if (!group) return;
    var err = group.querySelector('.sw-modal-error');
    if (err) err.style.display = 'block';
    input.style.borderColor = '#FF4D6D';
  }

  function validate() {
    clearErrors();
    var ok = true;
    var inputs = form.querySelectorAll('[required]');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      var val = el.value.trim();
      if (!val) {
        showFieldError(el);
        ok = false;
      } else if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        showFieldError(el);
        ok = false;
      }
    }
    return ok;
  }

  function showStatus(html) {
    form.style.display = 'none';
    statusEl.innerHTML = html;
    statusEl.style.display = 'block';
  }

  // --- Event wiring ---------------------------------------------------------
  backdrop.addEventListener('click', function (e) {
    if (e.target === backdrop) closeModal();
  });
  document.querySelector('.sw-modal-close').addEventListener('click', closeModal);
  document.querySelector('.sw-modal-cancel').addEventListener('click', closeModal);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && backdrop.classList.contains('active')) closeModal();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validate()) return;

    var data = {};
    var fields = form.querySelectorAll('input, textarea');
    for (var i = 0; i < fields.length; i++) {
      data[fields[i].name] = fields[i].value;
    }
    // Web3Forms recipient is controlled by the access_key, but we keep this
    // field so the email body also shows the intended recipient clearly.
    data.email_to = RECIPIENT_EMAIL;

    showStatus('<div class="sw-modal-spinner"></div><p>Sending your inquiry...</p>');

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (res) { return res.json(); })
      .then(function (result) {
        if (result.success) {
          showStatus(
            '<h3>✅ Sent!</h3>' +
            '<p>Thanks for your inquiry. Our sales team will reply within 24 hours.</p>'
          );
          setTimeout(closeModal, 2500);
        } else {
          showStatus(
            '<h3>❌ Failed to send</h3>' +
            '<p>' + (result.message || 'Please try again or email us directly at ' + RECIPIENT_EMAIL) + '</p>'
          );
        }
      })
      .catch(function (err) {
        showStatus(
          '<h3>❌ Network error</h3>' +
          '<p>Please try again, or email us directly at ' + RECIPIENT_EMAIL + '</p>'
        );
      });
  });

  // --- Attach to buttons ----------------------------------------------------
  function wireButtons() {
    var btns = document.querySelectorAll('.open-inquiry');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (b._swInquiryWired) continue;
      b._swInquiryWired = true;
      b.addEventListener('click', function (e) {
        e.preventDefault();
        openModal(
          this.getAttribute('data-inquiry'),
          this.getAttribute('data-product')
        );
      });
    }
  }

  // Wire existing buttons now and watch for dynamically added ones.
  wireButtons();
  if (typeof MutationObserver !== 'undefined') {
    var observer = new MutationObserver(wireButtons);
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
