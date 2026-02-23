import { describe, it, expect } from 'vitest';
import StringSegment, { type SplitOptions, split, splitToArray } from '../src/StringSegment';

const HELLO = 'Hello, World!';

describe('StringSegment — from factory', () => {
	it('wraps full string', () => {
		const seg = StringSegment.from(HELLO);
		expect(seg.buffer).toBe(HELLO);
		expect(seg.offset).toBe(0);
		expect(seg.length).toBe(HELLO.length);
		expect(seg.value).toBe(HELLO);
	});

	it('wraps a slice', () => {
		const seg = StringSegment.from(HELLO, 7, 5);
		expect(seg.offset).toBe(7);
		expect(seg.length).toBe(5);
		expect(seg.value).toBe('World');
	});

	it('throws on negative offset', () => {
		expect(() => StringSegment.from(HELLO, -1, 3)).toThrow(RangeError);
	});

	it('throws on offset beyond buffer', () => {
		expect(() => StringSegment.from(HELLO, 100, 0)).toThrow(RangeError);
	});

	it('throws on length overflow', () => {
		expect(() => StringSegment.from(HELLO, 7, 999)).toThrow(RangeError);
	});
});

describe('StringSegment — properties', () => {
	it('hasValue is true for every constructed segment', () => {
		expect(StringSegment.from('hello').hasValue).toBe(true);
		expect(StringSegment.empty.hasValue).toBe(true);
	});

	it('isEmpty is false for non-empty', () => {
		expect(StringSegment.from('hello').isEmpty).toBe(false);
	});

	it('isEmpty is true for empty', () => {
		expect(StringSegment.from('', 0, 0).isEmpty).toBe(true);
		expect(StringSegment.empty.isEmpty).toBe(true);
	});

	it('isWhitespace is true for empty segment', () => {
		expect(StringSegment.empty.isWhitespace).toBe(true);
	});

	it('isWhitespace is true for all-space content', () => {
		expect(StringSegment.from('  \t\r\n  ').isWhitespace).toBe(true);
	});

	it('isWhitespace is false when non-whitespace present', () => {
		expect(StringSegment.from('  a  ').isWhitespace).toBe(false);
	});

	it('isWhitespace respects segment bounds not full buffer', () => {
		const seg = StringSegment.from('hello   world', 5, 3); // '   '
		expect(seg.isWhitespace).toBe(true);
	});

	it('value returns full buffer when covering whole string', () => {
		const s = 'abc';
		const seg = StringSegment.from(s);
		expect(seg.value).toBe(s);
	});

	it('value returns slice', () => {
		expect(StringSegment.from(HELLO, 7, 5).value).toBe('World');
	});
});

describe('StringSegment — charAt / charCodeAt', () => {
	const seg = StringSegment.from('abcdef', 1, 4); // 'bcde'

	it('charAt returns correct characters', () => {
		expect(seg.charAt(0)).toBe('b');
		expect(seg.charAt(3)).toBe('e');
	});

	it('charAt throws out of range', () => {
		expect(() => seg.charAt(-1)).toThrow(RangeError);
		expect(() => seg.charAt(4)).toThrow(RangeError);
	});

	it('charCodeAt returns code at index', () => {
		expect(seg.charCodeAt(0)).toBe('b'.charCodeAt(0));
		expect(seg.charCodeAt(3)).toBe('e'.charCodeAt(0));
	});
});

describe('StringSegment — indexOf', () => {
	const seg = StringSegment.from('a,b,,c,'); // 'a,b,,c,' — 7 chars

	it('finds first occurrence by char code', () => {
		expect(seg.indexOf(',')).toBe(1);
	});

	it('finds first occurrence by single-char string', () => {
		expect(seg.indexOf(',')).toBe(1);
	});

	it('respects start position', () => {
		expect(seg.indexOf(',', 2)).toBe(3);
		// index 4 is itself a ',' in 'a,b,,c,'
		expect(seg.indexOf(',', 4)).toBe(4);
		expect(seg.indexOf(',', 5)).toBe(6);
	});

	it('returns -1 when not found', () => {
		expect(seg.indexOf('z'.charCodeAt(0))).toBe(-1);
		expect(seg.indexOf('z')).toBe(-1);
	});

	it('start past end returns -1', () => {
		expect(seg.indexOf(',', 100)).toBe(-1);
	});

	it('works on an offset slice', () => {
		const slice = StringSegment.from('   hello   ', 3, 5); // 'hello'
		expect(slice.indexOf('l'.charCodeAt(0))).toBe(2);
	});

	it('multi-char string search', () => {
		const s = StringSegment.from('abcabc');
		expect(s.indexOf('bc')).toBe(1);
		expect(s.indexOf('bc', 2)).toBe(4);
	});

	it('multi-char StringSegment search', () => {
		const haystack = StringSegment.from('--hello world--', 2, 11); // 'hello world'
		const needle   = StringSegment.from('___world___', 3, 5);       // 'world'
		expect(haystack.indexOf(needle)).toBe(6);
	});

	it('empty string needle returns start position', () => {
		expect(seg.indexOf('')).toBe(0);
		expect(seg.indexOf('', 3)).toBe(3);
	});

	it('needle longer than segment returns -1', () => {
		const short = StringSegment.from('ab');
		expect(short.indexOf('abcde')).toBe(-1);
	});
});

