// EAS CLI 27.4.1 handles --freeze-credentials for iOS. Its Android provider
// can still create a missing keystore, so fail closed at that creation call.
const { CreateKeystore } = require(
  '../preview-eas-cli/node_modules/eas-cli/build/credentials/android/actions/CreateKeystore.js',
);

if (typeof CreateKeystore?.prototype.runAsync !== 'function') {
  throw new Error('Cannot verify the pinned EAS Android credential guard.');
}

CreateKeystore.prototype.runAsync = async function rejectKeystoreCreation() {
  throw new Error('Configure Android preview signing in EAS before requesting a build.');
};
