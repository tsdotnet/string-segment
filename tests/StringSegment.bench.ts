/**
 * Benchmarks: StringSegment vs. native string operations
 *
 * Key insight: StringSegment defers string materialization.
 * Operations like split, subsegment, trim, indexOf, startsWith, equals,
 * all work directly on the original buffer — no new string allocation.
 * Only .value or .toString() actually calls string.substring().
 *
 * Three scenarios demonstrate where this matters:
 *
 *  1. "Sparse CSV parsing"   — split a 20-column row, read only 2 columns.
 *     Native .split() allocates all 20 parts upfront even if most are unused.
 *     StringSegment.split() creates offset+length descriptors; only the accessed
 *     columns ever call .substring().
 *
 *  2. "HTTP header parsing" — split "Key: Value\r\n" lines, trim both sides,
 *     then look up a target key by comparison.
 *     Native: each split + trim allocates a new string even for headers we skip.
 *     StringSegment: trim and equals() work on the buffer; allocation happens
 *     only for the headers we actually return.
 *
 *  3. "Chained subsegment" — extract a slice of a slice of a slice.
 *     Native: each .substring() call returns a brand-new string.
 *     StringSegment: each .subsegment() just adjusts two integers.
 */

import { bench, describe } from 'vitest';
import StringSegment from '../src/StringSegment.js';

const COMMA = ','.charCodeAt(0);
const CRLF  = '\r\n';

// ---------------------------------------------------------------------------
// Test data generators
// ---------------------------------------------------------------------------

/** Build a CSV row with `cols` columns of varying lengths. */
function makeCsvRow(cols: number): string {
	return Array.from({ length: cols }, (_, i) => `column${i}_value_${i * 13}`).join(',');
}

/** Build realistic HTTP headers blob. */
function makeHeaders(count: number): string {
	const names = [
		'Content-Type', 'Content-Length', 'Authorization', 'Accept',
		'Cache-Control', 'X-Request-Id', 'User-Agent', 'Accept-Encoding',
		'Connection', 'Host', 'X-Forwarded-For', 'X-Real-IP',
	];
	const values = [
		'application/json', '1024', 'Bearer some.jwt.token.here', '*/*',
		'no-cache', 'req-abc-12345', 'Mozilla/5.0 (vitest)', 'gzip, deflate',
		'keep-alive', 'example.com', '192.168.1.1', '10.0.0.1',
	];
	return Array.from({ length: count }, (_, i) => {
		const n = i % names.length;
		return `  ${names[n]!}  :  ${values[n]!}  `;
	}).join('\r\n');
}

// Pre-build test data once so construction is not part of the timed sections
const CSV_ROW_20  = makeCsvRow(20);
const CSV_ROW_100 = makeCsvRow(100);
const HEADERS_BLOB_20  = makeHeaders(20);
const HEADERS_LINES_20 = HEADERS_BLOB_20.split('\r\n');
const HEADERS_BLOB_80  = makeHeaders(80);
const HEADERS_LINES_80 = HEADERS_BLOB_80.split('\r\n');
const DEEP_STRING  = 'AAAA_BBBB_CCCC_DDDD_target_EEEE_FFFF';
const COLON_CODE   = ':'.charCodeAt(0);

// ---------------------------------------------------------------------------
// Scenario 1: Sparse CSV — split 20-col row, read only columns 0 and 2
// ---------------------------------------------------------------------------

describe('Sparse CSV access (20 cols, read 2)', () => {
	bench('native  — split all, index into array', () => {
		const parts = CSV_ROW_20.split(',');
		// Force reads to prevent dead-code elimination
		const a = parts[0]!.trim();
		const b = parts[2]!.trim();
		if(a === b) throw new Error('unexpected');
	});

	bench('segment — lazy split, materialize only cols 0 and 2', () => {
		const seg = StringSegment.from(CSV_ROW_20);
		let a = '', b = '', i = 0;
		for(const part of seg.split(COMMA)) {
			if(i === 0) a = part.trim().value;
			else if(i === 2) { b = part.trim().value; break; }
			i++;
		}
		if(a === b) throw new Error('unexpected');
	});
});

// ---------------------------------------------------------------------------
// Scenario 2: Sparse CSV — split 100-col row, read only columns 0 and 4
// ---------------------------------------------------------------------------

describe('Sparse CSV access (100 cols, read 2)', () => {
	bench('native  — split all, index into array', () => {
		const parts = CSV_ROW_100.split(',');
		const a = parts[0]!.trim();
		const b = parts[4]!.trim();
		if(a === b) throw new Error('unexpected');
	});

	bench('segment — lazy split, materialize only cols 0 and 4', () => {
		const seg = StringSegment.from(CSV_ROW_100);
		let a = '', b = '', i = 0;
		for(const part of seg.split(COMMA)) {
			if(i === 0) a = part.trim().value;
			else if(i === 4) { b = part.trim().value; break; }
			i++;
		}
		if(a === b) throw new Error('unexpected');
	});
});

