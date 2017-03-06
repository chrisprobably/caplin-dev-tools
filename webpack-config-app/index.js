/* eslint no-param-reassign: "off" */

const {
  existsSync,
  readdirSync,
  readFileSync
} = require("fs");
const {
  join,
  sep
} = require("path");

const {
  appendModulePatch
} = require("@caplin/patch-loader/patchesStore");
const ExtractTextPlugin = require("extract-text-webpack-plugin");
const parseArgs = require("minimist");
const webpack = require("webpack");

const {
  sourceMaps,
  variant
} = parseArgs(process.argv.slice(2));
const isBuild = process.env.npm_lifecycle_event === "build";
const isTest = process.env.npm_lifecycle_event.startsWith("test");

function configureBundleEntryPoint(webpackConfig, basePath) {
  // Certain apps can have variant entry points e.g. mobile.
  const entryFile = variant ? `index-${variant}.js` : "index.js";
  const appEntryPoint = join(basePath, "src", entryFile);

  webpackConfig.entry = appEntryPoint;
}

function isPackageToBeExcludedFromBabelCompilation(packagesDir, packageDir) {
  // The new HTML/XML services are written in ES2015.
  if (packageDir === "ct-services" || packageDir === "br-services") {
    return false;
  }

  // BR/CT libs have no ES2015+.
  if (packageDir.startsWith("br-") || packagesDir.startsWith("ct-")) {
    return true;
  }

  // Thirdparty library.
  if (existsSync(join(packagesDir, `${packageDir}/converted_library.js`))) {
    return true;
  }

  return false;
}

function createBabelLoaderExcludeList(basePath) {
  const babelLoaderExclude = [/KeyMasterHack.js/];
  const dirSep = sep === "\\" ? "\\\\" : sep;
  // Exclude `babel-polyfill`, IE11 issues,
  // https://github.com/zloirock/core-js/issues/189
  const packagesToExclude = ["babel-polyfill"];
  const packagesDir = join(basePath, "../../packages");
  const rootExclusionDirs = "(node_modules|packages)";

  for (const packageDir of readdirSync(packagesDir)) {
    if (isPackageToBeExcludedFromBabelCompilation(packagesDir, packageDir)) {
      packagesToExclude.push(packageDir);
    }
  }

  const packagesToExcludeGroup = `(${packagesToExclude.join("|")})`;
  const packagesToExcludeRegExpString = [
    rootExclusionDirs,
    packagesToExcludeGroup
  ].join(dirSep);

  babelLoaderExclude.push(new RegExp(packagesToExcludeRegExpString));

  return babelLoaderExclude;
}

function createBabelLoaderQuery(basePath) {
  const babelLoaderQuery = {
    cacheDirectory: true
  };
  const babelRC = JSON.parse(readFileSync(join(basePath, ".babelrc"), "utf8"));

  if (babelRC.presets) {
    babelLoaderQuery.presets = babelRC.presets.map(preset =>
      require.resolve(`babel-preset-${preset}`));
  }

  if (babelLoaderQuery.plugins) {
    babelLoaderQuery.plugins = babelRC.plugins.map(plugin =>
      require.resolve(`babel-plugin-${plugin}`));
  }

  return babelLoaderQuery;
}

function configureBabelLoader(webpackConfig, basePath) {
  const babelLoaderConfig = {
    test: /\.js$/,
    loader: "babel-loader",
    exclude: createBabelLoaderExcludeList(basePath),
    query: createBabelLoaderQuery(basePath)
  };

  webpackConfig.module.loaders.push(babelLoaderConfig);
}

function configureI18nLoading(webpackConfig, i18nFileName) {
  const i18nLoaderConfig = {
    test: /\.properties$/
  };

  if (isTest) {
    i18nLoaderConfig.loader = "@caplin/i18n-loader/inline";
  } else {
    const i18nExtractorPlugin = new ExtractTextPlugin(i18nFileName, {
      allChunks: true
    });

    i18nLoaderConfig.loader = i18nExtractorPlugin.extract([
      "raw-loader",
      "@caplin/i18n-loader"
    ]);
    webpackConfig.plugins.push(i18nExtractorPlugin);
  }

  webpackConfig.module.loaders.push(i18nLoaderConfig);
}

