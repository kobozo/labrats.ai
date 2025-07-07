const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const isDev = process.env.NODE_ENV === 'development';

module.exports = [
  // Main process config
  {
    mode: isDev ? 'development' : 'production',
    entry: './src/main/main.ts',
    target: 'electron-main',
    output: {
      path: path.resolve(__dirname, 'dist/main'),
      filename: 'main.js',
    },
    externals: {
      'node-pty': 'commonjs2 node-pty'
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    node: {
      __dirname: false,
      __filename: false,
    },
  },
  // Preload script config
  {
    mode: isDev ? 'development' : 'production',
    entry: './src/main/preload.ts',
    target: 'electron-preload',
    output: {
      path: path.resolve(__dirname, 'dist/main'),
      filename: 'preload.js',
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    node: {
      __dirname: false,
      __filename: false,
    },
  },
  // Renderer process config
  {
    mode: isDev ? 'development' : 'production',
    entry: './src/renderer/index.tsx',
    target: 'electron-renderer',
    output: {
      path: path.resolve(__dirname, 'dist/renderer'),
      filename: 'renderer.js',
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader', 'postcss-loader'],
        },
        {
          test: /\.prompt$/,
          type: 'asset/source',
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.prompt'],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/renderer/index.html',
        filename: 'index.html',
      }),
    ],
    devServer: {
      port: 3000,
      static: {
        directory: path.join(__dirname, 'dist/renderer'),
      },
    },
  },
];