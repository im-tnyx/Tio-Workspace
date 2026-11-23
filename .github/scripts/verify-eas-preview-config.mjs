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
  assert.equal(profile.android?.buildType, 'apk', 'Expected an Android preview APK');
  for (const config of [profile, profile.android, profile.ios]) {
    assert([undefined, 'remote'].includes(config?.credentialsSource), 'Expected preconfigured remote signing');
    assert(!config?.extends && !config?.withoutCredentials, 'Unexpected preview signing configuration');
  }
  for (const overrides of [profile.android, profile.ios]) {
    // EAS merges platform properties over the shared profile.
    const effective = { ...profile, ...overrides };
    assert.equal(effective.distribution, 'internal', 'Expected internal distribution');
    assert.equal(effective.channel, 'pr-preview', 'Unexpected preview channel');
    assert([undefined, 'preview'].includes(effective.environment) && !effective.developmentClient,
      'Expected the preview EAS environment and an internal preview client');
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

export function verifyPreviewChannels(channels) {
  const expectedName = 'pr-preview';
  const matches = channels.filter((channel) => channel.name === expectedName);
  assert.equal(matches.length, 1, 'Expected one EAS preview channel');
  const [preview] = matches;
  assert.equal(preview.isPaused, false, 'EAS preview channel is paused');
  const branches = preview.updateBranches.filter((branch) => branch.name === expectedName);
  assert.equal(branches.length, 1, 'Link the preview channel to the preview branch before publishing');
  const [{ id }] = branches;
  assert(typeof id === 'string' && id.length > 0, 'Missing preview branch ID');

  for (const channel of channels) {
    const mapping = JSON.parse(channel.branchMapping);
    assert.equal(mapping.version, 0, 'Unexpected EAS channel mapping version');
    assert(Array.isArray(mapping.data) && mapping.data.every((entry) => typeof entry.branchId === 'string'),
      'Invalid EAS channel routing data');
    if (channel === preview) {
      assert.deepEqual(mapping.data, [{ branchId: id, branchMappingLogic: 'true' }],
        'Expected one exclusive route from the preview channel');
    } else {
      assert(!mapping.data.some((entry) => entry.branchId === id),
        'Another EAS channel routes to the preview branch');
    }
  }
}

if (process.argv[1] === import.meta.filename) {
  const read = (name) => JSON.parse(readFileSync(name, 'utf8'));
  if (process.argv[2] === '--channels') {
    verifyPreviewChannels(read(0));
  } else {
    verifyEasPreview({
      app: read('app.json').expo,
      eas: read('eas.json'),
      platform: process.env.PREVIEW_PLATFORM,
      manifest: read('.github/preview-eas-cli/package.json'),
      lock: read('.github/preview-eas-cli/package-lock.json'),
    });
  }
}
