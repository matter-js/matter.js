# Temperature/Humidity sensor with a CLI command interface to get the value

> [!IMPORTANT]
> matter.js as library, along with all related tools (such as the Shell app) and examples, is not certified by the Connectivity Standards Alliance (CSA). They are provided solely to demonstrate the capabilities of our solution and to support testing and development.  Using matter.js does not certify your product — Connectivity Standards Alliance membership and product certification are required to release official Matter devices. For more details, see [A note on certification](https://github.com/matter-js/matter.js/blob/main/README.md#a-note-on-certification).

This example shows how to build a simple Sensor device with a temperature (default) or humidity (`--type humidity`) sensor. The sensor values are updated by default every 60 seconds, or the number of seconds specified via the CLI parameter `--interval`. The value can be defined by the output of a CLI script provided via parameter `--value` or, if no command is specified, are randomly set in the interval -50..+50. To read the Temperature of a Raspberry Pi as example use `--value ="echo \$((\$(</sys/class/thermal/thermal_zone0/temp)/10))"` or to read temperature of your location `--value="curl -s 'wttr.in/?format=%t\&m' | sed 's/°C//'| awk '{print \$1*100}'"` (or use `?format=%h` for humidity).

## Usage

For general documentation about the CLI parameters or environment variables that can be used for matter.js please refer to the [Examples README](../../../examples/README.md#cli-usage).

Execute the following command in the examples root directory

```bash
npm run matter-sensor
```
