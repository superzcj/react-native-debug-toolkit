/**
 * Canonical payload hashing shared with the Hub protocol.  This deliberately
 * avoids Node's crypto/Buffer APIs so it can run in a React Native bundle.
 */

type NormalizedValue = null | boolean | number | string | NormalizedValue[] | {
  [key: string]: NormalizedValue;
};

function toBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!;
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    output += alphabet[a >> 2]!;
    output += alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    output += b === undefined ? '=' : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    output += c === undefined ? '=' : alphabet[c & 63]!;
  }
  return output;
}

function binaryValue(value: ArrayBuffer | ArrayBufferView): NormalizedValue {
  const bytes = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return {
    $type: 'binary',
    encoding: 'base64',
    bytes: bytes.length,
    value: toBase64(bytes.slice(0, 768)),
  };
}

/** Normalises values before JCS serialization.  `ancestors` is a stack, not a
 * global seen set: reusing the same object twice is not a circular reference. */
export function normalizeHubValue(
  value: unknown,
  ancestors = new Map<object, string>(),
  path = '',
): NormalizedValue {
  if (value === undefined) return { $type: 'undefined' };
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'function') return { $type: 'function', name: value.name || '' };
  if (typeof value === 'symbol') return { $type: 'symbol', name: value.description || '' };
  if (typeof value === 'bigint') return { $type: 'bigint', value: value.toString() };
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { $type: 'number', value: 'NaN' };
    if (value === Infinity) return { $type: 'number', value: 'Infinity' };
    if (value === -Infinity) return { $type: 'number', value: '-Infinity' };
    return value;
  }

  if (value instanceof Date) {
    return {
      $type: 'date',
      value: Number.isNaN(value.getTime()) ? null : value.toISOString(),
    };
  }

  if (typeof value !== 'object') return String(value);
  const objectValue = value as object;
  const previousPath = ancestors.get(objectValue);
  if (previousPath !== undefined) return { $type: 'circular', path: previousPath };

  const maybeArrayBuffer = globalThis.ArrayBuffer;
  if (maybeArrayBuffer && (objectValue instanceof maybeArrayBuffer || maybeArrayBuffer.isView(objectValue))) {
    return binaryValue(objectValue as ArrayBuffer | ArrayBufferView);
  }

  ancestors.set(objectValue, path);
  try {
    if (Array.isArray(value)) {
      return value.map((item, index) => normalizeHubValue(item, ancestors, `${path}/${index}`));
    }

    const result: { [key: string]: NormalizedValue } = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      try {
        result[key] = normalizeHubValue((value as Record<string, unknown>)[key], ancestors, `${path}/${key}`);
      } catch (error) {
        result[key] = { $type: 'property-error', name: error instanceof Error ? error.name : 'Error' };
      }
    }
    return result;
  } finally {
    ancestors.delete(objectValue);
  }
}

export function jcsStringify(value: NormalizedValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Object.is(value, -0) ? '0' : JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcsStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcsStringify(value[key]!)}`).join(',')}}`;
}

function utf8Bytes(value: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index++) {
    let codePoint = value.charCodeAt(index);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && index + 1 < value.length) {
      const low = value.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + low - 0xdc00;
        index++;
      }
    }
    if (codePoint <= 0x7f) bytes.push(codePoint);
    else if (codePoint <= 0x7ff) bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    else if (codePoint <= 0xffff) bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    else bytes.push(0xf0 | (codePoint >> 18), 0x80 | ((codePoint >> 12) & 0x3f), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
  }
  return new Uint8Array(bytes);
}

function sha256(value: string): string {
  const bytes = Array.from(utf8Bytes(value));
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  for (const number of [high, low]) {
    bytes.push((number >>> 24) & 255, (number >>> 16) & 255, (number >>> 8) & 255, number & 255);
  }

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const rotateRight = (number: number, amount: number) => (number >>> amount) | (number << (32 - amount));

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Array<number>(64);
    for (let index = 0; index < 16; index++) {
      const start = offset + index * 4;
      words[index] = ((bytes[start]! << 24) | (bytes[start + 1]! << 16) | (bytes[start + 2]! << 8) | bytes[start + 3]!) >>> 0;
    }
    for (let index = 16; index < 64; index++) {
      const a = words[index - 15]!;
      const b = words[index - 2]!;
      const s0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3);
      const s1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10);
      words[index] = (words[index - 16]! + s0 + words[index - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index++) {
      const s1 = rotateRight(e!, 6) ^ rotateRight(e!, 11) ^ rotateRight(e!, 25);
      const choose = (e! & f!) ^ (~e! & g!);
      const temp1 = (h! + s1 + choose + constants[index]! + words[index]!) >>> 0;
      const s0 = rotateRight(a!, 2) ^ rotateRight(a!, 13) ^ rotateRight(a!, 22);
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const temp2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d! + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0]! + a!) >>> 0;
    hash[1] = (hash[1]! + b!) >>> 0;
    hash[2] = (hash[2]! + c!) >>> 0;
    hash[3] = (hash[3]! + d!) >>> 0;
    hash[4] = (hash[4]! + e!) >>> 0;
    hash[5] = (hash[5]! + f!) >>> 0;
    hash[6] = (hash[6]! + g!) >>> 0;
    hash[7] = (hash[7]! + h!) >>> 0;
  }

  return hash.map(number => number.toString(16).padStart(8, '0')).join('');
}

export interface HubPayloadHashInput {
  sessionId: string;
  sequence: number;
  timestamp: number;
  type: string;
  severity: string;
  data: unknown;
}

export function computeHubPayloadHash(event: HubPayloadHashInput): string {
  return sha256(jcsStringify({
    sessionId: event.sessionId,
    sequence: event.sequence,
    timestamp: event.timestamp,
    type: event.type,
    severity: event.severity,
    data: normalizeHubValue(event.data),
  }));
}
