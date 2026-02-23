/*!
 * @author electricessence / https://github.com/electricessence/
 * .NET Reference: https://github.com/dotnet/runtime/blob/main/src/libraries/Microsoft.Extensions.Primitives/src/StringSegment.cs
 * Influenced by: https://github.com/Open-NET-Libraries/Open.Text
 * Licensing: MIT
 *
 * StringSegment is an optimized representation of a substring that avoids
 * unnecessary allocations. Rather than calling string.substring() eagerly,
 * a StringSegment holds a reference to the original buffer along with an
 * offset and length. Operations such as indexOf, startsWith, endsWith,
 * trim, split, equals, preceding, and following can all operate directly
 * on the buffer slice without ever materializing a new string.
 *
 * Only .value (or .toString()) actually allocates the substring.
 *
 * Design notes (JS vs .NET):
 *  - There is no `char` type in JS. Single-character operations accept a
 *    char code (`number`) — this is faster than a 1-char string and makes
 *    the intent explicit.
 *  - Multi-character search/prefix/suffix accepts `string | StringSegment`
 *    and operates on the buffer directly without allocating.
 *  - `split()` is a lazy generator — no upfront array allocation.
 */

/** @packageDocumentation */

import { isWhiteSpace } from '@tsdotnet/char';
import { ArgumentOutOfRangeException, NullReferenceException } from '@tsdotnet/exceptions';

/** Options for {@link StringSegment.split}. */
export interface SplitOptions {
	/** Trim whitespace from each result segment. Default: `false`. */
	trimEntries?: boolean;
	/** Omit empty (or all-whitespace when trimming) segments. Default: `false`. */
	removeEmpty?: boolean;
}

const EMPTY_STRING = '';

/**
 * An optimized representation of a substring that avoids allocations.
 *
 * Operations like `indexOf`, `startsWith`, `endsWith`, `trim`, `equals`,
 * `subsegment`, `preceding`, and `following` work directly on the parent
 * buffer. No new string is allocated until you access `.value` or call
 * `.toString()`.
 */
export class StringSegment
{
	/** A reusable empty segment (empty string, has a buffer). */
	static readonly empty: StringSegment = new StringSegment(EMPTY_STRING, 0, 0);

	/**
	 * A reusable no-value segment — no buffer attached.
	 * Returned by {@link StringSegment.from} for `null`/`undefined` input.
	 * Check {@link hasValue} before calling any operation that accesses the buffer.
	 */
	static readonly noValue: StringSegment = new StringSegment(null as unknown as string, 0, 0);

	readonly buffer: string | null;
	readonly offset: number;
	readonly length: number;

	// -------------------------------------------------------------------
	// Constructors
	// -------------------------------------------------------------------

	/**
	 * Creates a `StringSegment` that wraps an entire string.
	 * @param buffer The source string.
	 */
	constructor(buffer: string);

	/**
	 * Creates a `StringSegment` over a slice of a string.
	 * @param buffer The source string.
	 * @param offset Zero-based start position within `buffer`.
	 * @param length Number of characters in the segment.
	 */
	constructor(buffer: string, offset: number, length: number);

	constructor(buffer: string, offset = 0, length?: number) {
		const bufferLen = buffer?.length ?? 0;
		offset = offset ?? 0;
		if(buffer == null && offset !== 0) {
			throw new ArgumentOutOfRangeException(
				'offset', offset,
				'Cannot specify a non-zero offset when buffer is null.');
		}

		if(offset < 0 || offset > bufferLen)
			throw new RangeError(`offset (${offset}) is out of range [0, ${bufferLen}]`);

		const len = length ?? (bufferLen - offset);
		if(len < 0 || offset + len > bufferLen)
			throw new RangeError(`length (${len}) is out of range for buffer of length ${bufferLen} at offset ${offset}`);

		this.length = len;
		this.offset = offset;
		this.buffer = buffer;

		Object.freeze(this);
	}

	// -------------------------------------------------------------------
	// Core properties
	// -------------------------------------------------------------------

