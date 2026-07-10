const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const vendoredConvexGenerated = path.resolve(projectRoot, "src", "convex", "_generated");
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

// Bundle vendored src/convex/_generated even when tsconfig points types at the monorepo.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("@/convex/_generated/")) {
    const subpath = moduleName.slice("@/convex/_generated/".length);
    const vendoredModule = path.join(vendoredConvexGenerated, subpath);
    if (defaultResolveRequest) {
      return defaultResolveRequest(context, vendoredModule, platform);
    }
    return context.resolveRequest(context, vendoredModule, platform);
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
