import {
	moveBRJSApplicationCodeToPackages
} from './convert-app';
import {
	createPackagesFromLibs
} from './convert-libs';
import {
	convertSDKToPackages
} from './convert-sdk';
import convertPackagesToNewFormat from './convert-packages';
import {
	createConversionMetadataDataType,
	moveCurrentCodebase,
	verifyCLIArgs
} from './converter-utils';
import {
	createApplicationAndVariants
} from './create-applications';
import {
	moveApplicationPackagesToLibs
} from './move-libs';
import {
	injectI18nRequires
} from './inject-i18n-requires';
import {
	injectHTMLRequires
} from './inject-html-requires';
import {
	runPostConversionScript
} from './post-conversion-script';

// Provide the name of the app to convert.
export default function({app}) {
	verifyCLIArgs(app);

	let convertPackagesFunction = () => {
		// Used by the post conversion script to re-write require statements in code
		// that wasn't covered by the conversion tool.
	};
	const conversionMetadata = createConversionMetadataDataType(app);

	moveCurrentCodebase(conversionMetadata);

	const createPackages = createPackagesFromLibs(conversionMetadata);
	const moveBRJSCode = createPackages.then(() => moveBRJSApplicationCodeToPackages(conversionMetadata));
	const convertSDK = moveBRJSCode.then(() => convertSDKToPackages(conversionMetadata));
	const createApplications = convertSDK.then(() => createApplicationAndVariants(conversionMetadata));
	const convertPackages = createApplications.then(() => {
		convertPackagesFunction = convertPackagesToNewFormat(conversionMetadata);
	});
	const structureUpdated = convertPackages.then(() => moveApplicationPackagesToLibs(conversionMetadata));
	const i18nRequiresAdded = structureUpdated.then(() => injectI18nRequires(conversionMetadata));
	const htmlRequiresAdded = i18nRequiresAdded.then(() => injectHTMLRequires(conversionMetadata));
	const postConversionScript = htmlRequiresAdded.then(() => {
		runPostConversionScript(conversionMetadata, convertPackagesFunction);
	});

	postConversionScript.catch(console.error); // eslint-disable-line
}
