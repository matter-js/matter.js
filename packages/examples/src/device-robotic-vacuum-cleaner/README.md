# Robotic Vacuum Cleaner Example

> [!IMPORTANT]
> matter.js as library, along with all related tools (such as the Shell app) and examples, is not certified by the Connectivity Standards Alliance (CSA). They are provided solely to demonstrate the capabilities of our solution and to support testing and development.  Using matter.js does not certify your product — Connectivity Standards Alliance membership and product certification are required to release official Matter devices. For more details, see [A note on certification](https://github.com/matter-js/matter.js/blob/main/README.md#a-note-on-certification).

This example shows how to run a Robot Vacuum Cleaning device. This is a bit more complex and implements the following 
(fictional) features and state engine:
* Supports Run Modes: Idle, Quick-Clean (one cleaning round), Auto-Clean (3 rounds for one cycle and does cleaning again after 3h)
* Supports Cleaning Modes: Vacuuming and Mopping
* Supports Cleaning Areas: Living Room, Kitchen, Bedroom, Bathroom
* State Engine:
  * One cleaning/mapping round takes 10 minutes
  * Returning to the charger (after Cleaning/Mapping) takes 30s
  * Recharging takes 2 Minutes (always happening when device reached charger)
  * In Auto Mode the RVC is repeating the cleaning after 3h

## Usage

For general documentation about the CLI parameters or environment variables that can be used for matter.js please refer to the [Examples README](../../../examples/README.md#cli-usage).

Execute the following command in the examples root directory

```bash
npm run matter-rvc
```