describe('StringSegment — indexOfAny', () => {
	const seg = StringSegment.from('a1b2c3');

	it('finds first character matching any candidate', () => {
		expect(seg.indexOfAny('123')).toBe(1);
	});

	it('finds candidate that appears later in candidates string', () => {
		expect(seg.indexOfAny('23')).toBe(3); // '2' is at index 3
	});

	it('respects start position', () => {
		expect(seg.indexOfAny('123', 2)).toBe(3);
	});

	it('returns -1 when no candidate matches', () => {
		expect(seg.indexOfAny('xyz')).toBe(-1);
	});

	it('works with whitespace candidate set', () => {
		const line = StringSegment.from('key:  value');
		expect(line.indexOfAny(' \t')).toBe(4);
	});

	it('start past end returns -1', () => {
		expect(seg.indexOfAny('123', 100)).toBe(-1);
	});

	it('works on an offset slice', () => {
		const seg2 = StringSegment.from('..abc..', 2, 3); // 'abc'
		expect(seg2.indexOfAny('bc')).toBe(1);
	});
});

describe('StringSegment — lastIndexOf', () => {
	const seg = StringSegment.from('a,b,,c,');

	it('finds last occurrence by char code', () => {
		expect(seg.lastIndexOf(',')).toBe(6);
	});

	it('finds last occurrence by string', () => {
		expect(seg.lastIndexOf(',')).toBe(6);
	});

	it('returns -1 when not found', () => {
		expect(seg.lastIndexOf('z'.charCodeAt(0))).toBe(-1);
		expect(seg.lastIndexOf('z')).toBe(-1);
	});

	it('works on an offset slice', () => {
		const slice = StringSegment.from('x,y,z', 2, 3); // 'y,z'
		expect(slice.lastIndexOf(',')).toBe(1);
	});

	it('multi-char string search', () => {
		const s = StringSegment.from('abcabc');
		expect(s.lastIndexOf('abc')).toBe(3);
	});

	it('multi-char StringSegment search', () => {
		const haystack = StringSegment.from('one two one');
		const needle   = StringSegment.from('...one...', 3, 3); // 'one'
		expect(haystack.lastIndexOf(needle)).toBe(8);
	});

	it('empty string returns segment length', () => {
		expect(seg.lastIndexOf('')).toBe(seg.length);
	});
});

describe('StringSegment — substring', () => {
	const seg = StringSegment.from(HELLO, 7, 5); // 'World'

	it('extracts full sub-string', () => {
		expect(seg.substring(0)).toBe('World');
	});

	it('extracts partial', () => {
		expect(seg.substring(1, 3)).toBe('orl');
	});

	it('throws on bad range', () => {
		expect(() => seg.substring(-1)).toThrow(RangeError);
		expect(() => seg.substring(0, 99)).toThrow(RangeError);
	});
});

describe('StringSegment — subsegment', () => {
	const seg = StringSegment.from(HELLO, 7, 5); // 'World'

	it('creates child segment sharing the same buffer', () => {
		const child = seg.subsegment(1, 3);
		expect(child.buffer).toBe(HELLO); // same reference
		expect(child.offset).toBe(8);
		expect(child.length).toBe(3);
		expect(child.value).toBe('orl');
	});

	it('defaults length to rest of segment', () => {
		expect(seg.subsegment(2).value).toBe('rld');
	});

	it('returns this when offset=0 and same length', () => {
		expect(seg.subsegment(0, seg.length)).toBe(seg);
	});

	it('returns this when offset=0 with no length arg', () => {
		expect(seg.subsegment(0)).toBe(seg);
	});

	it('throws RangeError on negative offset', () => {
		expect(() => seg.subsegment(-1)).toThrow(RangeError);
	});

	it('throws RangeError when length exceeds segment', () => {
		expect(() => seg.subsegment(0, 99)).toThrow(RangeError);
	});
});