	/**
	 * Asserts that this segment has a buffer and returns it.
	 * Throws {@link NullReferenceException} when called on {@link StringSegment.noValue}.
	 */
	private requireBuffer(): string {
		if(this.buffer == null)
			throw new NullReferenceException(
				'Operation is not valid on a StringSegment with no buffer (noValue). '
				+ 'Check .hasValue before calling this operation.');
		return this.buffer;
	}

	/** `true` when a buffer is attached. `false` only for {@link StringSegment.noValue}. */
	get hasValue(): boolean { return this.buffer != null; }

	/** `true` when length is 0. */
	get isEmpty(): boolean { return this.length === 0; }

	/**
	 * `true` when the segment is empty or contains only whitespace characters.
	 * Does **not** allocate a string.
	 */
	get isWhitespace(): boolean {
		const buf = this.requireBuffer();
		const end = this.offset + this.length;
		for(let i = this.offset; i < end; i++) {
			if(!isWhiteSpace(buf.charCodeAt(i))) return false;
		}
		return true;
	}

	/**
	 * Materializes and returns the represented substring.
	 * This is the **only** operation that allocates a new string.
	 */
	get value(): string {
		const buf = this.requireBuffer();
		return this.offset === 0 && this.length === buf.length
			? buf
			: buf.substring(this.offset, this.offset + this.length);
	}

	// -------------------------------------------------------------------
	// Character access
	// -------------------------------------------------------------------

	/**
	 * Returns the character at `index` within the segment (not the buffer).
	 * @param index Zero-based index within the segment.
	 */
	charAt(index: number): string {
		if(index < 0 || index >= this.length)
			throw new RangeError(`index (${index}) is out of range [0, ${this.length})`);
		return this.requireBuffer()[this.offset + index]!;
	}

	/**
	 * Returns the UTF-16 char code at `index` within the segment.
	 * Prefer this over `charAt` when comparing characters — avoids string allocation.
	 * @param index Zero-based index within the segment.
	 */
	charCodeAt(index: number): number {
		if(index < 0 || index >= this.length)
			throw new RangeError(`index (${index}) is out of range [0, ${this.length})`);
		return this.requireBuffer().charCodeAt(this.offset + index);
	}

	// -------------------------------------------------------------------
	// Search
	// -------------------------------------------------------------------

	/**
	 * Finds the first occurrence of a string (or `StringSegment`) within this
	 * segment, starting at `start`.
	 *
	 * Single-character strings and char codes use a fast scan internally — no allocation.
	 * Returns the **segment-relative** index, or `-1` if not found.
	 *
	 * @param search A `string` or `StringSegment` to look for. A single char code
	 *   (`number`) is also accepted as a low-level fast path.
	 * @param start Zero-based start position within this segment. Defaults to `0`.
	 */
	indexOf(search: string | StringSegment | number, start = 0): number {
		if(start < 0 || start > this.length) return -1;
		const buf  = this.requireBuffer();
		const base = this.offset;

		if(typeof search === 'number') {
			// Char-code fast path
			for(let i = start; i < this.length; i++) {
				if(buf.charCodeAt(base + i) === search) return i;
			}
			return -1;
		}

		let needle: string, needleOff: number, needleLen: number;
		if(search instanceof StringSegment) {
			const { buffer } = search;
			if(buffer == null) return -1; // noValue StringSegment needle
			needle    = buffer;
			needleOff = search.offset;
			needleLen = search.length;
		} else {
			needle    = search;
			needleOff = 0;
			needleLen = search.length;
		}
		if(needleLen === 0) return start;
		if(needleLen > this.length - start) return -1;

		const first = needle.charCodeAt(needleOff);

		if(needleLen === 1) {
			// Fast single-char path — no allocation
			for(let i = start; i < this.length; i++) {
				if(buf.charCodeAt(base + i) === first) return i;
			}
			return -1;
		}

		const limit = this.length - needleLen;
		outer: for(let i = start; i <= limit; i++) {
			if(buf.charCodeAt(base + i) !== first) continue;
			for(let j = 1; j < needleLen; j++) {
				if(buf.charCodeAt(base + i + j) !== needle.charCodeAt(needleOff + j)) continue outer;
			}
			return i;
		}
		return -1;
	}

