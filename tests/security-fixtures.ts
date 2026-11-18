import { MOSAIC_LIMITS } from '../src/core/limits.ts';

// Valid Markdown values: the format's character ceiling does not bound syntax nesting.
export const nestedMarkdown = [
  {
    name: 'block quotes',
    text: ('> '.repeat(9_900) + '<img src=x onerror="globalThis.mosaicExecuted=true">').padEnd(
      MOSAIC_LIMITS.markdownCharacters,
      ' ',
    ),
  },
  {
    name: 'emphasis',
    text: ('*'.repeat(9_900) + 'nested' + '*'.repeat(9_900)).padEnd(
      MOSAIC_LIMITS.markdownCharacters,
      ' ',
    ),
  },
];

export const maliciousMarkdown = [
  '**Readable** [Jump](#constructor) [Web](https://example.org/) [Mail](mailto:team@example.org)',
  '[Script](j&#97;vascript&#58;alert%281%29) [Control](java&#x09;script:alert%281%29)',
  '[Data](data:text/html;base64,PHNjcmlwdD4=) [Blob](blob:https://example.org/id)',
  '[Relative](//example.org/relative) [File](file:///tmp/notes) [Legacy](vbscript:msgbox%281%29)',
  '[Image link](!ignored) [![Nested image](https://example.org/nested.png)](https://example.org/)',
  '![Inline](https://example.org/inline.png) ![Reference][image]',
  '[image]: https://example.org/reference.png',
  '<script>globalThis.mosaicExecuted=true</script>',
  '<svg onload="globalThis.mosaicExecuted=true"><a href="javascript:alert(1)">SVG</a></svg>',
  '<math><mtext><img src="https://example.org/math.png" onerror="globalThis.mosaicExecuted=true"></mtext></math>',
  '<iframe src="https://example.org/frame" srcdoc="<script>parent.mosaicExecuted=true</script>"></iframe>',
  '<object data="https://example.org/object"></object><embed src="https://example.org/embed">',
  '<video poster="https://example.org/poster"><source src="https://example.org/video"></video>',
  '<audio src="https://example.org/audio" autoplay></audio>',
  '<style>@import "https://example.org/styles";</style>',
  '<link rel="preload" as="image" href="https://example.org/preload.png">',
  '<base href="https://example.org/"><meta http-equiv="refresh" content="0;url=https://example.org/">',
  '<form id="constructor" name="location"><input name="__proto__" autofocus onfocus="globalThis.mosaicExecuted=true"></form>',
  '<a href="javascript:alert(1)" onclick="globalThis.mosaicExecuted=true">Raw link</a>',
  '~~~html\n<img src=x onerror="globalThis.mosaicExecuted=true">\n~~~',
].join('\n\n');
