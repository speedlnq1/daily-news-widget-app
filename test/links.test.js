const assert = require('assert'), path = require('path'), os = require('os'), fs = require('fs');
const W = path.resolve(__dirname, '..');
const H = require('./support/harness')(W, { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'lnk-')) });
(async () => {
  await H.ready; await H.flush();
  const open = H.on['open'];
  const bad = ['javascript:alert(1)', 'http://example.com/a', 'file:///C:/Windows/System32/calc.exe', 'ftp://example.com/x', 'https://user:pw@example.com/', 'https://', '', null, 42, {}, 'data:text/html,<script>1</script>',
    'https://example.com/' + 'a'.repeat(3000), 'ms-settings:network', 'mailto:a@b.c', '\\\\server\\share\\file', 'https://exa mple.com'];
  bad.forEach(u => open({}, u));
  await H.flush();
  assert.deepStrictEqual(H.opened, [], 'nothing unsafe opens: ' + JSON.stringify(H.opened));
  assert.ok(H.sent.filter(x => x[0] === 'notice').length >= bad.length - 1, 'user is told when a link is refused');
  ['https://example.com/story?id=1&x=%E2%9C%93', 'https://news.google.com/rss/articles/CBMi123?oc=5', 'https://bücher.example/straße'].forEach(u => open({}, u));
  await H.flush();
  assert.strictEqual(H.opened.length, 3, 'valid https links open');
  assert.ok(H.opened[2].startsWith('https://xn--'), 'IDN is normalised to punycode: ' + H.opened[2]);
  console.log('link tests passed'); process.exit(0);
})();