describe('StringSegment — preceding', () => {
	const buffer = 'Hello, World!';
	const seg = StringSegment.from(buffer, 7, 5); // 'World'

	it('returns all chars before the segment', () => {
		const pre = seg.preceding();
		expect(pre.buffer).toBe(buffer);
		expect(pre.value).toBe('Hello, ');
	});

	it('limits by maxChars', () => {
		// 'Hello, World!' offset 7 = 'W'; 3 chars before = indices 4,5,6 = 'o, '
		expect(seg.preceding(3).value).toBe('o, ');
	});

	it('returns empty when at start of buffer', () => {
		const atStart = StringSegment.from(buffer, 0, 5);
		expect(atStart.preceding()).toBe(StringSegment.empty);
	});

	it('maxChars larger than available returns all preceding', () => {
		expect(seg.preceding(999).value).toBe('Hello, ');
	});
});

describe('StringSegment — following', () => {
	const buffer = 'Hello, World!';
	const seg = StringSegment.from(buffer, 7, 5); // 'World'

	it('returns all chars after the segment', () => {
		expect(seg.following().value).toBe('!');
	});

	it('limits by maxChars', () => {
		const long = StringSegment.from('one two three', 0, 3); // 'one'
		expect(long.following(4).value).toBe(' two');
	});

	it('returns empty when at end of buffer', () => {
		const atEnd = StringSegment.from(buffer, 8, 5); // 'orld!'
		expect(atEnd.following()).toBe(StringSegment.empty);
	});

	it('maxChars larger than remaining returns all following', () => {
		expect(seg.following(999).value).toBe('!');
	});
});

describe('StringSegment — startsWith', () => {
	const seg = StringSegment.from('Hello World');

	it('true for matching prefix string', () => {
		expect(seg.startsWith('Hello')).toBe(true);
	});

	it('false for non-matching prefix', () => {
		expect(seg.startsWith('World')).toBe(false);
	});

	it('ordinalIgnoreCase match', () => {
		expect(seg.startsWith('hello', true)).toBe(true);
		expect(seg.startsWith('HELLO', true)).toBe(true);
	});

	it('empty prefix always matches', () => {
		expect(seg.startsWith('')).toBe(true);
	});

	it('prefix longer than segment returns false', () => {
		expect(seg.startsWith('Hello World And More')).toBe(false);
	});

	it('accepts StringSegment as prefix', () => {
		const prefix = StringSegment.from('___Hello___', 3, 5); // 'Hello'
		expect(seg.startsWith(prefix)).toBe(true);
	});
});

describe('StringSegment — endsWith', () => {
	const seg = StringSegment.from('Hello World');

	it('true for matching suffix string', () => {
		expect(seg.endsWith('World')).toBe(true);
	});

	it('false for non-matching suffix', () => {
		expect(seg.endsWith('Hello')).toBe(false);
	});

	it('ordinalIgnoreCase match', () => {
		expect(seg.endsWith('WORLD', true)).toBe(true);
	});

	it('empty suffix always matches', () => {
		expect(seg.endsWith('')).toBe(true);
	});

	it('suffix longer than segment returns false', () => {
		expect(seg.endsWith('Hello World And More')).toBe(false);
	});

	it('accepts StringSegment as suffix', () => {
		const suffix = StringSegment.from('___World___', 3, 5); // 'World'
		expect(seg.endsWith(suffix)).toBe(true);
	});
});

describe('StringSegment — equals', () => {
	const seg = StringSegment.from('Hello');

	it('equals a matching string', () => {
		expect(seg.equals('Hello')).toBe(true);
	});

	it('false for different string', () => {
		expect(seg.equals('World')).toBe(false);
	});

	it('false for null/undefined', () => {
		expect(seg.equals(null)).toBe(false);
		expect(seg.equals(undefined)).toBe(false);
	});

	it('equals another StringSegment', () => {
		const other = StringSegment.from('---Hello---', 3, 5);
		expect(seg.equals(other)).toBe(true);
	});

	it('ordinalIgnoreCase', () => {
		expect(seg.equals('HELLO', true)).toBe(true);
	});

	it('different length is false', () => {
		expect(seg.equals('Hello!')).toBe(false);
	});
});

