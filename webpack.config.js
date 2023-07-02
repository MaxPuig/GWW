const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: './app.js',
  mode: 'production', // or 'development'
  target: 'web',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      name: 'gww',
      type: 'umd',
    },
  },
  resolve: {
    alias: {
      'crypto': require.resolve('crypto-browserify'),
      'stream': require.resolve('stream-browserify'),
      'buffer': require.resolve('buffer/'),
    }
  },
  plugins: [
    new webpack.EnvironmentPlugin({
      NODE_DEBUG: false,
    }),
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    }),
  ]
};
