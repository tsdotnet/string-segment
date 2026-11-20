![@tsdotnet/string-segment: A slice, not a copy. Views over strings, like .NET’s.](https://cdn.jsdelivr.net/gh/tsdotnet/string-segment@master/assets/banner.svg)

[![npm version](https://img.shields.io/npm/v/@tsdotnet/string-segment.svg?style=flat-square)](https://www.npmjs.com/package/@tsdotnet/string-segment)
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](https://github.com/tsdotnet/string-segment/blob/master/LICENSE)

`StringSegment` is a view over part of a string: an offset and a length, with no copying, like .NET's `StringSegment`.

## Install

```sh
npm install @tsdotnet/string-segment
```

## Usage

```ts
import StringSegment from '@tsdotnet/string-segment';

const seg = StringSegment.from('  name=ada  ').trim(); // no copy
seg.length; // 8
seg.indexOf('='); // 4
seg.subsegment(5).value; // "ada", the only place a string is made
```

`split()` yields segments lazily, so large inputs never build an array.

## Use it from

ESM (`import StringSegment from '@tsdotnet/string-segment';`) or CommonJS (`const StringSegment = require('@tsdotnet/string-segment').default;`).

<details><summary>In a browser, without a bundler</summary>

```html
<script src="https://cdn.jsdelivr.net/npm/@tsdotnet/char@1/dist/umd/char.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@tsdotnet/exceptions@1/dist/umd/exceptions.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@tsdotnet/string-segment@1/dist/umd/string-segment.min.js"></script>
<script>
  const StringSegment = tsdotnet.stringSegment.default;
</script>
```

</details>

## Docs

[tsdotnet.github.io/string-segment](https://tsdotnet.github.io/string-segment/)
