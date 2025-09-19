# OnOff light/socket device with BLE support and advanced API usage

> [!IMPORTANT]
> matter.js as library, along with all related tools (such as the Shell app) and examples, is not certified by the Connectivity Standards Alliance (CSA). They are provided solely to demonstrate the capabilities of our solution and to support testing and development.  Using matter.js does not certify your product — Connectivity Standards Alliance membership and product certification are required to release official Matter devices. For more details, see [A note on certification](https://github.com/matter-js/matter.js/blob/main/README.md#a-note-on-certification) for more details.

This example shows how to build a simple Device node with just one socket or light endpoint. The shell commands to be executed by on/off commands can be configured via CLI. Additionally, this example also shows the following use cases:
- it shows how to enable BLE for a device node and tweaks the announcement so that BLE is only announced in the beginning.
-it includes a dummy WifiNetworkCommissioning and a dummy ThreadNetworkCommissioning implementation that simulates Wi-Fi/Thread logic for the commissioner and logs the Wi-Fi/Thread credentials the commissioner sends to the device.
- it enhances the GeneralDiagnostics and OnOff cluster to implement some commands with its own logic.
- it defines the ["My Fancy Functionality" custom cluster](./cluster/MyFancyOwnFunctionality.ts) and adds this to the OnOff endpoint as additional cluster when the chosen vendorId is set to 0xfff4 (65524)
- it implements the callbacks where developers can get information on commissioning changes and session/connection changes to better know the status of the node.

## Usage

For general documentation about the CLI parameters or environment variables that can be used for matter.js please refer to the [Examples README](../../../examples/README.md#cli-usage).

The CLI parameter are else documented at the [Device Node Readme](../device-onoff/README.md).

This example is not exposed as npm script so starting requires to run the ts file or the build file.

```bash
node .dist/examples/device-onoff-advanced-cli/DeviceNodeFull.js
```

## How to test BLE commissioning
For this to work you first of all need to enable BLE by using `--ble-enable` to enable the BLE only commissioning. The device simulates that it is not on any IP network for the start.
Please also make sure you follow the [BLE enablement steps for your operating system](../../../nodejs-ble/README.md#prerequisites-and-limitations).

The following parameters are available:
* --ble-enable: enable BLE support (default: false) If this is enabled the device will announce itself _only_ via BLE if not commissioned and also presents a "Wifi only" device for commissioning to show this feature!
* --ble-hci-id=...: Optionally, HCI ID to use (Linux only, default 0)

Additionally, you need to choose if the device should simulate a Thread or a Wifi enabled device. This can be done by adding `--ble-fake-wifi` or `--ble-fake-thread` to the command line. Then a dummy WifiNetworkCommissioning or ThreadNetworkCommissioning cluster is added to the device node.

Depending on the method you chose you probably need to also add additional parameters for either Wifi or thread which are returned when the device is asked to scn for available networks.

For Wifi the parameters to use are:
* --ble-wifi-scanSsid=...: The Wi-Fi SSID returned by the "ScanNetworks" call of the Wifi Network commissioning cluster used when using BLE commissioning (default: "TestSSID"). Ideally use a really existing SSID that also the commissioner (Apple, Alexa, ...) knows to make it easier to commission. Else you could get errors while commissioning.
* --ble-wifi-scanBssid=...: The Wi-Fi BSSID returned by the "ScanNetworks" call of the Wifi Network commissioning cluster used when using BLE commissioning (default: "00:00:00:00:00:00").

For Thread the parameters to use are:
* --ble.thread.panId=...: The PAN ID to use for the Thread network
* --ble.thread.extendedPanId=...: The extended PAN ID to use for the Thread network
* --ble.thread.networkName=...: The network name to use for the Thread network
* --ble.thread.channel=...: The channel to use for the Thread network
* --ble.thread.address=...: The address to use for the Thread network
Thread parameters are as of now only needed when commissioning with Amazon because the others are currently not scanning for Thread networks.
