import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

export function verifyOtaBundle(directory, platform) {
  assert(['android', 'ios', 'all'].includes(platform), 'Unsupported OTA platform');
  assert(lstatSync(directory).isDirectory(), 'Expected an OTA bundle directory');
  const root = realpathSync(directory);
  function verifyFile(relativePath) {
    const expected = join(root, relativePath);
    assert(lstatSync(expected).isFile() && realpathSync(expected) === expected,
      'OTA metadata references a non-regular file or leaves the bundle');
    return expected;
  }

  // EAS resolves these paths on the credential-bearing runner before upload.
  // Accept only the SDK's bundle/asset layout, and no optional asset log map.
  assert(!existsSync(join(root, 'assetmap.json')), 'Unexpected OTA asset log map');
  const metadata = JSON.parse(readFileSync(verifyFile('metadata.json'), 'utf8'));
  assert(metadata.version === 0 && metadata.bundler === 'metro', 'Invalid Expo export metadata');
  const expectedPlatforms = platform === 'all' ? ['android', 'ios'] : [platform];
  assert.deepEqual(Object.keys(metadata.fileMetadata).sort(), expectedPlatforms, 'Unexpected OTA platform metadata');

  for (const target of expectedPlatforms) {
    const { bundle, assets } = metadata.fileMetadata[target];
    const bundlePattern = new RegExp('^_expo/static/js/' + target + '/entry-[a-f0-9]+\\.(?:hbc|js)$');
    assert(typeof bundle === 'string' && bundlePattern.test(bundle), 'Unexpected OTA bundle path');
    verifyFile(bundle);
    assert(Array.isArray(assets), 'Invalid OTA asset metadata');
    for (const asset of assets) {
      assert(typeof asset.path === 'string' && /^assets\/[a-f0-9]+$/.test(asset.path),
        'Unexpected OTA asset path');
      assert(typeof asset.ext === 'string' && /^[a-z0-9]+$/i.test(asset.ext), 'Unexpected OTA asset extension');
      verifyFile(asset.path);
    }
  }
}

if (process.argv[1] === import.meta.filename) {
  verifyOtaBundle(process.argv[2], process.env.PREVIEW_PLATFORM);
}
