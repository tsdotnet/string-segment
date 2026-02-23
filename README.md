# @tsdotnet/string-segment

[![GitHub license](https://img.shields.io/github/license/tsdotnet/string-segment)](https://github.com/tsdotnet/string-segment/blob/master/LICENSE)
[![npm version](https://img.shields.io/npm/v/@tsdotnet/string-segment)](https://www.npmjs.com/package/@tsdotnet/string-segment)

A TypeScript port of [`Microsoft.Extensions.Primitives.StringSegment`](https://github.com/dotnet/runtime/blob/main/src/libraries/Microsoft.Extensions.Primitives/src/StringSegment.cs), also influenced by [Open.Text](https://github.com/Open-NET-Libraries/Open.Text).

`StringSegment` is an immutable view over a substring — it holds a reference to the original string buffer along with an `offset` and `length`. Operations like `indexOf`, `startsWith`, `endsWith`, `trim`, `split`, `equals`, and `compare` work directly on the buffer slice without materializing a new string. Only `.value` (or `.toString()`) actually allocates.

---

## Installation

```bash
npm install @tsdotnet/string-segment
# or
pnpm add @tsdotnet/string-segment
```

---

## Quick Start

```ts
import StringSegment, { split } from '@tsdotnet/string-segment';

// Wrap a string — no allocation yet
const seg = StringSegment.from('  hello, world  ');

// Trim without allocating
const trimmed = seg.trim();
console.log(trimmed.length);   // 13 — no string created

// Lazy split — yields views one at a time
for (const part of trimmed.split(',', { trimEntries: true })) {
  console.log(part.value);     // "hello", "world"
}

// Top-level helper — same as above
for (const part of split('a,b,c', ',')) {
  console.log(part.value);
}
```

---

## When Is This Useful?

`StringSegment` is a targeted tool, not a general replacement for native strings.  
V8's built-in string operations (`split`, `trim`, `substring`, `indexOf`) are TurboFan
intrinsics that compile to near-C++ machine code with SIMD support. In most scenarios
they are significantly faster than wrapping results in a JS object.

**The one case where `StringSegment` wins**: **sparse access on wide records.**

When you have a string with many fields and only need a few of them, `split()` in
native JS allocates *all* substrings upfront before you read any. `StringSegment.split()`
is a lazy generator — it yields segments on demand and stops when you break. For a 100-column
CSV row where you only read two columns, this makes a ~3× measurable throughput difference
and proportionally less pressure on the garbage collector.

### Benchmark Results

Benchmarks run with [Vitest bench](https://vitest.dev/guide/performance) on Node.js (V8):

| Scenario | Native | StringSegment | Winner |
|---|---|---|---|
| Sparse CSV – 100 cols, read 2 | 651,292 hz | 1,919,318 hz | **Segment ~3×** ✅ |
| Sparse CSV – 20 cols, read 2 | 2,650,702 hz | 2,667,912 hz | Tied (~1×) |
| HTTP header lookup – 20 headers | 8,986,460 hz | 1,997,432 hz | Native ~4.5× |
| HTTP header lookup – 80 headers | 9,841,164 hz | 1,975,407 hz | Native ~5× |
| Chained subsegment depth-4 | 19,312,634 hz | 4,891,191 hz | Native ~4× |
| Trim + compare | 11,509,888 hz | 1,817,637 hz | Native ~6× |

**Why native wins in most scenarios:**  
V8's string operations are built-in intrinsics backed by SIMD. More importantly, `substring()`
on a flat string can be a thin C++ pointer + length wrapper with near-zero allocation cost at the
engine level. A `StringSegment`, by contrast, is a frozen JS heap object — `Object.freeze()`
prevents V8's hidden-class optimisations, and per-iteration object construction overhead dominates
in tight loops.

**Where StringSegment's memory story is still real:**  
Even where throughput doesn't win, `StringSegment` avoids materialising strings you never read.
In long-running server processes parsing wide records, this reduces GC young-generation pressure
and the associated pause frequency. Multiple `StringSegment` instances over the same large buffer
share bytes without copying.

**Honest summary:** If you are splitting strings and using every field, use `string.split()`.
If you are processing wide records and only need a handful of fields, `StringSegment.split()`
is measurably faster and GC-friendlier.

---

## API

### Static factory

#### `StringSegment.from(value: string | null | undefined): StringSegment`

Wraps a string as a segment. Returns `StringSegment.noValue` for `null`/`undefined`,
`StringSegment.empty` for `""`, otherwise wraps the string.

#### `StringSegment.from(buffer: string, offset: number, length: number): StringSegment`

Creates a segment over a specific slice of a string.

```ts
const whole = StringSegment.from('hello world');
const slice = StringSegment.from('hello world', 6, 5); // "world"
```

The constructor is private — use `StringSegment.from(...)` to create instances.

#### `StringSegment.empty`

Reusable empty segment (`""` with a buffer). `hasValue` is `true`, `length` is `0`.

#### `StringSegment.noValue`

Reusable null-equivalent segment. `hasValue` is `false`. Attempting buffer operations
throws `NullReferenceException` unless guarded by `hasValue`.

---

### Core properties

| Property | Type | Description |
|---|---|---|
| `buffer` | `string \| null` | The source string. `null` only for `noValue`. |
| `offset` | `number` | Zero-based start position within `buffer`. |
| `length` | `number` | Number of characters in the segment. |
| `hasValue` | `boolean` | `true` unless this is `noValue`. |
| `isEmpty` | `boolean` | `true` when `length === 0`. |
| `isWhitespace` | `boolean` | `true` when every character is whitespace. No allocation. |
| `value` | `string` | **Allocates.** Returns the represented substring. |

---

### Character access

```ts
seg.charAt(index: number): string
seg.charCodeAt(index: number): number   // prefer this — no allocation
```

---

### Search

```ts
// Returns segment-relative index, or -1
seg.indexOf(search: string | StringSegment | number, start?: number): number
seg.lastIndexOf(search: string | StringSegment | number): number

// Find the first character that is in the set
seg.indexOfAny(chars: string, start?: number): number  // e.g. ' \t\r\n'
```

Char-code (`number`) arguments take a fast scan path — no string object created.

---

### Subsegments (no allocation)

```ts
seg.subsegment(offset: number, length?: number): StringSegment
seg.preceding(maxChars?: number): StringSegment   // everything before this seg in its buffer
seg.following(maxChars?: number): StringSegment   // everything after this seg in its buffer
```

`subsegment`, `preceding`, and `following` all share the parent buffer — no copying.

---

### Substring (allocates)

```ts
seg.substring(offset: number, length?: number): string
```

Use `subsegment` if you want to stay within the buffer; use `substring` only when you
need a plain `string`.

---

### Trimming (no allocation)

```ts
seg.trimStart(chars?: string): StringSegment
seg.trimEnd(chars?: string):   StringSegment
seg.trim(chars?: string):      StringSegment
```

Without `chars`, trims Unicode whitespace (via `@tsdotnet/char`).  
With `chars`, every character in the string is a trim candidate.

---

### Comparison

```ts
seg.startsWith(text: string | StringSegment, ignoreCase?: boolean): boolean
seg.endsWith(text:   string | StringSegment, ignoreCase?: boolean): boolean
seg.equals(other:    string | StringSegment | null | undefined, ignoreCase?: boolean): boolean

// Sort comparator — returns negative / 0 / positive
StringSegment.compare(
  a: StringSegment | string | null | undefined,
  b: StringSegment | string | null | undefined,
  ignoreCase?: boolean
): number
```

All comparison methods work directly on the buffer — `.value` is not called internally unless
`ignoreCase` requires a lowercase conversion.

---

### Splitting (lazy generator)

```ts
export interface SplitOptions {
  trimEntries?: boolean;  // trim each result segment (default: false)
  removeEmpty?: boolean;  // skip empty / all-whitespace segments (default: false)
}

seg.split(separator: string | StringSegment | number, options?: SplitOptions): Iterable<StringSegment>
seg.splitToArray(separator, options?): StringSegment[]
```

`split` is a generator — it does not allocate an array. Break early and you pay only for
the segments you consume. `splitToArray` collects into an array (convenience wrapper).

**Top-level helpers** (no need to construct a `StringSegment` manually):

```ts
import { split, splitToArray } from '@tsdotnet/string-segment';

for (const part of split('a, b, c', ',', { trimEntries: true })) { ... }
const parts = splitToArray('a,b,c', ',');
```

---

### Guard helpers

```ts
StringSegment.isNullOrEmpty(segment: StringSegment | null | undefined): boolean
StringSegment.isNullOrWhiteSpace(segment: StringSegment | null | undefined): boolean
```

---

### Iterable

`StringSegment` implements `Symbol.iterator`, yielding individual characters:

```ts
for (const ch of seg) console.log(ch);
[...seg]  // string[]
```

---

## Design Notes (JS vs .NET)

- **No `char` type.** Single-character search/trim methods accept a char code (`number`)
  as a fast path. This avoids creating a 1-character string just to compare.
- **`noValue` vs `empty`.** Mirrors .NET's distinction between `null` and `""`. A segment
  with no buffer (`noValue`) is the null equivalent; a segment with an empty buffer (`empty`)
  has a value — it just happens to be zero-length.
- **`Object.freeze`.** Instances are deeply immutable. This is intentional for correctness in
  concurrent/reactive scenarios, despite a minor V8 optimisation trade-off.
- **ESM + CJS.** Dual-module package. `import` resolves to the ESM build; `require` resolves to
  the CJS build. TypeScript declarations are included.

---

## License

MIT © [electricessence](https://github.com/electricessence)
