# @matter/main

> [!IMPORTANT]
> matter.js as library, along with all related tools (such as the Shell app) and examples, is not certified by the Connectivity Standards Alliance (CSA). They are provided solely to demonstrate the capabilities of our solution and to support testing and development.  Using matter.js does not certify your product — Connectivity Standards Alliance membership and product certification are required to release official Matter devices. For more details, see [A note on certification](https://github.com/matter-js/matter.js/blob/main/README.md#a-note-on-certification) for more details.

Implementation of Matter protocol in typescript with no native dependencies (and very limited dependencies).

This is a convenient single-dependency for applications build on matter.js and have automatic registrations for Node.js 
and react-native as platforms.

> This package supports all Node.js LTS versions starting with 20.x (when Node.js is used).

The following features are abstracted away to allow to be implemented environment specific:

-   Network (UDP/MDNS)
-   Crypto
-   Storage
-   Date/Timer
-   Logger (Default uses "console")
-   Environment (Process and Configuration handling)

## Exported functionality

> [!IMPORTANT]
> All exports here are for the current API. Legacy Cluster implementations are only exported via @project-chip/matter.js!

This library exports the Matter protocol functionality as well as some helper functions as named exports:

| Export                     | Description                                                                                                                                                                                                                                                      |
|----------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `@matter/main`             | Re-Exports all functionality from `@matter/general`, `@matter/node`, Environment class, Matter model class and the datatypes from `@matter/types`                                                                                                                |
| `@matter/main/behaviors`   | Exports Behavior classes as framework to implement all relevant Logic for clusters and internal logic. Contains auto-generated class structures and also [Cluster default implementations](../../docs/CLUSTER_DEFAULT_IMPLEMENTATIONS.md).                       |
| `@matter/main/behaviors/*` | Exports Behavior classes as framework to implement all relevant Logic for clusters and internal logic. Contains auto-generated class structures and also [Cluster default implementations](../../docs/CLUSTER_DEFAULT_IMPLEMENTATIONS.md) as cluster-name export |
| `@matter/main/clusters`    | Exports all Matter Cluster definitions                                                                                                                                                                                                                           |
| `@matter/main/clusters/*`  | Exports Matter Cluster definitions as cluster-name export                                                                                                                                                                                                        |
| `@matter/main/devices`     | Exports Matter Device type classes                                                                                                                                                                                                                               |
| `@matter/main/devices/*`   | Exports Matter Device type classes as cluster-name export                                                                                                                                                                                                        |
| `@matter/main/endpoints`   | Exports Matter Endpoint structure classes                                                                                                                                                                                                                        |
| `@matter/main/endpoints/*` | Exports Matter Endpoint structure classes as cluster-name export                                                                                                                                                                                                 |
| `@matter/main/model`       | Exports a JavaScript version of the Matter data model. Re-exports `@matter/model` package.                                                                                                                                                                       |
| `@matter/main/node`        | Exports the matter node specific classes. Re-exports `@matter/node` package.                                                                                                                                                                                     |
| `@matter/main/protocol`    | Exports Basic Matter protocol functionality. Re-exports `@matter/protocol` package.                                                                                                                                                                              |
| `@matter/main/types`       | Exports all Types (includes Clusters and Matter datatypes and matter.js own datatypes. Re-exports `@matter/types` package.                                                                                                                                       |

Both exports and the typings are exported as CommonJS and ES6 modules.

For more details please refer to the [API Documentation](../../docs/README.md).

### Typescript note

To have Typescript and your IDE know all the relevant exported functionality you need to use the following in your tsconfig.json:

```json5
{
    compilerOptions: {
        "target": "es2022", // Matter.js most likely won't work with older versions of ES
        moduleResolution: "node16", // Required to support package.json exports
        module: "node16", // Required to make sure all imports are js
    },
}
```

Additionally, we recommend using `"strictNullChecks": true` or better for code quality `"strict": true` to make sure that all types are correctly determined.

## Building

-   `npm run build`: Build all code and create CommonJS and ES6 variants in dist directory. This will built incrementally and only build the changed files.
-   `npm run build-clean`: Clean the dist directory and build all code from scratch

## Tests

-   `npm run test-node`: Run tests in node.js
-   `npm run test-web`: Run tests in the browser
-   `npm run test`: Run all tests

test-web will create a /coverage directory containing the test code coverage
