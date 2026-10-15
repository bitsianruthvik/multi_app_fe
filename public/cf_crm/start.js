// The home-screen icon opens /cf_crm/start.html?c=<default company>. Go to the
// company this device last opened the app in (set by the platform page), or
// the manifest's default. Only a plain company slug is ever used.
(function () {
  var ok = function (s) { return typeof s === 'string' && /^[a-z0-9][a-z0-9_-]{0,99}$/i.test(s) ? s : ''; };
  var last = '';
  try { last = ok(localStorage.getItem('cf_crm:lastCompany')); } catch (e) { /* storage blocked */ }
  var fallback = ok(new URLSearchParams(location.search).get('c'));
  var company = last || fallback;
  location.replace(company ? '/' + company + '/cf_crm' : '/');
})();
