// Magic to include node_modules of root WebODM's directory
const fs = require('fs');
let webodmRoot = "../../../"; // Assuming plugins/<name>/public
if (!fs.existsSync(webodmRoot + "webodm.sh")) webodmRoot = "../../../../../"; // Assuming app/media/plugins/<name>/public
process.env.NODE_PATH = webodmRoot + "node_modules";
require("module").Module._initPaths();

let path = require("path");
let ExtractTextPlugin = require('extract-text-webpack-plugin');

module.exports = {
  mode: 'production',
  context: __dirname,

  entry: {"ImportView": ["./ImportView.jsx"], "TaskView": ["./TaskView.jsx"]},

  output: {
      path: path.join(__dirname, './build'),
      filename: "[name].js",
      libraryTarget: "amd"
  },

  plugins: [
    new ExtractTextPlugin('[name].css', {
        allChunks: true
    })
  ],

  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /(node_modules|bower_components)/,
        use: [
          {
            loader: 'babel-loader',
            query: {
              plugins: [
                 '@babel/syntax-class-properties',
                 '@babel/proposal-class-properties'
              ],
              presets: [
                '@babel/preset-env',
                '@babel/preset-react'
              ]
            }
          }
        ],
      },
      {
        test: /\.s?css$/,
        use: ExtractTextPlugin.extract({
          use: [
            { loader: 'css-loader' },
            {
                loader: 'sass-loader',
                options: {
                    implementation: require("sass")
                }
            }
          ]
        })
      },
      {
        test: /\.(png|jpg|jpeg|svg)/,
        loader: "url-loader?limit=100000"
      }
    ]
  },

  resolve: {
    modules: ['node_modules', 'bower_components'],
    extensions: ['.js', '.jsx'],
    alias: {
        webodm: path.resolve(__dirname, webodmRoot + 'app/static/app/js')
    }
  },

  externals: {
    // require("jquery") is external and available
    //  on the global let jQuery
    "jquery": "jQuery",
    "SystemJS": "SystemJS",
    "PluginsAPI": "PluginsAPI",
    "leaflet": "leaflet",
    "ReactDOM": "ReactDOM",
    "React": "React"
  },

  watchOptions: {
    ignored: ['node_modules', './**/*.py'],
    aggregateTimeout: 300,
    poll: 1000
  }
}