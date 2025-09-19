# OnOff light/socket device with a CLI command execution interface

> [!IMPORTANT]
> matter.js as library, along with all related tools (such as the Shell app) and examples, is not certified by the Connectivity Standards Alliance (CSA). They are provided solely to demonstrate the capabilities of our solution and to support testing and development.  Using matter.js does not certify your product — Connectivity Standards Alliance membership and product certification are required to release official Matter devices. For more details, see [A note on certification](https://github.com/matter-js/matter.js/blob/main/README.md#a-note-on-certification) for more details.

This example shows how to build a simple minimalistic DeviceNode with just one socket or light endpoint. The shell commands to be executed by on/off commands can be configured via CLI.

## Usage

For general documentation about the CLI parameters or environment variables that can be used for matter.js please refer to the [Examples README](../../../examples/README.md#cli-usage).

To run from the build files:

```bash
matter-device
```

To run directly from Typescript files with on the fly compilation:

```bash
npm run matter-device
```

This starts a MatterServer (DeviceNode) server listening on port 5540 and announce it as socket device.

This first version only includes the OnOff cluster (on/off smart thing, like a plug or a bulb).
You can use -on and -off parameter to run a script to control something.
For instance, on a Raspberry Pi, this will turn on / off the red LED:

```bash
matter-device --type socket --on="echo 255 > /sys/class/leds/led1/brightness" --off="echo 0 > /sys/class/leds/led1/brightness"
```

or when starting from TS files:

```bash
npm run matter-device -- --type socket --on="echo 255 > /sys/class/leds/led1/brightness" --off="echo 0 > /sys/class/leds/led1/brightness"
```
(Please note the "--" to separate commandline parameters between the npm run and the executed script.)

**If you want to start multiple parallel processes please make sure to use different storage locations, different network port and ideally also different passcodes for each process!**

The following parameters are available:
* --passcode: the passcode to use for pairing (default: 20202021)
* --discriminator: the discriminator to use for pairing (default: 3840, value between 0 and 4095)
* --vendorid: the vendor ID as number to use for pairing (default: 65521 (0xFFF1))
* --productid: the product ID as number to use for pairing (default: 32768 (0x8000))
* --uniqueid: a unique ID for this device to be used in naming and to store structure information (default: ms time now)
* --type: the device type to use for pairing (default: light, alternative value is "socket")
* --netinterface: limit mdns announcements and scanning to the provided network interface, e.g. "en0" (default: all interfaces available)
* --port: the port to listen on for the device (default: 5540)
* --store: the storage location (directory) to use for storing the pairing information (default: .device-node). Ideally use names starting with a ".". Delete the directory or provide an alternative name to reset the device
* --on: the command to run when the device is turned on (see example above)
* --off: the command to run when the device is turned off (see example above)

## Bundling

For production environments where space and/or CPU is at a premium, you might consider using a bundler to distribute your application.  This project includes an example demonstrating how to create such a bundle using [esbuild](https://esbuild.github.io/).

Then in the `matter-node.js-examples` installation directory, run:

```bash
npm run bundle-device
```

This creates a single JavaScript file containing the application and dependencies.

To view the example commands for bundling and running, see scripts `bundle-device` and `matter-device-bundled` in [package.json](../../package.json).

Note that you cannot include native dependencies in this way so those will still need to be installed locally using NPM.  In this example, those are the dependencies flagged as `--external` in the `esbuild` command line.