	/**
	 * Finds the first occurrence of **any** of the given characters within
	 * this segment. Pass a string — every character in it is a candidate.
	 *
	 * @param chars A string whose characters are each a search candidate.
	 * @param start Zero-based start position within the segment. Defaults to `0`.
	 *
	 * @example seg.indexOfAny(' \t\r\n') // find first whitespace
	 */
	indexOfAny(chars: string, start = 0): number {
		if(start < 0 || start > this.length) return -1;
		const buf  = this.requireBuffer();
		const base = this.offset;

		// Build a char-code lookup set once
		const codes = new Set<number>();
		for(let i = 0; i < chars.length; i++) codes.add(chars.charCodeAt(i));

		for(let i = start; i < this.length; i++) {
			if(codes.has(buf.charCodeAt(base + i))) return i;
		}
		return -1;
	}

	/**
	 * Finds the last occurrence of a string (or `StringSegment`) within this segment.
	 *
	 * Single-character strings and char codes use a fast scan internally — no allocation.
	 * Returns the **segment-relative** index, or `-1` if not found.
	 *
	 * @param search A `string` or `StringSegment` to look for. A char code
	 *   (`number`) is also accepted as a low-level fast path.
	 */
	lastIndexOf(search: string | StringSegment | number): number {
		const buf  = this.requireBuffer();
		const base = this.offset;

		if(typeof search === 'number') {
			// Char-code fast path
			for(let i = this.length - 1; i >= 0; i--) {
				if(buf.charCodeAt(base + i) === search) return i;
			}
			return -1;
		}

		let needle: string, needleOff: number, needleLen: number;
		if(search instanceof StringSegment) {
			const { buffer } = search;
			if(buffer == null) return -1; // noValue StringSegment needle
			needle    = buffer;
			needleOff = search.offset;
			needleLen = search.length;
		} else {
			needle    = search;
			needleOff = 0;
			needleLen = search.length;
		}
		if(needleLen === 0) return this.length;
		if(needleLen > this.length) return -1;

		const first = needle.charCodeAt(needleOff);

		if(needleLen === 1) {
			// Fast single-char path — no allocation
			for(let i = this.length - 1; i >= 0; i--) {
				if(buf.charCodeAt(base + i) === first) return i;
			}
			return -1;
		}

		outer: for(let i = this.length - needleLen; i >= 0; i--) {
			if(buf.charCodeAt(base + i) !== first) continue;
			for(let j = 1; j < needleLen; j++) {
				if(buf.charCodeAt(base + i + j) !== needle.charCodeAt(needleOff + j)) continue outer;
			}
			return i;
		}
		return -1;
	}

	// -------------------------------------------------------------------
	// Substring / subsegment
	// -------------------------------------------------------------------

	/**
	 * Extracts a substring as a new `string` — **allocates**.
	 *
	 * @param offset Zero-based start within this segment.
	 * @param length Number of characters. Defaults to the rest of the segment.
	 */
	substring(offset: number, length?: number): string {
		const len = length ?? (this.length - offset);
		if(offset < 0 || offset > this.length)
			throw new RangeError(`offset (${offset}) out of range`);
		if(len < 0 || offset + len > this.length)
			throw new RangeError(`length (${len}) out of range`);
		return this.requireBuffer().substring(this.offset + offset, this.offset + offset + len);
	}

	/**
	 * Returns a new `StringSegment` over a slice of this segment.
	 * **No string allocation** — shares the same buffer.
	 *
	 * @param offset Zero-based start within this segment.
	 * @param length Number of characters. Defaults to the rest of the segment.
	 */
	subsegment(offset: number, length?: number): StringSegment {
		const buf = this.requireBuffer();
		const len = length ?? (this.length - offset);
		if(offset < 0 || offset > this.length)
			throw new RangeError(`offset (${offset}) out of range`);
		if(len < 0 || offset + len > this.length)
			throw new RangeError(`length (${len}) out of range`);
		if(offset === 0 && len === this.length) return this;
		return new StringSegment(buf, this.offset + offset, len);
	}

