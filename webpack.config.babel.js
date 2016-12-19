var path = require('path');

module.exports = {
  output: {
    publicPath: '/',
    libraryTarget: 'commonjs2',
  },
  resolve: {
    extensions: ['', '.js', '.jsx'],
    modules: [
      'client',
      'node_modules',
    ],
  },
  module: {
    loaders: [
       {
        test: /\.jsx*$/,
        exclude: [/node_modules/, /.+\.config.js/],
        loader: 'babel',
      }
    ],
  }
};
