# Composed device for multiple OnOff light/sockets with a CLI command execution interface

> [!IMPORTANT]
> matter.js as library, along with all related tools (such as the Shell app) and examples, is not certified by the Connectivity Standards Alliance (CSA). They are provided solely to demonstrate the capabilities of our solution and to support testing and development.  Using matter.js does not certify your product — Connectivity Standards Alliance membership and product certification are required to release official Matter devices. For more details, see [A note on certification](https://github.com/matter-js/matter.js/blob/main/README.md#a-note-on-certification).

This example shows how to build a "simple" composed device where multiple OnOff lights and sockets are combined as a single device. The devices are all added at the root level, so no bridge is used. It can be configured via command line and allows for specifications of shell commands to be executed when on and off commands are received at the numbered devices. For more details see below.

A composed device is one device with multiple different device types combined. This is useful for devices that have multiple functions, e.g. a light bulb with a temperature sensor.

### Usage

For general documentation about the CLI parameters or environment variables that can be used for matter.js please refer to the [Examples README](../../../examples/README.md#cli-usage).

The parameters are like with the bridge but with an added "-type light/socket" parameter to define the type of the composed device itself.

```bash
matter-composeddevice --type=socket --num=2 --on1="echo 255 > /sys/class/leds/led1/brightness" --off1="echo 0 > /sys/class/leds/led1/brightness" --type2=socket --on2="echo 255 > /sys/class/leds/led2/brightness" --off2="echo 0 > /sys/class/leds/led2/brightness"
```

or when starting from TS files:

```bash
npm run matter-composeddevice -- --type=socket --num=2 --on1="echo 255 > /sys/class/leds/led1/brightness" --off1="echo 0 > /sys/class/leds/led1/brightness" --type2=socket --on2="echo 255 > /sys/class/leds/led2/brightness" --off2="echo 0 > /sys/class/leds/led2/brightness"
```
(Please note the "--" to separate commandline parameters between the npm run and the executed script.

The above command exposes a composed device with a socket and a light device and executes the respective commands when the devices are turned on or off.
