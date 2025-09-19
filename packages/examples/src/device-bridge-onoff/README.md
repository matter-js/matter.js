# Bridge for multiple OnOff light/sockets with a CLI command execution interface

> [!IMPORTANT]
> matter.js as library, along with all related tools (such as the Shell app) and examples, is not certified by the Connectivity Standards Alliance (CSA). They are provided solely to demonstrate the capabilities of our solution and to support testing and development.  Using matter.js does not certify your product — Connectivity Standards Alliance membership and product certification are required to release official Matter devices. For more details, see [A note on certification](https://github.com/matter-js/matter.js/blob/main/README.md#a-note-on-certification) for more details.

This example shows how to build a Matter-Bridge that offers multiple OnOff lights and sockets as a bridge. It can be configured via command line and allows for specifications of shell commands to be executed when on and off commands are received at the numbered devices. For more details see below.

A Bridge is used to expose multiple devices at once.

## Usage

For general documentation about the CLI parameters or environment variables that can be used for matter.js please refer to the [Examples README](../../../examples/README.md#cli-usage).

The usage and parameter are comparable to above, but the bridge adds support for multiple types and on/off commands:

**If you want to start multiple parallel processes please make sure to use different storage locations, different network port and ideally also different passcodes for each process!**

The usage is as above but with modified parameters:
* --num=X: number of devices to expose (default 2)
* --typeX=socket: type of the devices to expose as device number X (default Light bulb)
* --onX "script": script to run when the device number X is turned on
* --offX "script": script to run when the device number X is turned off

**Please especially use the --uniqueidX parameters to assign unique own IDs to the single deices in order to remember their structure in the bridge. Such an ID should never be reused if you ever remove or add new devices! If you do not use --uniqueidX then the order you added them here is not allowed to ever change.**

```bash
matter-bridge --num=2 --on1="echo 255 > /sys/class/leds/led1/brightness" --off1="echo 0 > /sys/class/leds/led1/brightness" --type2=socket --on2="echo 255 > /sys/class/leds/led2/brightness" --off2="echo 0 > /sys/class/leds/led2/brightness"
```

or when starting from TS files:

```bash
npm run matter-bridge -- --num=2 --on1="echo 255 > /sys/class/leds/led1/brightness" --off1="echo 0 > /sys/class/leds/led1/brightness" --type2=socket --on2="echo 255 > /sys/class/leds/led2/brightness" --off2="echo 0 > /sys/class/leds/led2/brightness"
```
(Please note the "--" to separate commandline parameters between the npm run and the executed script.

The above command exposes two devices under the bridge, one as light, one as socket and executes the respective commands when the devices are turned on or off.
