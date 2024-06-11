const webpack = require('webpack');

module.exports = function override(config, env) {
  config.resolve.fallback = {
    ...config.resolve.fallback,
    "path": require.resolve("path-browserify")
  };

  return config;
};