function configureServiceLoader(webpackConfig) {
  const loaderAliases = webpackConfig.resolveLoader.alias;

  if (isTest) {
    loaderAliases.service = "@caplin/service-loader/cache-deletion-loader";
  } else {
    loaderAliases.service = "@caplin/service-loader";
  }
}

function configureDevtool(webpackConfig) {
  if (sourceMaps) {
    webpackConfig.devtool = "inline-source-map";
  }
}

function configureBuildDependentConfig(webpackConfig, version) {
  if (isBuild) {
    webpackConfig.output.publicPath = "public/";

    webpackConfig.plugins.push(new webpack.DefinePlugin({
      "process.env": {
        VERSION: JSON.stringify(version)
      }
    }));

    webpackConfig.plugins.push(new webpack.optimize.UglifyJsPlugin({
      exclude: /i18n(.*)\.js/,
      output: {
        comments: false
      },
      compress: {
        warnings: false,
        screw_ie8: true // eslint-disable-line
      }
    }));
  } else {
    webpackConfig.output.publicPath = "/public/";
  }
}

module.exports.webpackConfigGenerator = function webpackConfigGenerator(
  {
    basePath,
    version = "dev",
    i18nFileName = `i18n-${version}.js`
  }
) {
  const webpackConfig = {
    output: {
      filename: `bundle-${version}.js`,
      path: join(basePath, "build", "dist", "public")
    },
    module: {
      loaders: [
        {
          test: /\.html$/,
          loaders: ["@caplin/html-loader"]
        },
        {
          test: /\.(gif|jpg|png|svg|woff|woff2)$/,
          loader: "file-loader"
        },
        {
          test: /\.js$/,
          loader: "@caplin/patch-loader"
        },
        {
          test: /\.scss$/,
          loaders: ["style-loader", "css-loader", "sass-loader"]
        },
        {
          test: /\.css$/,
          loaders: ["style-loader", "css-loader"]
        },
        {
          test: /\.xml$/,
          loader: "@caplin/xml-loader"
        }
      ]
    },
    patchLoader: appendModulePatch(),
    resolve: {
      alias: {
        // `alias!$aliases-data` required in `AliasRegistry`, loaded with
        // `alias-loader`.
        "$aliases-data$": join(basePath, "src", "config", "aliases.js"),
        // `app-meta!$app-metadata` required in `BRAppMetaService`, loaded with
        // `app-meta-loader`.
        "$app-metadata$": join(basePath, "src", "config", "metadata.js"),
        "ct-core/BRJSClassUtility$": join(__dirname, "null.js"),
        "br/dynamicRefRequire$": join(__dirname, "null.js")
      },
      // Module requires are resolved relative to the resource that is requiring
      // them. When symlinking during development modules will not be resolved
      // unless we specify their parent directory.
      root: join(basePath, "node_modules")
    },
    resolveLoader: {
      alias: {
        alias: "@caplin/alias-loader",
        "app-meta": "@caplin/app-meta-loader"
      },
      // Loaders are resolved relative to the resource they are applied to. So
      // when symlinking packages during development loaders will not be
      // resolved unless we specify the directory that contains the loaders.
      root: join(basePath, "node_modules")
    },
    plugins: []
  };

  configureBundleEntryPoint(webpackConfig, basePath);
  configureBabelLoader(webpackConfig, basePath);
  configureI18nLoading(webpackConfig, i18nFileName);
  configureServiceLoader(webpackConfig);
  configureDevtool(webpackConfig);
  configureBuildDependentConfig(webpackConfig, version);

  return webpackConfig;
};
