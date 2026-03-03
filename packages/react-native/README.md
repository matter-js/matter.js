# @matter/react-native - Matter React Native specific functionality for Matter.js

[![license](https://img.shields.io/badge/license-Apache2-green.svg?style=flat)](https://raw.githubusercontent.com/mfucci/node-matter/master/LICENSE)

This package contains the specific Platform implementations to allow running Matter Devices and Controllers on React-Native. It is designed to be used in addition to the other matter.js packages to enable React Native specific functionality.

[!Note] This package is still in development and should be considered experimental and not suited for production usage!

## Status of the package
The main idea of this package is to provide a react-native implementation of the matter protocol and also proof the 
extensibility of the matter.js library. Currently a full commissioning process was not successfully tested. WHen you 
try to use it feel free to report where the process stops for you with which error message.

## Dependencies

This package uses the following react-native libraries to provide the needed functionality:
- react-native-quick-crypto
- react-native-ble-plx
- react-native-udp
- @react-native-community/netinfo
- @react-native-async-storage/async-storage
  Please check these projects if special preparations need to be done for your developed app.

When using `@react-native-async-storage/async-storage` v3 on Android, add the package local Maven repository in your
project `android/build.gradle` (or `build.gradle.kts`):

```gradle
allprojects {
    repositories {
        // ... others like google(), mavenCentral()

        maven {
            url = uri(project(":react-native-async-storage_async-storage").file("local_repo"))
        }
    }
}
```

## AsyncStorage v3 migration path

`@matter/react-native` uses the v3-scoped `StorageBackendAsyncStorage` by default.

If you need a staged migration and want to keep the legacy singleton behavior temporarily, use
`StorageBackendAsyncStorageV2` explicitly:

```ts
import { Environment, StorageService } from "@matter/general";
import { StorageBackendAsyncStorageV2 } from "@matter/react-native/storage";

const env = new Environment("default");
const service = env.get(StorageService);
service.factory = namespace => new StorageBackendAsyncStorageV2(namespace);
```

## Building

-   `npm run build`: Build all code and create CommonJS and ES6 variants in dist directory. This will built incrementally and only build the changed files.
-   `npm run build-clean`: Clean the dist directory and build all code from scratch

## Tests

No tests available for now

## React Native Configuration

To use \`**matter.js**\` with React Native, you need to modify your Metro configuration to ensure that the packages are resolved correctly. You need to add a special resolver entry and merge it with your existing Metro configuration. Below is an example of how to do this:

```javascript
/* eslint-env node */

// Used to merge configs together.
const { mergeConfig } = require('@react-native/metro-config');

// Your project configuration.
const { getYourConfig } = require('your-config-provider');

// Get your config.
const yourConfig = getYourConfig();

// New resolver configuration to fix the package resolution issue.
const customConfig = { resolver: { unstable_enablePackageExports: true } };

// Merging your existing configuration with the new resolver configuration.
module.exports = mergeConfig(yourConfig, customConfig);
```

In this example, \`**customConfig**\` includes the necessary resolver configuration, and \`**mergeConfig**\` is used to combine it with your existing configuration (\`**yourConfig**\` in this case). Adjust \`**yourConfig**\` to fit your existing Metro configuration setup.