describe('StringSegment — trim', () => {
	const raw = '  \t Hello \n ';
	const seg = StringSegment.from(raw);

	it('trimStart removes leading whitespace', () => {
		expect(seg.trimStart().value).toBe('Hello \n ');
	});

	it('trimEnd removes trailing whitespace', () => {
		expect(seg.trimEnd().value).toBe('  \t Hello');
	});

	it('trim removes both', () => {
		expect(seg.trim().value).toBe('Hello');
	});

	it('trim returns same instance when already trimmed', () => {
		const clean = StringSegment.from('abc');
		expect(clean.trim()).toBe(clean);
	});

	it('trimStart returns same instance when already trimmed', () => {
		const clean = StringSegment.from('abc');
		expect(clean.trimStart()).toBe(clean);
	});

	it('trimEnd returns same instance when already trimmed', () => {
		const clean = StringSegment.from('abc');
		expect(clean.trimEnd()).toBe(clean);
	});

	it('trim on empty returns same empty instance', () => {
		expect(StringSegment.empty.trim()).toBe(StringSegment.empty);
	});
});

describe('StringSegment — trim with custom chars', () => {
	it('trimStart strips custom chars', () => {
		const seg = StringSegment.from('...hello...');
		expect(seg.trimStart('.').value).toBe('hello...');
	});

	it('trimEnd strips custom chars', () => {
		const seg = StringSegment.from('...hello...');
		expect(seg.trimEnd('.').value).toBe('...hello');
	});

	it('trim strips custom chars from both sides', () => {
		const seg = StringSegment.from('***hello***');
		expect(seg.trim('*').value).toBe('hello');
	});

	it('trim with multi-char candidate set', () => {
		const seg = StringSegment.from('< hello >');
		expect(seg.trim('< >').value).toBe('hello');
	});

	it('trim custom does not strip whitespace unless specified', () => {
		const seg = StringSegment.from('  hello  ');
		expect(seg.trim('.').value).toBe('  hello  ');
	});

	it('returns same instance when no matching chars at edges', () => {
		const seg = StringSegment.from('hello');
		expect(seg.trim('.')).toBe(seg);
	});
});

describe('StringSegment — split', () => {
	it("splits on ',' char code", () => {
		const seg   = StringSegment.from('a,b,c');
		const parts = [...seg.split(',')];
		expect(parts.length).toBe(3);
		expect(parts[0]!.value).toBe('a');
		expect(parts[1]!.value).toBe('b');
		expect(parts[2]!.value).toBe('c');
	});

	it("splits on ',' string", () => {
		const parts = [...StringSegment.from('a,b,c').split(',')];
		expect(parts.length).toBe(3);
	});

	it('all parts share the same buffer', () => {
		const buf  = 'x:y:z';
		const parts = [...StringSegment.from(buf).split(':')];
		for(const p of parts) expect(p.buffer).toBe(buf);
	});

	it('handles leading separator (empty first part)', () => {
		const parts = [...StringSegment.from(',a,').split(',')];
		expect(parts.length).toBe(3);
		expect(parts[0]!.value).toBe('');
		expect(parts[1]!.value).toBe('a');
		expect(parts[2]!.value).toBe('');
	});

	it('no separator → yields the whole segment', () => {
		const parts = [...StringSegment.from('abc').split(',')];
		expect(parts.length).toBe(1);
		expect(parts[0]!.value).toBe('abc');
	});

	it('empty segment yields one empty part', () => {
		const parts = [...StringSegment.empty.split(',')];
		expect(parts.length).toBe(1);
		expect(parts[0]!.isEmpty).toBe(true);
	});

	it('multi-char string separator', () => {
		const parts = [...StringSegment.from('one::two::three').split('::')];
		expect(parts.length).toBe(3);
		expect(parts[0]!.value).toBe('one');
		expect(parts[1]!.value).toBe('two');
		expect(parts[2]!.value).toBe('three');
	});

	it('multi-char: partial first-char match does not confuse the search', () => {
		// ':x' has ':' appearing solo before the real '::' separator
		const parts = [...StringSegment.from('a:b::c').split('::')];
		expect(parts.length).toBe(2);
		expect(parts[0]!.value).toBe('a:b');
		expect(parts[1]!.value).toBe('c');
	});

	it('StringSegment separator', () => {
		const haystack = StringSegment.from('a--b--c');
		const sep      = StringSegment.from('___--___', 3, 2); // '--'
		const parts    = [...haystack.split(sep)];
		expect(parts.length).toBe(3);
		expect(parts[0]!.value).toBe('a');
	});

	it('is a lazy iterable — can break early', () => {
		const seg   = StringSegment.from('a,b,c,d,e');
		let   count = 0;
		for(const part of seg.split(',')) {
			count++;
			if(part.value === 'b') break;
		}
		expect(count).toBe(2);
	});
});

