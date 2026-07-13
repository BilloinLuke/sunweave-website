/* Site-wide watermark: injects a fixed, non-interactive overlay.
   Add <script src="assets/js/watermark.js"></script> before </body> on every page. */
(function () {
  if (document.querySelector('.site-watermark')) return;
  var w = document.createElement('div');
  w.className = 'site-watermark';
  w.setAttribute('aria-hidden', 'true');
  var html = '';
  for (var i = 0; i < 14; i++) {
    html += '<span>这是测试网站</span>';
  }
  w.innerHTML = html;
  document.body.appendChild(w);
})();
