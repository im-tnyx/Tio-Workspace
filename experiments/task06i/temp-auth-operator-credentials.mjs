import { createHash, timingSafeEqual } from 'node:crypto';

const MAX_SECRET_BYTES = 512;
const KEY_KINDS = Object.freeze({ publishable: 'sb_publishable_', secret: 'sb_secret_' });

function readMaskedLine(input, output, kind) {
  if (!input.isTTY || typeof input.setRawMode !== 'function' || input.isRaw ||
      input.readableEncoding || input.listenerCount('data') !== 0) {
    throw new Error('TEMP_AUTH_EXCLUSIVE_OPERATOR_TTY_REQUIRED');
  }
  return new Promise((resolve, reject) => {
    const bytes = Buffer.alloc(MAX_SECRET_BYTES);
    let length = 0;
    let finished = false;
    function finish(error) {
      if (finished) return;
      finished = true;
      input.removeListener('data', collect);
      input.removeListener('end', interrupted);
      input.removeListener('error', interrupted);
      input.pause();
      try {
        input.setRawMode(false);
        output.write('\n');
      } catch {
        error ??= new Error('TEMP_AUTH_OPERATOR_IO_FAILED');
      }
      if (error) {
        bytes.fill(0);
        reject(error);
      } else {
        resolve(bytes.subarray(0, length));
      }
    }
    function interrupted() { finish(new Error('TEMP_AUTH_OPERATOR_INPUT_CANCELLED')); }
    function collect(chunk) {
      if (!Buffer.isBuffer(chunk)) return interrupted();
      for (let i = 0; i < chunk.length; i++) {
        const value = chunk[i];
        if (value === 3 || value === 4 || value === 27) return interrupted();
        if (value === 13 || value === 10) {
          const crlf = value === 13 && i === chunk.length - 2 && chunk[i + 1] === 10;
          return (i === chunk.length - 1 || crlf) ? finish() : interrupted();
        }
        if (value === 8 || value === 127) {
          if (length > 0) bytes[--length] = 0;
        } else if (length < bytes.length && value >= 33 && value <= 126) {
          bytes[length++] = value;
        } else {
          return interrupted();
        }
      }
    }
    try {
      input.setRawMode(true);
      output.write(`TEMP ${kind} key (hidden): `);
      input.on('data', collect);
      input.once('end', interrupted);
      input.once('error', interrupted);
      input.resume();
    } catch {
      interrupted();
    }
  });
}

function isOpaqueKey(bytes, kind) {
  const prefix = Buffer.from(KEY_KINDS[kind]);
  if (bytes.length < prefix.length + 16 || !bytes.subarray(0, prefix.length).equals(prefix)) return false;
  return bytes.subarray(prefix.length).every(value => value === 45 || value === 95 ||
    (value >= 48 && value <= 57) || (value >= 65 && value <= 90) || (value >= 97 && value <= 122));
}

/** Verifies signed, operator-reviewed key bindings without retaining raw keys or exposing a dispatch capability. */
export async function verifyTempAuthOperatorInput(expected, input = process.stdin, output = process.stderr) {
  for (const kind of Object.keys(KEY_KINDS)) {
    const bytes = await readMaskedLine(input, output, kind);
    try {
      const actual = createHash('sha256').update(bytes).digest();
      const pinned = Buffer.from(expected[kind], 'hex');
      if (!isOpaqueKey(bytes, kind) || pinned.length !== actual.length || !timingSafeEqual(pinned, actual)) {
        throw new Error('TEMP_AUTH_OPERATOR_KEY_BINDING_MISMATCH');
      }
    } finally {
      bytes.fill(0);
    }
  }
}