describe('StringSegment — splitToArray', () => {
	it('returns an array of parts', () => {
		const parts = StringSegment.from('a,b,c').splitToArray(',');
		expect(Array.isArray(parts)).toBe(true);
		expect(parts.length).toBe(3);
		expect(parts[0]!.value).toBe('a');
		expect(parts[2]!.value).toBe('c');
	});

	it('supports options', () => {
		const parts = StringSegment.from(' a , , b ').splitToArray(',', { trimEntries: true, removeEmpty: true });
		expect(parts.length).toBe(2);
		expect(parts[0]!.value).toBe('a');
		expect(parts[1]!.value).toBe('b');
	});

	it('produces the same result as spreading split()', () => {
		const seg    = StringSegment.from('x:y:z');
		const lazy   = [...seg.split(':')];
		const eager  = seg.splitToArray(':');
		expect(eager.length).toBe(lazy.length);
		for(let i = 0; i < eager.length; i++)
			expect(eager[i]!.value).toBe(lazy[i]!.value);
	});
});

describe('StringSegment — split with options', () => {
	it('trimEntries trims whitespace from each part', () => {
		const seg   = StringSegment.from(' a , b , c ');
		const parts = [...seg.split(',', { trimEntries: true })];
		expect(parts.length).toBe(3);
		expect(parts[0]!.value).toBe('a');
		expect(parts[1]!.value).toBe('b');
		expect(parts[2]!.value).toBe('c');
	});

	it('removeEmpty skips blank entries', () => {
		const parts = [...StringSegment.from('a,,b,,c').split(',', { removeEmpty: true })];
		expect(parts.length).toBe(3);
		expect(parts.every(p => !p.isEmpty)).toBe(true);
	});

	it('trimEntries + removeEmpty skips whitespace-only entries', () => {
		const opts: SplitOptions = { trimEntries: true, removeEmpty: true };
		const parts = [...StringSegment.from('a, ,b,  ,c').split(',', opts)];
		expect(parts.length).toBe(3);
		expect(parts[0]!.value).toBe('a');
		expect(parts[1]!.value).toBe('b');
		expect(parts[2]!.value).toBe('c');
	});
});

describe('StringSegment — isNullOrEmpty / isNullOrWhiteSpace (static)', () => {
	it('isNullOrEmpty: null', () => {
		expect(StringSegment.isNullOrEmpty(null)).toBe(true);
	});

	it('isNullOrEmpty: undefined', () => {
		expect(StringSegment.isNullOrEmpty(undefined)).toBe(true);
	});

	it('isNullOrEmpty: empty segment', () => {
		expect(StringSegment.isNullOrEmpty(StringSegment.empty)).toBe(true);
	});

	it('isNullOrEmpty: non-empty segment', () => {
		expect(StringSegment.isNullOrEmpty(StringSegment.from('hi'))).toBe(false);
	});

	it('isNullOrEmpty: whitespace segment is NOT empty', () => {
		expect(StringSegment.isNullOrEmpty(StringSegment.from('  '))).toBe(false);
	});

	it('isNullOrWhiteSpace: null', () => {
		expect(StringSegment.isNullOrWhiteSpace(null)).toBe(true);
	});

	it('isNullOrWhiteSpace: undefined', () => {
		expect(StringSegment.isNullOrWhiteSpace(undefined)).toBe(true);
	});

	it('isNullOrWhiteSpace: empty', () => {
		expect(StringSegment.isNullOrWhiteSpace(StringSegment.empty)).toBe(true);
	});

	it('isNullOrWhiteSpace: all whitespace', () => {
		expect(StringSegment.isNullOrWhiteSpace(StringSegment.from('  \t  '))).toBe(true);
	});

	it('isNullOrWhiteSpace: has non-whitespace', () => {
		expect(StringSegment.isNullOrWhiteSpace(StringSegment.from('  a  '))).toBe(false);
	});
});

