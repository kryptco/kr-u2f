'use strict';

const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: {
    'babel_polyfill.js': 'babel-polyfill',
    'popup.js': ['babel-polyfill', './src/popup.ts'],
    'inject.js': './src/inject.ts',
    'content_script.js': './src/content_script.ts',
    'background.js': './src/background.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'js/[name]',
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
