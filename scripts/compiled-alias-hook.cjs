const Module = require("node:module");
const path = require("node:path");
const original = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    request = path.join(process.cwd(), ".tmp-phase7", request.slice(2));
  }
  return original.call(this, request, parent, isMain, options);
};
