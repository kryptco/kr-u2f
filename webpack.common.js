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

    'firefox/js/babel_polyfill.js': 'babel-polyfill',
    'firefox/js/popup.js': ['babel-polyfill', './src/popup.ts'],
    'firefox/js/content_script.js': './src/content_script_firefox.ts',
    'firefox/js/background.js': './src/background.ts',
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
      oneOf: [{
          test: /\.(js|jsx|mjs)$/,
          include: path.resolve(__dirname, 'src'),
          loader: 'babel-loader',
          options: {
            compact: true,
          },
        },
        {
          test: /\.(ts|tsx)$/,
          include: path.resolve(__dirname, 'src'),
          loader: 'ts-loader',
        },        
      ],
    }, 
  ],
  },
  plugins: [
    new webpack.ProvidePlugin({
      $: "jquery",
      jQuery: "jquery"
    }),
  ],
  devtool: 'inline-source-map',
}