	// -------------------------------------------------------------------
	// Buffer navigation (no allocation)
	// -------------------------------------------------------------------

	/**
	 * Returns a segment representing the characters **before** this one in the
	 * same buffer. Useful for backtracking without allocating.
	 *
	 * @param maxChars Maximum number of characters to include. Defaults to all
	 *   characters before this segment.
	 */
	preceding(maxChars?: number): StringSegment {
		const buf = this.requireBuffer();
		const end = this.offset;
		if(end === 0) return StringSegment.empty;
		const start = maxChars == null ? 0 : Math.max(0, end - maxChars);
		return new StringSegment(buf, start, end - start);
	}

	/**
	 * Returns a segment representing the characters **after** this one in the
	 * same buffer. Useful for consuming input without allocating.
	 *
	 * @param maxChars Maximum number of characters to include. Defaults to all
	 *   remaining characters.
	 */
	following(maxChars?: number): StringSegment {
		const buf = this.requireBuffer();
		const start = this.offset + this.length;
		const remaining = buf.length - start;
		if(remaining === 0) return StringSegment.empty;
		const len = maxChars == null ? remaining : Math.min(maxChars, remaining);
		return new StringSegment(buf, start, len);
	}

	// -------------------------------------------------------------------
	// Comparison / matching
	// -------------------------------------------------------------------

	/**
	 * `true` if this segment starts with `text`.
	 * Compares directly on the buffer — no intermediate allocation.
	 *
	 * @param text Prefix to check. Accepts a `string` or `StringSegment`.
	 * @param ignoreCase Case-insensitive comparison. Default: `false`.
	 */
	startsWith(text: string | StringSegment, ignoreCase = false): boolean {
		let needle: string, needleOff: number, needleLen: number;
		if(text instanceof StringSegment) {
			const { buffer } = text;
			if(buffer == null) return false; // noValue needle never matches
			needle    = buffer;
			needleOff = text.offset;
			needleLen = text.length;
		} else {
			needle    = text;
			needleOff = 0;
			needleLen = text.length;
		}
		if(needleLen > this.length) return false;
		if(needleLen === 0) return true;
		const buf  = this.requireBuffer();
		const base = this.offset;
		if(ignoreCase) {
			return buf
				.substring(base, base + needleLen)
				.toLowerCase() === needle.substring(needleOff, needleOff + needleLen).toLowerCase();
		}
		for(let i = 0; i < needleLen; i++) {
			if(buf.charCodeAt(base + i) !== needle.charCodeAt(needleOff + i)) return false;
		}
		return true;
	}

	/**
	 * `true` if this segment ends with `text`.
	 * Compares directly on the buffer — no intermediate allocation.
	 *
	 * @param text Suffix to check. Accepts a `string` or `StringSegment`.
	 * @param ignoreCase Case-insensitive comparison. Default: `false`.
	 */
	endsWith(text: string | StringSegment, ignoreCase = false): boolean {
		let needle: string, needleOff: number, needleLen: number;
		if(text instanceof StringSegment) {
			const { buffer } = text;
			if(buffer == null) return false; // noValue needle never matches
			needle    = buffer;
			needleOff = text.offset;
			needleLen = text.length;
		} else {
			needle    = text;
			needleOff = 0;
			needleLen = text.length;
		}
		if(needleLen > this.length) return false;
		if(needleLen === 0) return true;
		const buf    = this.requireBuffer();
		const segEnd = this.offset + this.length;
		if(ignoreCase) {
			return buf
				.substring(segEnd - needleLen, segEnd)
				.toLowerCase() === needle.substring(needleOff, needleOff + needleLen).toLowerCase();
		}
		const start = segEnd - needleLen;
		for(let i = 0; i < needleLen; i++) {
			if(buf.charCodeAt(start + i) !== needle.charCodeAt(needleOff + i)) return false;
		}
		return true;
	}

