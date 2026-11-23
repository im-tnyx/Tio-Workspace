import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const projectId = '884f8cb2-e182-4d24-b1d7-ddec8f7f044d';

export function verifyEasPreview({ app, eas, platform, manifest, lock }) {
  assert(['android', 'ios', 'all'].includes(platform), 'Unsupported EAS preview platform');
  assert.equal(app.owner, 'tnyx-23', 'Unexpected Expo owner');
  assert.equal(app.slug, 'tnyx', 'Unexpected Expo slug');
  assert.equal(app.extra?.eas?.projectId, projectId, 'Unexpected EAS project');
  assert.equal(app.updates?.url, 'https://u.expo.dev/' + projectId, 'Unexpected update URL');
  assert.equal(app.runtimeVersion?.policy, 'fingerprint', 'Unexpected runtime policy');

  assert.deepEqual(Object.keys(eas.build ?? {}), ['preview'], 'Expected only the preview build profile');
  const profile = eas.build.preview;
  assert.equal(profile.distribution, 'internal', 'Expected internal distribution');
  assert.equal(profile.channel, 'pr-preview', 'Unexpected preview channel');
  assert([undefined, 'preview'].includes(profile.environment), 'Expected preview EAS environment');
  assert.equal(profile.android?.buildType, 'apk', 'Expected an Android preview APK');
  for (const config of [profile, profile.android, profile.ios]) {
    assert([undefined, 'remote'].includes(config?.credentialsSource), 'Expected preconfigured remote signing');
    assert(!config?.extends && !config?.withoutCredentials, 'Unexpected preview signing configuration');
  }
  if (platform !== 'ios') assert.equal(app.android?.package, 'com.tnyx.tio', 'Unexpected Android identifier');
  if (platform !== 'android') assert.equal(app.ios?.bundleIdentifier, 'com.tnyx.tio', 'Unexpected iOS identifier');

  const easCliVersion = '27.4.1';
  assert.equal(manifest.dependencies?.['eas-cli'], easCliVersion, 'Unpinned EAS CLI manifest');
  assert.equal(lock.packages?.['']?.dependencies?.['eas-cli'], easCliVersion, 'Unpinned EAS CLI lock');
  assert.equal(lock.packages?.['node_modules/eas-cli']?.version, easCliVersion, 'Incorrect EAS CLI version');
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path) continue;
    assert(entry.resolved?.startsWith('https://registry.npmjs.org/') &&
      entry.integrity?.startsWith('sha512-'), 'Unverified EAS CLI dependency: ' + path);
  }
}

if (process.argv[1] === import.meta.filename) {
  const read = (name) => JSON.parse(readFileSync(name, 'utf8'));
  verifyEasPreview({
    app: read('app.json').expo,
    eas: read('eas.json'),
    platform: process.env.PREVIEW_PLATFORM,
    manifest: read('.github/preview-eas-cli/package.json'),
    lock: read('.github/preview-eas-cli/package-lock.json'),
  });
}
