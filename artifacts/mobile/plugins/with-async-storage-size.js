/**
 * Inline Expo config plugin that bumps the maximum AsyncStorage database
 * size on Android. The default for @react-native-async-storage/async-storage
 * is only 6 MB total — once the underlying SQLite file exceeds that, every
 * write fails with `SQLITE_FULL` (code 13). With heavy Anki imports we
 * easily blow past 6 MB across all flashcard rows combined, so we raise the
 * cap to a comfortable 256 MB by appending the documented Gradle property
 * `AsyncStorage_db_size_in_MB`.
 *
 * iOS doesn't have this limit (it stores AsyncStorage as plain files), so
 * the plugin is Android-only.
 *
 * Reference: https://react-native-async-storage.github.io/async-storage/docs/advanced/db_size/
 */
const { withGradleProperties } = require("@expo/config-plugins");

const PROP_KEY = "AsyncStorage_db_size_in_MB";
const PROP_VALUE = "256";

const withAsyncStorageSize = (config) => {
  return withGradleProperties(config, (cfg) => {
    const items = cfg.modResults;
    // Strip any existing entry so we always control the value.
    const filtered = items.filter(
      (item) => !(item.type === "property" && item.key === PROP_KEY),
    );
    filtered.push({
      type: "property",
      key: PROP_KEY,
      value: PROP_VALUE,
    });
    cfg.modResults = filtered;
    return cfg;
  });
};

module.exports = withAsyncStorageSize;