	/**
	 * `true` if this segment is equal to `other`.
	 * Compares directly on the buffer — no intermediate allocation.
	 *
	 * @param other A `string`, `StringSegment`, or `null`/`undefined`.
	 * @param ignoreCase Case-insensitive comparison. Default: `false`.
	 */
	equals(other: StringSegment | string | null | undefined, ignoreCase = false): boolean {
		if(other == null) return false;
		let otherBuf: string, otherOffset: number, otherLength: number;
		if(other instanceof StringSegment) {
			const { buffer } = other;
			if(buffer == null) return !this.hasValue; // noValue == noValue
			otherBuf    = buffer;
			otherOffset = other.offset;
			otherLength = other.length;
		} else {
			otherBuf    = other;
			otherOffset = 0;
			otherLength = other.length;
		}
		if(!this.hasValue) return false;
		if(otherLength !== this.length) return false;

		const buf  = this.requireBuffer();
		if(ignoreCase) {
			return buf
				.substring(this.offset, this.offset + this.length)
				.toLowerCase()
				=== otherBuf.substring(otherOffset, otherOffset + otherLength).toLowerCase();
		}

		const base = this.offset;
		for(let i = 0; i < this.length; i++) {
			if(buf.charCodeAt(base + i) !== otherBuf.charCodeAt(otherOffset + i)) return false;
		}
		return true;
	}

	// -------------------------------------------------------------------
	// Trimming — whitespace or a specific set of characters
	// -------------------------------------------------------------------

	/**
	 * Returns a new `StringSegment` with leading characters removed.
	 * **No string allocation.**
	 *
	 * @param chars Characters to strip. Pass a string — every character in it
	 *   is treated as a trim candidate. Defaults to whitespace (per `@tsdotnet/char`).
	 */
	trimStart(chars?: string): StringSegment {
		const buf  = this.requireBuffer();
		let   pos  = this.offset;
		const end  = this.offset + this.length;
		if(chars == null) {
			while(pos < end && isWhiteSpace(buf.charCodeAt(pos))) pos++;
		} else {
			const codes = buildCodeSet(chars);
			while(pos < end && codes.has(buf.charCodeAt(pos))) pos++;
		}
		return pos === this.offset ? this : new StringSegment(buf, pos, end - pos);
	}

	/**
	 * Returns a new `StringSegment` with trailing characters removed.
	 * **No string allocation.**
	 *
	 * @param chars Characters to strip. Defaults to whitespace.
	 */
	trimEnd(chars?: string): StringSegment {
		const buf   = this.requireBuffer();
		const start = this.offset;
		let   end   = this.offset + this.length;
		if(chars == null) {
			while(end > start && isWhiteSpace(buf.charCodeAt(end - 1))) end--;
		} else {
			const codes = buildCodeSet(chars);
			while(end > start && codes.has(buf.charCodeAt(end - 1))) end--;
		}
		return end === this.offset + this.length ? this : new StringSegment(buf, start, end - start);
	}

	/**
	 * Returns a new `StringSegment` with leading and trailing characters
	 * removed. **No string allocation.**
	 *
	 * @param chars Characters to strip. Defaults to whitespace.
	 */
	trim(chars?: string): StringSegment {
		return this.trimStart(chars).trimEnd(chars);
	}

	// -------------------------------------------------------------------
	// Splitting (lazy generator — no upfront allocation)
	// -------------------------------------------------------------------

