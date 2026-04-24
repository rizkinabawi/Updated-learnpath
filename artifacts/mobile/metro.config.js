const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Stub Node.js built-in modules that sql.js tries to require (it wraps them in
// try/catch, but Metro's strict `node:` resolution rejects them before the
// catch can run). We point them at an empty shim so the bundle succeeds.
const emptyShim = path.resolve(__dirname, "utils/empty-shim.js");
const NODE_BUILTINS = ["fs", "path", "crypto", "stream", "os", "child_process"];

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Match both bare specifiers ("fs") and prefixed ones ("node:fs").
  const stripped = moduleName.startsWith("node:") ? moduleName.slice(5) : moduleName;
  if (NODE_BUILTINS.includes(stripped)) {
    return { type: "sourceFile", filePath: emptyShim };
  }
  if (typeof originalResolveRequest === "function") {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
