const path = require('path');

module.exports = {
  mode: 'production',
  entry: './lib/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'socket-events.min.js',
    library: 'SocketEvents',
    libraryTarget: 'umd',
  },
  externals: {
    'react': 'react',
    'socket.io-client': 'socket.io-client'
  },
  resolve: {
    extensions: ['.js', '.ts'],
  },
}; 