	/**
	 * Lazily splits this segment by a separator, yielding `StringSegment`
	 * slices one at a time. **No array is allocated upfront.**
	 *
	 * @param separator A `string` or `StringSegment` separator. A char code
	 *   (`number`) is also accepted as a low-level fast path.
	 * @param options `trimEntries` trims each part; `removeEmpty` skips empty
	 *   (or all-whitespace after trimming) entries.
	 *
	 * @example
	 * for (const part of seg.split(',', { trimEntries: true })) {
	 *   console.log(part.value);
	 * }
	 */
	*split(separator: string | StringSegment | number, options?: SplitOptions): Iterable<StringSegment> {
		const trimEntries = options?.trimEntries ?? false;
		const removeEmpty = options?.removeEmpty ?? false;

		const buf     = this.requireBuffer();
		const base    = this.offset;
		const segEnd  = base + this.length;

		const isSeg   = separator instanceof StringSegment;
		const sepStr  = typeof separator === 'number' ? String.fromCharCode(separator)
			: (isSeg ? (separator as StringSegment).buffer ?? '' : separator as string);
		const sepOff  = isSeg ? (separator as StringSegment).offset : 0;
		const sepLen  = typeof separator === 'number' ? 1
			: (isSeg ? (separator as StringSegment).length : (separator as string).length);

		if(sepLen === 0 || (isSeg && !(separator as StringSegment).hasValue)) { yield this; return; }

		let segStart = base;

		const emit = (start: number, end: number): StringSegment | null => {
			let seg: StringSegment = new StringSegment(buf, start, end - start);
			if(trimEntries) seg = seg.trim();
			if(removeEmpty && seg.length === 0) return null;
			return seg;
		};

		const sepFirstCode = sepStr.charCodeAt(sepOff);

		if(sepLen === 1) {
			// Fast single-char path — no allocation
			for(let i = base; i < segEnd; i++) {
				if(buf.charCodeAt(i) === sepFirstCode) {
					const part = emit(segStart, i);
					if(part) yield part;
					segStart = i + 1;
				}
			}
		} else {
			// Multi-char path
			const firstCode = sepStr.charCodeAt(sepOff);
			const limit     = segEnd - sepLen;
			let   i         = base;
			while(i <= limit) {
				if(buf.charCodeAt(i) !== firstCode) { i++; continue; }
				let match = true;
				for(let j = 1; j < sepLen; j++) {
					if(buf.charCodeAt(i + j) !== sepStr.charCodeAt(sepOff + j)) { match = false; break; }
				}
				if(match) {
					const part = emit(segStart, i);
					if(part) yield part;
					segStart = i + sepLen;
					i        = segStart;
				} else {
					i++;
				}
			}
		}

		// Final segment
		const last = emit(segStart, segEnd);
		if(last) yield last;
	}

	/**
	 * Splits this segment and collects all parts into an array.
	 * Convenience wrapper around the lazy {@link split} generator.
	 *
	 * @param separator A `string` or `StringSegment` separator. A char code
	 *   (`number`) is also accepted as a low-level fast path.
	 * @param options `trimEntries` / `removeEmpty` — same as {@link split}.
	 */
	splitToArray(separator: string | StringSegment | number, options?: SplitOptions): StringSegment[] {
		return [...this.split(separator, options)];
	}

	// -------------------------------------------------------------------
	// Static helpers
	// -------------------------------------------------------------------

	/**
	 * Compares two segments (or strings) as a sort comparator.
	 * Returns a negative, zero, or positive number.
	 */
	static compare(
		a: StringSegment | string | null | undefined,
		b: StringSegment | string | null | undefined,
		ignoreCase = false
	): number {
		if(a == b) return 0;
		if(a == null) return -1;
		if(b == null) return  1;

		// noValue segments sort before all valued segments
		let aStr: string, aOff: number, aLen: number;
		if(a instanceof StringSegment) {
			const { buffer } = a;
			if(buffer == null) return (b instanceof StringSegment && !b.hasValue) ? 0 : -1;
			aStr = buffer;
			aOff = a.offset;
			aLen = a.length;
		} else {
			aStr = a;
			aOff = 0;
			aLen = a.length;
		}

		let bStr: string, bOff: number, bLen: number;
		if(b instanceof StringSegment) {
			const { buffer } = b;
			if(buffer == null) return 1; // b noValue, a has value → a > b
			bStr = buffer;
			bOff = b.offset;
			bLen = b.length;
		} else {
			bStr = b;
			bOff = 0;
			bLen = b.length;
		}

		if(ignoreCase) {
			const aVal = aStr.substring(aOff, aOff + aLen).toLowerCase();
			const bVal = bStr.substring(bOff, bOff + bLen).toLowerCase();
			if(aVal < bVal) return -1;
			if(aVal > bVal) return  1;
			return aLen - bLen;
		}

		const minLen = Math.min(aLen, bLen);
		for(let i = 0; i < minLen; i++) {
			const diff = aStr.charCodeAt(aOff + i) - bStr.charCodeAt(bOff + i);
			if(diff !== 0) return diff;
		}
		return aLen - bLen;
	}

