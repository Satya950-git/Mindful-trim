const { withAndroidManifest } = require('@expo/config-plugins');

const PERMISSIONS_TO_REMOVE = [
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
];

module.exports = function withNoUnnecessaryPermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest.$) manifest.$ = {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    if (!Array.isArray(manifest['uses-permission'])) {
      manifest['uses-permission'] = [];
    }

    manifest['uses-permission'] = manifest['uses-permission'].filter(
      (perm) => !PERMISSIONS_TO_REMOVE.includes(perm.$?.['android:name'])
    );

    for (const permission of PERMISSIONS_TO_REMOVE) {
      manifest['uses-permission'].push({
        $: {
          'android:name': permission,
          'tools:node': 'remove',
        },
      });
    }

    return config;
  });
};
