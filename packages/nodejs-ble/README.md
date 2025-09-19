# @matter/nodejs-ble - Node.js based platform specific functionality for Matter.js

[![license](https://img.shields.io/badge/license-Apache2-green.svg?style=flat)](https://raw.githubusercontent.com/mfucci/node-matter/master/LICENSE) 

Matter BLE support using bleno for Peripheral/Device side and noble for Central/Controller side.

> This package supports all Node.js LTS versions starting with 20.x

This package contains the specific Platform implementations for Bluetooth LE with Node.js. It is designed to be used in addition to the `@matter/nodejs` package to enable BLE specific functionality.

## Prerequisites and Limitations

The used packages have some limitations and prerequisites. Please check the Readme's of the packages for more details:
* [bleno](https://github.com/abandonware/bleno#readme)
  * For Linux: also consider https://github.com/stoprocent/bleno#running-on-linux
  * Bleno is currently not working on macOS because it cannot announce the proper data because of macOS limitations!
* [noble](https://github.com/abandonware/noble#readme)
  * Consider Noble prerequisites for your platform: https://github.com/stoprocent/noble#prerequisites
  * For Linux: https://github.com/stoprocent/noble#running-without-rootsudo-linux-specific
  * For macOS: Install [Bluetooth Central Matter Client Developer mode profile](../../docs/TROUBLESHOOTING.md#bluetooth-and-macos)
  * When using Device and Controller in parallel: https://github.com/stoprocent/noble#bleno-compatibility-linux-specific (NOBLE_MULTI_ROLE might be needed to set)
  * Please also see common issues and solutions: https://github.com/stoprocent/noble#common-problems


> [TIP] For Linux: The :`make` and `g++` packages must be installed.

## How to use this package
This package adds BLE support to matter.js on Node.js. It is not intended to be used standalone.

Add this package to your package dependencies and make sure it is exactly the same version as matter.js and matter-node.js.

In your code you register the BLE instance by importing the package:

```ts
import "@matter/nodejs-ble";
```

In addition to importing the module, you also need to explicitly enable BLE:

```ts
Environment.default.vars.set("ble.enable", true);
```

If you need to modify the HCI ID you can do so using a configuration variable:

```ts
Environment.default.vars.set("ble.hci.id", 1);
```

The relevant classes in matter.js will detect the registration and use the BLE instance for BLE operations if needed.

## How to choose the HCI device (Linux)

You can optionally set an options object when instantiating NodejsBle.  This object can have the following properties:
* hciId: HCI ID (number) of the HCI device to use. If not set, ID 0 is used

## Building

* `npm run build`: Build all code and create CommonJS and ES6 variants in dist directory. This will built incrementally and only build the changed files.
* `npm run build-clean`: Clean the dist directory and build all code from scratch

## Testing

* `npm run test`: Run all tests - TBD