	/**
	 * `true` if `segment` is empty (or has no value).
	 */
	static isNullOrEmpty(segment: StringSegment | null | undefined): boolean {
		return segment == null || !segment.hasValue || segment.length === 0;
	}

	/**
	 * `true` if `segment` is empty or contains only whitespace.
	 */
	static isNullOrWhiteSpace(segment: StringSegment | null | undefined): boolean {
		return segment == null || !segment.hasValue || segment.isWhitespace;
	}

	// -------------------------------------------------------------------
	// Iterable over characters
	// -------------------------------------------------------------------

	/**
	 * Iterates over individual characters in the segment.
	 * Each yielded value is a single-character string.
	 */
	[Symbol.iterator](): Iterator<string> {
		const buf  = this.requireBuffer();
		const base = this.offset;
		const end  = base + this.length;
		let   i    = base;
		return {
			next(): IteratorResult<string> {
				if(i < end) return { value: buf[i++]!, done: false };
				return { value: EMPTY_STRING, done: true };
			}
		};
	}

	// -------------------------------------------------------------------
	// Object overrides
	// -------------------------------------------------------------------

	/** Materializes and returns the substring represented by this segment. */
	toString(): string { return this.value; }

	// -------------------------------------------------------------------
	// Static factory
	// -------------------------------------------------------------------

	/**
	 * Wraps a string as a `StringSegment`.
	 * Returns {@link StringSegment.noValue} for `null`/`undefined`,
	 * {@link StringSegment.empty} for `""`.
	 */
	static from(value: string | null | undefined): StringSegment {
		if(value == null) return StringSegment.noValue;
		if(value.length === 0) return StringSegment.empty;
		return new StringSegment(value);
	}
}

// ---------------------------------------------------------------------------
// Module-private helpers
// ---------------------------------------------------------------------------

/** Builds a char-code Set from a string of candidate characters. */
function buildCodeSet(chars: string): Set<number> {
	const set = new Set<number>();
	for(let i = 0; i < chars.length; i++) set.add(chars.charCodeAt(i));
	return set;
}

export default StringSegment;

// ---------------------------------------------------------------------------
// Top-level convenience functions
// ---------------------------------------------------------------------------

/**
 * Lazily splits a plain string by a separator, yielding `StringSegment` slices.
 * Shorthand for `new StringSegment(buffer).split(separator, options)`.
 *
 * @example
 * import { split } from '@tsdotnet/string-segment';
 * for (const part of split('a,b,c', ',')) {
 *   console.log(part.value);
 * }
 */
export function split(
	buffer: string,
	separator: string | StringSegment | number,
	options?: SplitOptions
): Iterable<StringSegment> {
	return new StringSegment(buffer).split(separator, options);
}

/**
 * Splits a plain string by a separator and collects the parts into an array.
 * Shorthand for `new StringSegment(buffer).splitToArray(separator, options)`.
 *
 * @example
 * import { splitToArray } from '@tsdotnet/string-segment';
 * const parts = splitToArray('a,b,c', ',');
 */
export function splitToArray(
	buffer: string,
	separator: string | StringSegment | number,
	options?: SplitOptions
): StringSegment[] {
	return new StringSegment(buffer).splitToArray(separator, options);
}
