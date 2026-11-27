import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync('index.html', 'utf8');
const js = readFileSync('js/app.js', 'utf8');
const css = readFileSync('css/style.css', 'utf8');
const sw = readFileSync('sw.js', 'utf8');
const providers = readFileSync('js/providers.js', 'utf8');

new Function(js);
new Function(sw);
new Function(providers);

const htmlIds = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const uniqueIds = new Set(htmlIds);
assert.equal(uniqueIds.size, htmlIds.length, 'HTML contains duplicate IDs');

const selectorIds = [...js.matchAll(/(?<!\$)\$\('#([A-Za-z0-9_-]+)'\)/g)]
  .map(match => match[1])
  .filter(id => id !== 'modalText'); // injected into the modal at runtime
const missingIds = [...new Set(selectorIds.filter(id => !uniqueIds.has(id)))];
assert.deepEqual(missingIds, [], 'Application references IDs missing from index.html');

assert.doesNotMatch(js, /(?<!\$)\$\([^)]*\)\.(?:forEach|map|filter|find|some|every)/,
  'A singular DOM query is being used as an array');
assert.match(js, /translations:S\.translations/);
assert.match(js, /S\.translations=saved\.translations/);
assert.match(js, /serviceWorker\.register\('sw\.js'\)/);
assert.match(sw, /addEventListener\('fetch'/);
assert.match(html, /id="lrcFile"/);
assert.match(html, /js\/providers\.js/);
assert.match(html, /id="externalSearchResults"/);
assert.match(html, /id="youtubeApiKey"/);
assert.match(html, /id="saveYoutubeKey"/);
assert.match(html, /id="spotifyExternalSearch"/);
assert.match(js, /scheduleFederatedSearch/);
assert.match(providers, /searchAudius/);
assert.match(providers, /searchApple/);
assert.match(providers, /searchRadio/);
assert.match(providers, /searchArchive/);
assert.match(providers, /searchYouTube/);
assert.match(providers, /setYoutubeApiKey/);
assert.match(providers, /playbackType:'preview'/);

const start = js.indexOf('function parseLyrics(raw){');
const end = js.indexOf('\nfunction activeLyricIndex', start);
assert.ok(start >= 0 && end > start, 'LRC parser function is present');
const parseLyrics = new Function(js.slice(start, end) + '; return parseLyrics;')();
assert.deepEqual(parseLyrics('[00:12.40]First line\n[00:16.20]Second line'), [
  { time: 12.4, text: 'First line' },
  { time: 16.2, text: 'Second line' }
]);

let depth = 0;
for (const char of css) {
  if (char === '{') depth += 1;
  if (char === '}') depth -= 1;
  assert.ok(depth >= 0, 'CSS closing brace without an opening brace');
}
assert.equal(depth, 0, 'CSS braces are unbalanced');

console.log('MUSICVERSE PRO checks passed: syntax, selectors, lyrics, PWA shell, and federated source adapters.');