// ---------------------------------------------------------------------------
// Scenario 3: HTTP header lookup — find 'Content-Length' in 20 headers
// ---------------------------------------------------------------------------

describe('HTTP header lookup (20 headers, find 1)', () => {
	const TARGET = 'Content-Length';

	bench('native  — split lines, split colon, trim, compare', () => {
		let found = '';
		for(const line of HEADERS_LINES_20) {
			const colon = line.indexOf(':');
			if(colon === -1) continue;
			const key = line.substring(0, colon).trim();
			if(key === TARGET) {
				found = line.substring(colon + 1).trim();
				break;
			}
		}
		if(!found) throw new Error('not found');
	});

	bench('segment — subsegment, trim, equals without materializing key', () => {
		let found = '';
		for(const line of HEADERS_LINES_20) {
			const seg   = StringSegment.from(line);
			const colon = seg.indexOf(COLON_CODE);
			if(colon === -1) continue;
			const key   = seg.subsegment(0, colon).trim();
			// equals() compares on the buffer — no .substring() allocation
			if(key.equals(TARGET)) {
				found = seg.subsegment(colon + 1).trim().value;
				break;
			}
		}
		if(!found) throw new Error('not found');
	});
});

// ---------------------------------------------------------------------------
// Scenario 4: HTTP header lookup — find 'Content-Length' in 80 headers
// ---------------------------------------------------------------------------

describe('HTTP header lookup (80 headers, find 1)', () => {
	const TARGET = 'Content-Length';

	bench('native  — split lines, split colon, trim, compare', () => {
		let found = '';
		for(const line of HEADERS_LINES_80) {
			const colon = line.indexOf(':');
			if(colon === -1) continue;
			const key = line.substring(0, colon).trim();
			if(key === TARGET) {
				found = line.substring(colon + 1).trim();
				break;
			}
		}
		if(!found) throw new Error('not found');
	});

	bench('segment — subsegment, trim, equals without materializing key', () => {
		let found = '';
		for(const line of HEADERS_LINES_80) {
			const seg   = StringSegment.from(line);
			const colon = seg.indexOf(COLON_CODE);
			if(colon === -1) continue;
			const key   = seg.subsegment(0, colon).trim();
			if(key.equals(TARGET)) {
				found = seg.subsegment(colon + 1).trim().value;
				break;
			}
		}
		if(!found) throw new Error('not found');
	});
});

// ---------------------------------------------------------------------------
// Scenario 5: Chained subsegments (deep slicing without allocation)
// ---------------------------------------------------------------------------

describe('Chained subsegment depth-4 (no allocation until .value)', () => {
	// The target substring at known offsets in DEEP_STRING
	// 'AAAA_BBBB_CCCC_DDDD_target_EEEE_FFFF'
	//  0123456789...              ^offset 20, length 6

	bench('native  — 4x string.substring', () => {
		const s1 = DEEP_STRING.substring(5);        // 'BBBB_CCCC_DDDD_target_EEEE_FFFF'
		const s2 = s1.substring(5);                 // 'CCCC_DDDD_target_EEEE_FFFF'
		const s3 = s2.substring(5);                 // 'DDDD_target_EEEE_FFFF'
		const s4 = s3.substring(5, 11);             // 'target'
		if(s4 !== 'target') throw new Error('mismatch');
	});

	bench('segment — 4x subsegment, one .value at the end', () => {
		const s1 = StringSegment.from(DEEP_STRING).subsegment(5);   // no alloc
		const s2 = s1.subsegment(5);                               // no alloc
		const s3 = s2.subsegment(5);                               // no alloc
		const s4 = s3.subsegment(5, 6);                            // no alloc
		if(s4.value !== 'target') throw new Error('mismatch');     // alloc here
	});
});

// ---------------------------------------------------------------------------
// Scenario 6: Trim-then-compare vs. trim segment then equals
// (common in whitespace-tolerant parsers)
// ---------------------------------------------------------------------------

describe('Trim + compare (high-frequency token check)', () => {
	const PADDED_TOKENS = Array.from({ length: 1000 }, (_, i) =>
		`  ${'x'.repeat(i % 20 + 1)}  `
	);
	const TARGET = 'xxxxx'; // 5 x's — matches index 4

	bench('native  — trim allocates string, then compare', () => {
		let found = false;
		for(const t of PADDED_TOKENS) {
			if(t.trim() === TARGET) { found = true; break; }
		}
		if(!found) throw new Error('not found');
	});

	bench('segment — trim adjusts offsets, equals checks buffer directly', () => {
		let found = false;
		for(const t of PADDED_TOKENS) {
			if(StringSegment.from(t).trim().equals(TARGET)) { found = true; break; }
		}
		if(!found) throw new Error('not found');
	});
});
