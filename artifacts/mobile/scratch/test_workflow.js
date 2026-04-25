/**
 * test_workflow.js
 *
 * Plain JS version for quick testing via node.
 */

const fs = require('fs');
const path = require('path');

// Mock ExpoCrypto because it's native
global.require = require;

const bundle = require('../utils/security/bundle');
const license = require('../utils/security/bundle-license');
const creator = require('../utils/security/creator');

async function test() {
  console.log("Starting test...");
  // ...
}
