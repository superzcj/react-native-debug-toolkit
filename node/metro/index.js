'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { initializeState, statePath } = require('./activation');

const activationModule = fs.realpathSync(path.join(__dirname, '../../src/utils/hubActivation.ts'));

function isActivationImport(context, moduleName) {
  if (moduleName !== './defaultHubActivation' || !context.originModulePath) { return false; }
  try { return fs.realpathSync(context.originModulePath) === activationModule; }
  catch { return false; }
}

function withDebugToolkitMetro(config, options = {}) {
  const root = options.projectRoot || config.projectRoot;
  if (typeof root !== 'string' || !root) { throw new TypeError('withDebugToolkitMetro requires a projectRoot'); }
  const projectRoot = path.resolve(root);
  initializeState(projectRoot);
  const resolver = config.resolver || {};
  const previous = resolver.resolveRequest;
  return {
    ...config,
    resolver: {
      ...resolver,
      resolveRequest(context, moduleName, platform) {
        if (isActivationImport(context, moduleName)) { return { type: 'sourceFile', filePath: statePath(projectRoot) }; }
        return previous ? previous(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
      },
    },
  };
}

module.exports = { withDebugToolkitMetro };
