# Multiple OnOff light/socket nodes in one process with a CLI command execution interface

> [!IMPORTANT]
> matter.js as library, along with all related tools (such as the Shell app) and examples, is not certified by the Connectivity Standards Alliance (CSA). They are provided solely to demonstrate the capabilities of our solution and to support testing and development.  Using matter.js does not certify your product — Connectivity Standards Alliance membership and product certification are required to release official Matter devices. For more details, see [A note on certification](https://github.com/matter-js/matter.js/blob/main/README.md#a-note-on-certification) for more details.

This example shows how to start multiple Matter nodes on one MatterServer where each node is run on its own Port, but share a single MDNS broadcaster and scanner in order to optimize resources. Each node can be configured via CLI to be an onoff socket or a light. CLI. Options also allow specification of shell commands to be executed for on and off commands.

matter.js also allows it to start multiple devices in one process. With this especially the MDNS functionalities are shared between these processes and it should use less resources. How many devices you acn add in one process depends on the load they produce and how many devices run in the single Node.js thread.

## Usage

For general documentation about the CLI parameters or environment variables that can be used for matter.js please refer to the [Examples README](../../../examples/README.md#cli-usage).

The parameters are like with the composed device or bridge.

```bash
matter-multidevice --type=socket --num=2 --on1="echo 255 > /sys/class/leds/led1/brightness" --off1="echo 0 > /sys/class/leds/led1/brightness" --type2=socket --on2="echo 255 > /sys/class/leds/led2/brightness" --off2="echo 0 > /sys/class/leds/led2/brightness"
```

or when starting from TS files:

```bash
npm run matter-multidevice -- --type=socket --num=2 --on1="echo 255 > /sys/class/leds/led1/brightness" --off1="echo 0 > /sys/class/leds/led1/brightness" --type2=socket --on2="echo 255 > /sys/class/leds/led2/brightness" --off2="echo 0 > /sys/class/leds/led2/brightness"
```
(Please note the "--" to separate commandline parameters between the npm run and the executed script.

The above command exposes two single light devices (one socket and on light) and executes the respective commands when the devices are turned on or off.

**If you want to start multiple parallel processes please make sure to use different storage locations, different network port and ideally also different passcodes for each process!**
