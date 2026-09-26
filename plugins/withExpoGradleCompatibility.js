const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("expo/config-plugins");

const MARKER = "// Salaty Gradle compatibility guard";

function withExpoGradleCompatibility(config) {
  return withDangerousMod(config, ["android", async (modConfig) => {
    const projectRoot = modConfig.modRequest.projectRoot;
    const pluginPath = path.join(
      projectRoot,
      "node_modules",
      "expo-modules-core",
      "android",
      "ExpoModulesCorePlugin.gradle"
    );

    if (!fs.existsSync(pluginPath)) {
      return modConfig;
    }

    const source = fs.readFileSync(pluginPath, "utf8");
    if (source.includes(MARKER)) {
      return modConfig;
    }

    const original = `        release(MavenPublication) {
          from components.release
        }`;
    const replacement = `        ${MARKER}
        def releaseComponent = components.findByName("release")
        if (releaseComponent != null) {
          release(MavenPublication) {
            from releaseComponent
          }
        }`;

    if (!source.includes(original)) {
      throw new Error(
        "Expected expo-modules-core publishing block was not found; refusing to patch an unknown version."
      );
    }

    fs.writeFileSync(pluginPath, source.replace(original, replacement));
    return modConfig;
  }]);
}

module.exports = withExpoGradleCompatibility;
