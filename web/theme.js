// Sets light or dark before the page draws, so it never flashes. Light is
// the default; app.js changes it when someone picks another one.
(function () {
  var pref = 'light';
  try { pref = localStorage.getItem('prikklok.theme') || 'light'; } catch (e) { /* private mode */ }
  var dark = pref === 'dark' || (pref === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#4A0D12' : '#6E141A');
})();
