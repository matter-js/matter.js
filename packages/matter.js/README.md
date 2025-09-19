# @project-chip/matter.js

> [!IMPORTANT]
> This package is only needed if you plan to build a Controller for the time being! To build devices or bridges please use the [@matter/main](https://www.npmjs.com/package/@matter/main) package. More details below...

> [!IMPORTANT]
> matter.js as library, along with all related tools (such as the Shell app) and examples, is not certified by the Connectivity Standards Alliance (CSA). They are provided solely to demonstrate the capabilities of our solution and to support testing and development.  Using matter.js does not certify your product — Connectivity Standards Alliance membership and product certification are required to release official Matter devices. For more details, see [A note on certification](https://github.com/matter-js/matter.js/blob/main/README.md#a-note-on-certification) for more details.

**With matter.js 0.11.0 the package structure was adjusted. This package is exposing the current API for Controller implementations (a new API will follow soon) and the Legacy Device building Node API and mainly contains compatibility re-exports. Please adjust your code to just use the relevant exports from here and switch for all other matter.js general packages to the [@matter/main](https://www.npmjs.com/package/@matter/main) package.**

Implementation of Matter protocol in typescript with no native dependencies (and very limited dependencies).

This is the JavaScript-only Core of the Matter protocol. It is used by other projects to implement Matter Nodes and Clients and add the relevant specific implementations for Network and other elements.

> This package supports all Node.js LTS versions starting with 18.x

The following features are abstracted away to allow to be implemented environment specific:

-   Network (UDP/MDNS)
-   Crypto
-   Storage
-   Date/Timer
-   Logger (Default uses "console")
-   Environment (Process and Configuration handling)

## Exported functionality

This library exports the Matter protocol functionality as well as some helper functions as named exports:

| Export                                  | Description                                                                                                                                                                                         |
|-----------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `@project-chip/matter.js`               | Exports the API to implement a Device or a Controller.                                                                                                                                              |
| `@project-chip/matter.js/behavior`      | Exports Behavior classes (New API) as framework to implement all relevant Logic for clusters and internal logic. Contains auto-generated class structures and also Cluster default implementations. |
| `@project-chip/matter.js/certificate`   | Exports Certificate (Root-/PAA/PAI/IAC/DA-Certificates) related functionality                                                                                                                       |
| `@project-chip/matter.js/cluster`       | Exports Matter Cluster definitions and Default Cluster-Handlers                                                                                                                                     |
| `@project-chip/matter.js/codec`         | Exports Codecs for e.g. Matter-Messages                                                                                                                                                             |
| `@project-chip/matter.js/common`        | Exports certain common functionalities                                                                                                                                                              |
| `@project-chip/matter.js/crypto`        | Exports Crypto related abstract functionality that needs to be implemented platform specific!                                                                                                       |
| `@project-chip/matter.js/datatype`      | Exports Matter Data types                                                                                                                                                                           |
| `@project-chip/matter.js/device`        | Exports Matter Device relevant classes (Legacy API!)                                                                                                                                                |
| `@project-chip/matter.js/devices`       | Exports Matter Device type classes (NEW API!)                                                                                                                                                       |
| `@project-chip/matter.js/endpoint`      | Exports Matter Endpoint structure classes (NEW API!)                                                                                                                                                |
| `@project-chip/matter-.js/environment`  | Exports environment functionalities, which handles central functions like MDNS and configuration                                                                                                    |
| `@project-chip/matter.js/elements`      | Exports every standard Matter element defined by the [Matter Object Model](../model/README.md)                                                                                                   |
| `@project-chip/matter.js/fabric`        | Exports Matter-Fabric functionality                                                                                                                                                                 |
| `@project-chip/matter.js/interaction`   | Exports Matter Interaction protocol functionality                                                                                                                                                   |
| `@project-chip/matter.js/log`           | Exports Logging functionality (based on "console")                                                                                                                                                  |
| `@project-chip/matter.js/math`          | Exports Math functionality used by Matter                                                                                                                                                           |
| `@project-chip/matter.js/mdns`          | Exports Basic MDNS functionality (uses Network implementation)                                                                                                                                      |
| `@project-chip/matter.js/model`         | Exports a JavaScript version of the Matter data model                                                                                                                                               |
| `@project-chip/matter.js/net`           | Exports Basic Network abstract functionality that needs to be implemented platform specific!                                                                                                        |
| `@project-chip/matter.js/node`          | Exports [Matter Node functionality](./src/) which is used as basis for a device or controller (NEW API!). It also contains Matter Interaction model abstractions for the new API.                   |
| `@project-chip/matter.js/protocol`      | Exports Basic Matter protocol functionality                                                                                                                                                         |
| `@project-chip/matter.js/schema`        | Exports Schema definitions and functionality                                                                                                                                                        |
| `@project-chip/matter.js/securechannel` | Exports Secure Channel functionality                                                                                                                                                                |
| `@project-chip/matter.js/session`       | Exports Session and Secure-Session functionality                                                                                                                                                    |
| `@project-chip/matter.js/spec`          | Exports Matter Specification References                                                                                                                                                             |
| `@project-chip/matter.js/storage`       | Exports Basic Storage abstract functionality that needs to be implemented platform specific!                                                                                                        |
| `@project-chip/matter.js/tags`          | Exports Semantic Tag Standard namespace definitions of the Matter specification                                                                                                                     |
| `@project-chip/matter.js/time`          | Exports Basic Time/Timer abstract functionality that needs to be implemented platform specific!                                                                                                     |
| `@project-chip/matter.js/tlv`           | Exports Matter TLV type definitions                                                                                                                                                                 |
| `@project-chip/matter.js/util`          | Exports Basic Utility functionality                                                                                                                                                                 |

Both exports and the typings are exported as CommonJS and ES6 modules.

For more details please refer to the [API Documentation](../../docs/README.md).

For more details see the [main package](../main/README.md) documentation.

### Typescript note

To have Typescript and your IDE know all the relevant exported functionality you need to use the following in your tsconfig.json:

```json5
{
    compilerOptions: {
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

-   `npm run test`: Run all tests

