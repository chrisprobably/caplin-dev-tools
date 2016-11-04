'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.webpackConfigGenerator = webpackConfigGenerator;

var _fs = require('fs');

var _path = require('path');

var _patchesStore = require('@caplin/patch-loader/patchesStore');

var _extractTextWebpackPlugin = require('extract-text-webpack-plugin');

var _extractTextWebpackPlugin2 = _interopRequireDefault(_extractTextWebpackPlugin);

var _minimist = require('minimist');

var _minimist2 = _interopRequireDefault(_minimist);

var _webpack = require('webpack');

var _webpack2 = _interopRequireDefault(_webpack);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function webpackConfigGenerator({ basePath, version = 'dev', i18nFileName = `i18n-${ version }.js` }) {
	// Do not compile `babel-polyfill`/`core-js` using babel, it's not supported and causes
	// issues in older browsers (IE11) https://github.com/zloirock/core-js/issues/189
	const babelLoaderExclude = [(0, _path.join)(basePath, 'node_modules/babel-polyfill/')];

	for (const packageDir of (0, _fs.readdirSync)((0, _path.join)(basePath, '../../packages'))) {
		try {
			(0, _fs.statSync)((0, _path.join)(basePath, `node_modules/${ packageDir }/converted_library.js`));
			babelLoaderExclude.push((0, _path.join)(basePath, `node_modules/${ packageDir }/`));
		} catch (packageShouldBeBabeledError) {
			// Ignore.
		}
	}

	const args = (0, _minimist2.default)(process.argv.slice(2));
	const {
		sourceMaps,
		variant
	} = args;
	const isBuild = process.env.npm_lifecycle_event === 'build'; // eslint-disable-line
	const isTest = process.env.npm_lifecycle_event.startsWith('test'); // eslint-disable-line

	const entryFile = variant ? `index-${ variant }.js` : 'index.js';
	const appEntryPoint = (0, _path.join)(basePath, 'src', entryFile);
	const buildOutputDir = (0, _path.join)(basePath, 'build', 'dist', 'public');
	const bundleName = `bundle-${ version }.js`;
	const i18nExtractorPlugin = new _extractTextWebpackPlugin2.default(i18nFileName, { allChunks: true });
	let i18nLoader = i18nExtractorPlugin.extract(['raw-loader', '@caplin/i18n-loader']);
	const publicPath = isBuild ? 'public/' : '/public/';
	let serviceLoader = '@caplin/service-loader';

	if (isTest) {
		i18nLoader = '@caplin/i18n-loader/inline';
		serviceLoader = '@caplin/service-loader/cache-deletion-loader';
	}

	const webpackConfig = {
		cache: true,
		entry: appEntryPoint,
		output: {
			path: buildOutputDir,
			filename: bundleName,
			publicPath
		},
		module: {
			loaders: [{
				test: /\.html$/,
				loaders: ['@caplin/html-loader']
			}, {
				test: /\.(gif|jpg|png|svg|woff|woff2)$/,
				loader: 'file-loader'
			}, {
				test: /\.js$/,
				loader: 'babel-loader?cacheDirectory',
				exclude: babelLoaderExclude
			}, {
				test: /\.js$/,
				loader: '@caplin/patch-loader'
			}, {
				test: /\.properties$/,
				loader: i18nLoader
			}, {
				test: /\.scss$/,
				loaders: ['style-loader', 'css-loader', 'sass-loader']
			}, {
				test: /\.css$/,
				loaders: ['style-loader', 'css-loader']
			}, {
				test: /\.xml$/,
				loader: 'raw-loader'
			}]
		},
		patchLoader: (0, _patchesStore.appendModulePatch)(),
		resolve: {
			alias: {
				// `alias!$aliases-data` required in `AliasRegistry`, loaded with `alias-loader`.
				'$aliases-data$': (0, _path.join)(basePath, 'src', 'config', 'aliases.js'),
				// `app-meta!$app-metadata` required in `BRAppMetaService`, loaded with `app-meta-loader`.
				'$app-metadata$': (0, _path.join)(basePath, 'src', 'config', 'metadata.js'),
				'ct-core/BRJSClassUtility$': (0, _path.join)(__dirname, 'null.js'),
				'br/dynamicRefRequire$': (0, _path.join)(__dirname, 'null.js')
			}
		},
		resolveLoader: {
			alias: {
				alias: '@caplin/alias-loader',
				'app-meta': '@caplin/app-meta-loader',
				service: serviceLoader
			}
		},
		plugins: [i18nExtractorPlugin]
	};

	if (sourceMaps) {
		webpackConfig.devtool = 'inline-source-map';
	}

	if (isBuild) {
		webpackConfig.plugins.push(new _webpack2.default.DefinePlugin({
			'process.env': {
				VERSION: JSON.stringify(version)
			}
		}));

		webpackConfig.plugins.push(new _webpack2.default.optimize.UglifyJsPlugin({
			exclude: /i18n(.*)\.js/,
			output: {
				comments: false
			},
			compress: {
				warnings: false,
				screw_ie8: true // eslint-disable-line
			}
		}));
	}

	return webpackConfig;
}