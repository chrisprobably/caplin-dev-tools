import {
	readdirSync,
	statSync
} from 'fs';
import {
	join
} from 'path';

import {
	appendModulePatch
} from '@caplin/patch-loader/patchesStore';
import ExtractTextPlugin from 'extract-text-webpack-plugin';
import parseArgs from 'minimist';
import webpack from 'webpack';

export function webpackConfigGenerator({basePath, version = 'dev', i18nFileName = `i18n-${version}.js`}) {
	// Do not compile `babel-polyfill`/`core-js` using babel, it's not supported and causes
	// issues in older browsers (IE11) https://github.com/zloirock/core-js/issues/189
	const babelLoaderExclude = [join(basePath, 'node_modules/babel-polyfill/')];

	for (const packageDir of readdirSync(join(basePath, '../../packages'))) {
		try {
			statSync(join(basePath, `node_modules/${packageDir}/converted_library.js`));
			babelLoaderExclude.push(join(basePath, `node_modules/${packageDir}/`));
		} catch (packageShouldBeBabeledError) {
			// Ignore.
		}
	}

	const args = parseArgs(process.argv.slice(2));
	const {
		sourceMaps,
		variant
	} = args;
	const isBuild = process.env.npm_lifecycle_event === 'build'; // eslint-disable-line
	const isTest = process.env.npm_lifecycle_event.startsWith('test'); // eslint-disable-line

	const entryFile = variant ? `index-${variant}.js` : 'index.js';
	const appEntryPoint = join(basePath, 'src', entryFile);
	const buildOutputDir = join(basePath, 'build', 'dist', 'public');
	const bundleName = `bundle-${version}.js`;
	const i18nExtractorPlugin = new ExtractTextPlugin(i18nFileName, {allChunks: true});
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
		patchLoader: appendModulePatch(),
		resolve: {
			alias: {
				// `alias!$aliases-data` required in `AliasRegistry`, loaded with `alias-loader`.
				'$aliases-data$': join(basePath, 'src', 'config', 'aliases.js'),
				// `app-meta!$app-metadata` required in `BRAppMetaService`, loaded with `app-meta-loader`.
				'$app-metadata$': join(basePath, 'src', 'config', 'metadata.js'),
				'ct-core/BRJSClassUtility$': join(__dirname, 'null.js'),
				'br/dynamicRefRequire$': join(__dirname, 'null.js')
			}
		},
		resolveLoader: {
			alias: {
				alias: '@caplin/alias-loader',
				'app-meta': '@caplin/app-meta-loader',
				service: serviceLoader
			}
		},
		plugins: [
			i18nExtractorPlugin
		]
	};

	if (sourceMaps) {
		webpackConfig.devtool = 'inline-source-map';
	}

	if (isBuild) {
		webpackConfig.plugins.push(
			new webpack.DefinePlugin({
				'process.env': {
					VERSION: JSON.stringify(version)
				}
			})
		);

		webpackConfig.plugins.push(
			new webpack.optimize.UglifyJsPlugin({
				exclude: /i18n(.*)\.js/,
				output: {
					comments: false
				},
				compress: {
					warnings: false,
					screw_ie8: true // eslint-disable-line
				}
			})
		);
	}

	return webpackConfig;
}
