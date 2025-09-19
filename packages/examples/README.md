# @matter/examples - Usage examples / Reference implementations

[![license](https://img.shields.io/badge/license-Apache2-green.svg?style=flat)](https://raw.githubusercontent.com/mfucci/node-matter/master/LICENSE)

This project provides a set of reference implementations to show several types of Matter device nodes or also a controller implementation.

> This package supports all Node.js LTS versions starting with 18.x

> [!IMPORTANT]
> matter.js as library, along with all related tools (such as the Shell app) and examples, is not certified by the Connectivity Standards Alliance (CSA). They are provided solely to demonstrate the capabilities of our solution and to support testing and development.  Using matter.js does not certify your product — Connectivity Standards Alliance membership and product certification are required to release official Matter devices. For more details, see [A note on certification](https://github.com/matter-js/matter.js/blob/main/README.md#a-note-on-certification).

To better show how to use the library we provide some reference implementations in the examples directory. They are usable as CLI scripts without changes in the first place but are very simple. They are meant to be used as a starting point for your own implementation, or to experiment with Matter at all in a first place.

For BLE usage please also see the [@matter/node-ble README.md](../nodejs-ble/README.md)  for prerequisites and limitations!

## Examples Overview
The examples provided by this repository show different use cases demonstrating how to build different device types and show various ways to implement and interact with the matter.js structures. This section gives an overview regarding what the different examples demonstrate.

> [!IMPORTANT]
> With matter.js 0.8 we introduced a new API that is not compatible with the old API. The new API is more flexible and allows for more complex use cases. The old API is still supported but will be removed in a future release. The examples for the old API are available in the NPM package @project-chip/matter-node.js-examples.

The different examples and what they do is described in the relevant README.md files in the respective directories.

### Device Examples

All examples that have a name starting with `device-` are examples for different types of matter devices. They show how to implement a device with different features and how to interact with it.  These can be paired by any ecosystem or controller that supports test devices.

### Controller Examples

All examples that have a name starting with `controller-` are examples for different types of matter controllers. They show how to implement a controller. These can pair any matter device.

## Installation

### From NPM

```bash
npm i -g @matter/examples
```

### Use from Cloned Matter.js Repository

When you clone the matter.js repository you can also use matter-node.js. To do this you need to execute `npm install` in the matter.js root directory once to install all dependencies and build all packages.

Then after `cd packages/examples` you can use `npm run matter-device` to run the matter-node.js server. Please see the next section for more details.

## CLI usage

### General CLI information
Some command line parameters, for example those used to set the level of logging or the MDNS interface are now included in the new environment processing. These can be set by generic command line arguments or by using environment variables. These parameters are processed automatically so are no longer handled by the new example code directly. These are:

* `--log-level=...` or environment variable `MATTER_LOG_LEVEL` or in code `environment.vars.set('log.level', Level.DEBUG)`. Allowed values are: Level.FATAL ("fatal"), Level.ERROR ("error"), Level.WARN ("warn"), Level.NOTICE ("notice"), Level.INFO ("info"), Level.DEBUG ("debug")
* `--log-format=...` or environment variable `MATTER_LOG_FORMAT` or `environment.vars.set('log.format', Format.PLAIN)`. Allowed values are: Format.PLAIN ("plain"), Format.HTML ("html"), Format.ANSI ("ansi")
* `--storage-path=...` or environment variable `MATTER_STORAGE_PATH` or `environment.vars.set('storage.path', "...")` allows to set the storage location. By default, it will be stored in the users home directory in `.matter/...`. If specified, the given path will be used relative to the current working directory.
* `--storage-clear` or environment variable `MATTER_STORAGE_CLEAR=1` or `environment.vars.set('storage.clear', true)` allows to define if the storage is reset on startup.
* `--mdns-networkinterface=...` or environment variable `MATTER_MDNS_NETWORKINTERFACE` or `environment.vars.set('mdns.networkInterface', "...")` allows to limit the DNS announcements and scanning to one network interface. By default, all available interfaces are used.
  Additionally, all command line parameters now require to start with two dashes!

(if using `npm run ...` to run examples then an additional "--" if needed to separate commandline parameters between the npm run and the executed script. Please see the relevant examples README too.)

## Development on basis of the examples

The code of the examples is written so that you can use them as basis for your own scripts also outside of this library in your own package. If you import from `@matter/main` then matter.js loads platform extensions such as those for node.js automatically.  If you import directly from our other packages then you should add a dependency on `@matter/nodejs`. The examples use `@matter/main` imports to ease adoption.

### Development Device/Composed-device/Bridge

The code is structured by comment blocks to better see what belongs to what. It always has code which is just collecting relevant information and data, then the code which is setting up the device and then the code which is starting the device.

## Building

* `npm run build`: Build all code and create CommonJS and ES6 variants in dist directory. This will built incrementally and only build the changed files.
* `npm run build-clean`: Clean the dist directory and build all code from scratch
