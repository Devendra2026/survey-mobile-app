const path = require("path");
const { getDefaultConfig } = require("@expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const expoConfig = getDefaultConfig(projectRoot);
const expoTransformer = expoConfig.transformer ?? {};

const config = withNativeWind(expoConfig, { input: "./global.css" });

// NativeWind's wrap drops Expo's marker; EAS CLI uses it to detect a valid Metro setup.
config.transformer = {
  ...config.transformer,
  ...("_expoRelativeProjectRoot" in expoTransformer
    ? { _expoRelativeProjectRoot: expoTransformer._expoRelativeProjectRoot }
    : {}),
};

// convex package exports only define "import" and "require", not "react-native".
config.resolver.unstable_conditionsByPlatform = {
  ios: ["react-native", "import", "require", "default"],
  android: ["react-native", "import", "require", "default"],
  web: ["browser", "import", "require", "default"],
};

// Resolve from project-root node_modules (avoids pnpm symlink / Windows Modal path failures).
config.resolver.unstable_enableSymlinks = true;
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];
config.watchFolders = [path.resolve(projectRoot, "node_modules")];

module.exports = config;
