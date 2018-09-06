'use strict';

const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: {
    'chromium/js/babel_polyfill.js': 'babel-polyfill',
    'chromium/js/popup.js': ['babel-polyfill', './src/popup.ts'],
    'chromium/js/inject_webauthn.js': './src/inject_webauthn_chromium.ts',
    'chromium/js/content_script.js': './src/content_script_chromium.ts',
    'chromium/js/background.js': './src/background.ts',

    'edge/KryptonAuthenticator/edgeextension/manifest/Extension/js/babel_polyfill.js': 'babel-polyfill',
    'edge/KryptonAuthenticator/edgeextension/manifest/Extension/js/popup.js': ['babel-polyfill', './src/popup.ts'],
    'edge/KryptonAuthenticator/edgeextension/manifest/Extension/js/inject.js': ['babel-polyfill', './src/inject_edge.ts'],
    'edge/KryptonAuthenticator/edgeextension/manifest/Extension/js/content_script.js': ['babel-polyfill', './src/content_script_edge.ts'],
    'edge/KryptonAuthenticator/edgeextension/manifest/Extension/js/background.js': ['reflect-metadata', './src/background.ts'],

    'firefox/js/babel_polyfill.js': 'babel-polyfill',
    'firefox/js/popup.js': ['babel-polyfill', './src/popup.ts'],
    'firefox/js/content_script.js': './src/content_script_firefox.ts',
    'firefox/js/background.js': './src/background.ts',

    'KryptonAuthenticator.safariextension/js/babel_polyfill.js': 'babel-polyfill',
    'KryptonAuthenticator.safariextension/js/popup.js': ['babel-polyfill', './src/popup_safari.ts'],
    'KryptonAuthenticator.safariextension/js/content_script.js': './src/content_script_safari.ts',
    'KryptonAuthenticator.safariextension/js/background.js': './src/background.ts',
    'KryptonAuthenticator.safariextension/js/inject.js': './src/inject_safari.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name]',
    // chunkFilename: 'js/[name].[chunkhash:8].chunk.js',
    publicPath: './'
  },
  resolve: {
    extensions: ['.ts', 'tsx', '.js'],
  },
  module: {
    strictExportPresence: true,
    rules: [{
      enforce: 'pre',
      test: /\.(ts|tsx)$/,
      include: path.resolve(__dirname, 'src'),
      loader: 'tslint-loader',
    }, {
      test: /\.(js|jsx|mjs)$/,
      include: path.resolve(__dirname, 'src'),
      loader: 'babel-loader',
      options: {
        compact: true,
      },
    }, {
      test: /\.(ts|tsx)$/,
      include: path.resolve(__dirname, 'src'),
      loader: 'ts-loader',
    }, {
      test: /\.js$/,
      include: /node_modules/,
      loader: 'strip-sourcemap-loader',
    }],
  },
  plugins: [
    new webpack.ProvidePlugin({
      $: "jquery",
      jQuery: "jquery"
    }),
  ],
}