describe('StringSegment — compare (static)', () => {
	it('equal segments', () => {
		expect(StringSegment.compare('abc', 'abc')).toBe(0);
	});

	it('lexicographic order', () => {
		expect(StringSegment.compare('abc', 'abd')).toBeLessThan(0);
		expect(StringSegment.compare('abd', 'abc')).toBeGreaterThan(0);
	});

	it('length difference', () => {
		expect(StringSegment.compare('ab', 'abc')).toBeLessThan(0);
	});

	it('null handling', () => {
		expect(StringSegment.compare(null, null)).toBe(0);
		expect(StringSegment.compare(null, 'a')).toBeLessThan(0);
		expect(StringSegment.compare('a', null)).toBeGreaterThan(0);
	});

	it('ordinalIgnoreCase', () => {
		expect(StringSegment.compare('ABC', 'abc', true)).toBe(0);
	});

	it('compares StringSegment instances', () => {
		const a = StringSegment.from('--hello--', 2, 5);
		const b = StringSegment.from('hello');
		expect(StringSegment.compare(a, b)).toBe(0);
	});
});

describe('StringSegment — iteration', () => {
	it('iterates segment characters only (not full buffer)', () => {
		const seg = StringSegment.from('>>>abc<<<', 3, 3); // 'abc'
		expect([...seg]).toEqual(['a', 'b', 'c']);
	});

	it('empty segment yields nothing', () => {
		expect([...StringSegment.empty]).toEqual([]);
	});

	it('spread produces same string as .value', () => {
		const seg = StringSegment.from(HELLO, 7, 5); // 'World'
		expect([...seg].join('')).toBe(seg.value);
	});
});

describe('StringSegment — static factory', () => {
	it('from() wraps a string', () => {
		const seg = StringSegment.from('hello');
		expect(seg.value).toBe('hello');
	});

	it('from(null) returns noValue', () => {
		expect(StringSegment.from(null)).toBe(StringSegment.noValue);
	});

	it('from(undefined) returns noValue', () => {
		expect(StringSegment.from(undefined)).toBe(StringSegment.noValue);
	});

	it('from("") returns empty', () => {
		expect(StringSegment.from('')).toBe(StringSegment.empty);
	});
});

// ---------------------------------------------------------------------------
// Exported convenience functions: split / splitToArray
// ---------------------------------------------------------------------------

describe('split (exported function)', () => {
	it('splits a plain string lazily', () => {
		const parts = [...split('a,b,c', ',')];
		expect(parts.length).toBe(3);
		expect(parts[0]!.value).toBe('a');
		expect(parts[2]!.value).toBe('c');
	});

	it('parts share the original string as buffer', () => {
		const buf   = 'x:y:z';
		const parts = [...split(buf, ':')];
		for(const p of parts) expect(p.buffer).toBe(buf);
	});

	it('passes options through', () => {
		const parts = [...split(' a , , b ', ',', { trimEntries: true, removeEmpty: true })];
		expect(parts.length).toBe(2);
		expect(parts[0]!.value).toBe('a');
		expect(parts[1]!.value).toBe('b');
	});

	it('is lazy — can break early', () => {
		let count = 0;
		for(const part of split('a,b,c,d,e', ',')) {
			count++;
			if(part.value === 'b') break;
		}
		expect(count).toBe(2);
	});
});

describe('splitToArray (exported function)', () => {
	it('splits a plain string into an array', () => {
		const parts = splitToArray('a,b,c', ',');
		expect(Array.isArray(parts)).toBe(true);
		expect(parts.length).toBe(3);
		expect(parts[1]!.value).toBe('b');
	});

	it('passes options through', () => {
		const parts = splitToArray('a,,b', ',', { removeEmpty: true });
		expect(parts.length).toBe(2);
	});

	it('produces the same values as the split() iterable', () => {
		const str   = 'one:two:three';
		const lazy  = [...split(str, ':')];
		const eager = splitToArray(str, ':');
		expect(eager.length).toBe(lazy.length);
		for(let i = 0; i < eager.length; i++)
			expect(eager[i]!.value).toBe(lazy[i]!.value);
	});
});

describe('StringSegment — toString', () => {
	it('returns the represented substring', () => {
		const seg = StringSegment.from('--hello--', 2, 5);
		expect(seg.toString()).toBe('hello');
	});

	it('same as .value', () => {
		const seg = StringSegment.from(HELLO, 7, 5);
		expect(seg.toString()).toBe(seg.value);
	});
});
