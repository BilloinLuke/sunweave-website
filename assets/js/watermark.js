(function() {
  var container = document.createElement('div');
  container.className = 'site-watermark';
  for (var i = 0; i < 40; i++) {
    var span = document.createElement('span');
    span.textContent = '这是测试网站';
    container.appendChild(span);
  }
  document.body.appendChild(container);
})();
