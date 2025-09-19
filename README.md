# JavaScript/TypeScript based Matter Implementation

[![license](https://img.shields.io/badge/license-Apache2-green.svg)](https://raw.githubusercontent.com/matter-js/matter.js/master/LICENSE)

## What is Matter?

[Matter](https://csa-iot.org/all-solutions/matter/) is a new secure, reliable and local standard protocol for smart/IoT devices launched at the end of 2022 by the [Connectivity Standards Alliance](https://csa-iot.org/). 

To learn more about Matter visit [https://csa-iot.org/all-solutions/matter/](https://csa-iot.org/all-solutions/matter/)

## What is matter.js?

matter.js is a TypeScript/JavaScript implementation of the complete Matter protocol.

Our main goal is to create a robust and compliant library that enables the seamless implementation of Matter-compatible devices, bridges, controllers, and a shell application. This effort is dedicated to improving Matter's accessibility for testers, smart home enthusiasts, and developers of OS-based IoT products. Fostering a second implementation of the Matter standard, aligned with the same specifications, not only expands the ecosystem but also contributes to the validation and increased robustness of the standard itself.

> [!IMPORTANT]
> matter.js as library, along with all related tools (such as the Shell app) and examples, is not certified by the Connectivity Standards Alliance (CSA). They are provided solely to demonstrate the capabilities of our solution and to support testing and development.  Using matter.js does not certify your product — Connectivity Standards Alliance membership and product certification are required to release official Matter devices. For more details, see [A note on certification](#a-note-on-certification) for more details.

matter.js consists of a set of pure JavaScript base packages without any native dependencies, implementing the Matter protocol and required interfaces in JavaScript, along with extensive typings for The Matter standard and the matter.js APIs.
Further [packages with Node.js based native dependencies](./packages/nodejs) utilize the base package to implement platform-specific parts using Node.js for networking and other necessary native features or add [BLE support](./packages/nodejs-ble). [Node.js example scripts](./packages/examples) implement example CLI scripts for devices, bridges or controllers. A [Matter Shell](./packages/nodejs-shell) allows interaction with Matter devices as a controller via a CLI interface.

To use matter.js in your own non-Node.js based projects you need to implement the platform specific parts. See [Using matter.js in unsupported JavaScript environments](#using-matterjs-in-unsupported-javascript-environments) for more details. If you do this, please contact us to add your platform to the list of supported platforms.

matter.js employs [code generation](./support/codegen) to ensure a comprehensive model of all Matter Clusters and (soon) device types. This includes typing and documentation, readily available within developers' IDEs, facilitating easy accessibility and adherence to conformance information during coding. This approach allows for easy addition of new clusters and device types, ensuring synchronization with the Matter standard.

## How is matter.js used?

matter.js serves various purposes and is employed for:

- **Building (commercial) Matter devices and bridges:**<br>Use JavaScript/TypeScript to create Matter devices or bridges for OS-based IoT products. The extensive typing information and documentation facilitate the easy implementation of required functionality while ensuring synchronization with the Matter specification. **If you plan to certify a device based on matter.js please see note below.**

- **Building Matter controllers:**<br>Develop Matter controllers with JavaScript/TypeScript for OS-based IoT products. Post-commissioning (including BLE support), controllers can access all data from devices and control them. The API supports development with known typings of all clusters when endpoints and device types are known during development. It also allows generic programmatic access to all clusters and attributes. Typing information of custom clusters can be added to the controller or accessed generically with generic data parsing support. **If you plan to build/certify a controller based on matter.js please see note below.**

- **Rapid prototyping for test and development:**<br>Enable rapid development of device or controller prototypes for testing and development purposes. JavaScript's nature and the convenient matter.js API make it easy to create prototypes. Testing different feature combinations or endpoint structures can be done quickly using JavaScript testing frameworks.

- **Ad-hoc testing of Matter devices using the matter.js shell:**<br>Employ the Matter Shell application as a controller to interact with Matter devices via a CLI interface. Ideal for manual testing and development purposes.

Explore the versatile capabilities of matter.js and adapt it to your specific use cases!

### A note on certification

**To release a Matter product (device, bridge, or controller), you must be a member of the Connectivity Standards Alliance (CSA) and obtain certification for your product. This requirement is independent of the implementation you use and is what also allows you to use the Matter name and logo on your product and in marketing.**

**matter.js itself is not certified by the Connectivity Standards Alliance, and using matter.js does not automatically certify your product.** While we ensure that the protocol and default cluster implementations we provide align with the Matter Specification, certification of your final product remains your responsibility.

Please refer to the Certification sections on the [Matter Handbook](https://handbook.buildwithmatter.com/certification/) and the [Connectivity Standards Alliance Homepage](https://csa-iot.org/certification/why-certify/) for more details on the certification process and benefits.

If you plan to officially certify a device, bridge, or controller based on matter.js, please contact us via email or Discord to get the latest information on matter.js compliance status, supported and pending features, and guidance on the certification process. We can also support you during certification if needed.

matter.js has already been successfully used in certified products, but there are still important considerations and discussions required when planning certification.

## JavaScript/Node.js compatibility
* At least ES2022 needs to be used as build target for your project!
* The published packages are supports all LTS Node.js versions starting with 20.x

Please also see the additional [TypeScript notes](./packages/main/README.md#typescript-note).

## How to use matter.js

### Create a new project based on matter.js

We provide templates for various matter.js use cases.  You can bootstrap a new project in Node.js using `npm init`:

```bash
npm init @matter
```

For details on available templates and other options:

```bash
npm init @matter help
```

### Add matter.js to an existing project

To use matter.js you import `@matter/main` as a dependency in your project. This package re-exports functionality from other packages, so it is not necessary to have multiple dependencies. If you need BLE support you can use `@matter/nodejs-ble` as an additional dependency.

```bash
npm install @matter/main --save
```

If your project is not based on Node.js you need to implement the platform specific parts. See [Using matter.js in unsupported JavaScript environments](#using-matterjs-in-unsupported-javascript-environments) for more details.

### Run the examples

The templates we use when you bootstrap a new application are available as examples you can run directly.  You can
install them in Node.js as follows:

```bash
npm install @matter/examples
```

Please refer to the Examples readme for information regarding their usage: [@matter/examples](packages/examples/README.md)

### Extending and contributing to matter.js

We welcome contributions!  If you have Node.js installed, prepare your development environment as follows:

```bash
git clone https://github.com/matter-js/matter.js
cd matter.js
npm install
```

This will install all dependencies and create symlinks between the packages, so that it can be used locally. It also builds all packages.

On Windows, in order to successfully build all the packages (tested on Windows 11 Pro) make sure to have installed Node.js 20+, the windows-build-tools and node-gyp version 10.
On Non-Windows platforms and having Python 3.12+ installed, please also make sure to use npm 10.2.3+.

## Connecting with the community

If you have issues please use the GitHub "[Issues](https://github.com/matter-js/matter.js/issues)" of this repository. For questions or idea discussions please use the "[Discussions](https://github.com/matter-js/matter.js/discussions)" in this GitHub repository.

Additionally, our "Matter Integrators" Discord server is a great place to discuss matter.js, the Matter protocol and how to implement Matter in various environments -- not just JavaScript/TypeScript! You can join it here: https://discord.gg/ujmRNrhDuW .

## Compatibility with the Matter standard
See [here](./docs/MATTER_COMPATIBILITY.md).

## Compatibility with popular ecosystems 

Devices created with matter.js/matter-node.js have been tested with:

- **Apple iOS (iPhone or iPad) and tvOS 16 (Apple TV) - "Home" app by Apple**: Fully working
- **Google Home Ecosystem (Android or Google Nest smart speakers/display) - "Google Home" app**: Fully working
- **Amazon Alexa (Amazon Echo smart speakers/displays)** : Fully working
- **Tuya Smart (SmartLife) app**: Fully working
- **Samsung SmartThings (Station or Hub v2 and later)**: Fully working
- **LG ThinQ**: Fully working, beside glitches in LG software sometimes
- **Homey Pro**: Fully working
- **Home Assistant - Matter integration**: Fully working
- **OpenHAB - Matter Binding**: Fully working (openHAB Matter Client in openHAB 5.0)
- **Aqara Hubs**: Fully working with Aqara starting matter.js 0.12.3 and newest Apps and controller firmwares
- **Yandex Smart Home**: Yandex currently seem to not allow to pair test devices, so matter.js open source devices are not working with Yandex SMart Home. Please contact Yandex and request this feature.
- **flic**: Fully working

matter.js based projects show up as "uncertified test devices" in the ecosystems. This is because the devices are not certified by the Connectivity Standards Alliance (CSA) and are not part of the official Matter certification program. However, the devices are fully functional and can be used in the ecosystems. The ecosystems usually inform the user about the uncertified status of the device. Please see [Pairing and Usage Information](./docs/ECOSYSTEMS.md#pairing-and-usage-information) for more details.

We also collected a [list of tested device types on ecosystem](./docs/ECOSYSTEMS.md#device-types-tested-on-various-ecosystems).This is a compilation of published information by the ecosystems and own community tests.

Each ecosystem has their own specialties, see [Pairing and Usage Information](./docs/ECOSYSTEMS.md##pairing-and-usage-information) for more details.

When you plan to use matter.js as controller with Thread based devices please see [How to use Thread based devices with matter.js Controller/Shell](./docs/USAGE_THREAD.md) for more details.

If you face issues using matter.js or for Matter in general please check out our [Troubleshooting information](./docs/TROUBLESHOOTING.md).

A list of known issues with some ecosystems can be found in [KNOWN_ISSUES.md](./docs/KNOWN_ISSUES.md).

matter.js/matter-node.js as Controller was successfully tested with Chip example apps and several production devices (see [here](https://github.com/project-chip/matter.js/discussions/316) ).

Please report any outdated or newly discovered information on compatible ecosystems, devices, and device types or issues.

## Overview of our code structure

This repository contains multiple packages (and because of this it is a monorepo). The packages are contained in the `packages` directory and are all published separately to NPM.

Please see the respective README files in the package directories for more information about their content.

For each package the [API Documentation](./docs/README.md) is updated on each official release, but can also be built locally using `npm run build-doc`.

Besides these packages that are published to npm there are also some packages that are not published to npm and exist as folders in the root directory:
- **[chip-testing](./support/chip-testing)**: A set of scripts to allow to run the Chip-Tool-Certification tests against a matter-node.js based devices. These tests are executed on GitHub CI automatically.
- **[codegen](./support/codegen)**: A set of scripts to generate code for the Matter code model, clusters and device types.
- **[model](./support/models)**: Contains all pre-parsed information for the Matter models used to generate code for the code model, clusters and device types. It also allows to define [local overrides](./support/models/src/local) to adjust incomplete or wrong information in the Matter models.

This repository uses the workspaces feature from npm to manage the dependencies between the packages. Because of this please only use `npm install` on the root of the repository. This will install all the dependencies for all the packages and also take care to create relevant symlinks between the packages.

Additionally, it uses typescript project references to allow IDE support for the dependencies. These dependencies need to be added to the tsconfig.json files if needed.

You can build and test the packages separately or all at once by using `npm run build` or `npm run test` on root package level. With `npm run build-clean` you can build all packages from scratch.

## Release tags

To allow a simple use of the matter.js Monorepo based project in other projects, we publish all packages separately to NPM. There are two available release tags on NPM:

- **latest**: This is the default NPM tag and contains official released versions of the packages. This is the recommended tag to use in your projects. Whenever we build a new official release also the docs are updated and available in the repository.
- **dev**: This tag contains a nightly build of the project and is updated every night if there were changes in the repository. This is only for testing and development purposes and should not be used for real production use cases. Use e.g. `npm install @matter/main@dev` to install the latest nightly build of @matter/main.

## Code style

matter.js relies very much on TypeScript and tries to be as type safe as possible. Please prevent using ts-ignore or other "hacks" as best as possible and try to find and fix the real typing issue if you encounter cases where you need to use them. You can also always join discord or ask in GitHub discussions if you need help.

The project contains eslint as linter and prettier as formatter. The configuration files are located in the root directory and are valid for all packages.

The following commands are available:

- `npm run lint`: runs eslint on all packages and outputs the results and errors
- `npm run lint-fix`: runs eslint on all packages and tries to fix the errors
- `npm run format`: runs typescript-formatter on all packages and formats the code. Files will be changed in place.
- `npm run format-verify`: runs typescript-formatter on all packages and checks if the code is formatted correctly. If not it will output the files that need to be formatted.

If you want to contribute to the project please make sure to check linting and formatting before creating a PR. The GitHub CI also verifies this and will fail if the code is not formatted correctly.

## Building

You can use `npm run build` on the root level to build all packages in an incremental way. This will only build the changed files.

You can use `npm run build-clean` on the root level to build all packages from scratch.

## Testing

You can use `npm run test` on the root level to run all tests for all packages.

Special testing using the Chip-Tool-Certification tests is available in the package chip-testing. Please refer to the [README.md](chip-testing/README.md) in the package for more details.

## API documentation

You can use `npm run build-doc` on the root level to generate the API documentation for all packages in directory doc.

## Current status

We are about to complete the basic certifiable feature set. Right now in the low level APIs all clusters are supported and all kind of devices can be built, but not with pre-defined cluster logic.
See the [Roadmap](https://github.com/orgs/project-chip/projects/11/views/1) for status and next planned steps.

## Using matter.js in unsupported JavaScript environments

matter.js is fully functional in Node.js.  We test some portions in web browsers and offer (WIP) experimental React
Native support.  For other environments you will need to implement a few platform-specific abstractions:

- **BigInt/UInt8Array**: matter.js relies on various ES6 JavaScript language features including BigInt and UInt8Array. If your platform does not support this you need to add a polyfill.
- **Network**: The Network implementation needs to provide UDP server and client functionality. This is a core requirement. The [Network Interface](packages/general/src/net/Network.ts) needs to be implemented which includes methods to query network interfaces of the system and to use UDP sockets.
- **Crypto**: Until we have a pure JavaScript implementation of the required crypto functions, a native implementation is needed. The [Crypto Interface](packages/general/src/crypto/Crypto.ts) needs to be implemented which includes methods to generate random numbers, generate keys and to encrypt/decrypt data with various algorithms.
- **Storage**: The Storage implementation needs to provide a way to store and retrieve data, easiest in a key-value form. The [Storage Interface](packages/general/src/storage/Storage.ts) needs to be implemented which includes methods to store and retrieve data.
- **Time**: We provided a time implementation compatible with any modern JS environment.  You can replace our implementation by implementing he [Time Interface](packages/general/src/time/Time.ts) needs to be implemented which includes methods to get the current time in milliseconds. 
- **BLE**: If your implementation is not Ethernet based or Pre-Connected to an IP network you need to provide a BLE implementation. The [BLE Interface](packages/protocol/src/ble/Ble.ts) needs to be implemented which includes methods to start and stop BLE advertising and to connect to a BLE device. Depending on if you implement a Controller or Device you need to implement the Peripheral and Broadcaster (Device) or Central and Scanner (Controller) BLE interfaces. **For a device the platform you implement needs to allow to send custom "Manufacturer data" in the BLE advertising packet!**
- **Wi-Fi/Thread Commissioning**: To implement a device that requires commissioning to join a network, you must provide a commissioning method for Wifi or thread. This must include methods to scan for networks, configure the device for a network and to connect to a network. The implementation in this case must implement WifiNetworkCommissioning and/or ThreadNetworkCommissioning clusters.
- **Intl**: For some internationalization features (e.g. reporting locale or calendar type) we use standard JavaScript internationalization APIs. If your platform does not support these will need to add polyfills.

The following reference implementation and code references are available as basis for own platform implementations:

- For Network, Crypto, Storage and Time functionality you can use the Node.js implementations provided by [@matter/nodejs](packages/nodejs/README.md) as reference. 
- For BLE functionality you can use the Node.js implementations provided by [@matter/nodejs-ble](packages/nodejs-ble/README.md) as reference. 
- For Wi-Fi/Thread Commissioning functionality you can use the [Node.js DeviceNode example script](packages/examples/src/device-onoff-advanced/cluster/DummyWifiNetworkCommissioningServer.ts) which contains a static "testing only" (but API complete for Wifi) reference.

If you implement a specific platform, we would be happy with a PR contributing the code so that other community members can benefit from it.

## matter.js-based projects

The following projects are available on any platform with access to Node.js 20+:

- [@matter/nodejs](packages/nodejs/README.md): a Matter client / server running on node.js compatible with HA (Android / iOs support in progress)
- [@matter/nodejs-shell](packages/nodejs-shell/README.md): a Matter Shell script to allow to interact with Matter devices as controllers via a CLI interface
- [ioBroker Matter Adapter](https://github.com/ioBroker/ioBroker.matter): An open.source smart home system offering Matter Devices, Bridges and Controller
- [node-red-matter-bridge](https://github.com/sammachin/node-red-matter-bridge): a Node-Red node to expose a bridge
- [node-red-matter](https://github.com/FezVrasta/node-red-matter): a Node-Red node for devices and controllers (outdated)
- [zigbee-matter-bridge](https://github.com/antonio-gabriele/zigbee-matter-bridge): a Zigbee to Matter Bridge
- [Gladys Assistant](https://github.com/GladysAssistant/Gladys): An open-source smart home assistant integrating `matter.js` as a Matter controller to connect and manage Matter devices
- [matterbridge](https://github.com/Luligu/matterbridge): a matter.js plugin manager with 7 example plugins
  - [matterbridge-zigbee2mqtt](https://github.com/Luligu/matterbridge-zigbee2mqtt): matterbridge production-level plugin that expose all zigbee2mqtt devices and groups to Matter
  - [matterbridge-somfy-tahoma](https://github.com/Luligu/matterbridge-somfy-tahoma): matterbridge production-level plugin that expose all somfy tahoma screens to Matter
  - [matterbridge-shelly](https://github.com/Luligu/matterbridge-shelly): matterbridge production-level plugin that expose all Shelly Gen 1, 2, 3, BLU devices to Matter
  - ... and more plugins
- Web-Based [matter-controller](https://github.com/JimBuzbee/matter-controller): Examples of Matter Controllers that utilize a web socket to communicate with the Matter Shell 
