# Controller example to commission and connect devices

> [!IMPORTANT]
> matter.js as library, along with all related tools (such as the Shell app) and examples, is not certified by the Connectivity Standards Alliance (CSA). They are provided solely to demonstrate the capabilities of our solution and to support testing and development.  Using matter.js does not certify your product — Connectivity Standards Alliance membership and product certification are required to release official Matter devices. For more details, see [A note on certification](https://github.com/matter-js/matter.js/blob/main/README.md#a-note-on-certification).

This example shows basically how a controller could be implemented by showing pairing and connections to a paired device. When there is an OnOff Endpoint with ID 1 then this is controlled and toggled.

## Usage

For general documentation about the CLI parameters or environment variables that can be used for matter.js please refer to the [Examples README](../../README.md#cli-usage).

The current controller implementation is no CLI tool, but shows the pairing of devices and resuming the connection and also showcase the existing low-level controller API. It is just intended to be used for debugging, during development! The code contains some commented-out examples of how to use the low level controller API.
Please **do not** use this for production, we will replace the API soon!

The controller currently is not discovering the device to pair, but directly connects to the IP/port defined bin the command line parameters.

To run from the build files:

```bash
matter-controller --pairingcode=12345678901
```

To run directly from Typescript files with on the fly compilation:

```bash
npm run matter-controller -- --pairingcode=12345678901
```

This will commission a MatterServer device (for debugging/capability showing purpose only for now).

The following parameters are available and used to initially commission a device (they can be omitted after this):
* --fabriclabel: the fabric label to use for commissioning (default: "matter.js Controller")
* If the IP and Port of the device is known (should be only the case in testing cases) you can use the following parameters:
    * --ip: the IP address of the device to commission (can be used but discovery via pairingcode or discriminator or also just passcode is most likely better)
    * --port the port of the device to commission (default: 5540)
* Device identification options:
    * --pairingcode: code to use for pairing (-longDiscriminator and -passcode will be ignored) - usually the code below the QR Code on the device or displayed in the app!
    * --longDiscriminator: the discriminator to use for pairing (default: 3840, value between 0 and 4095)
    * --passcode: the passcode to use for pairing (default: 20202021)
* When the device to commission is not already in the IP network and also not an Ethernet device commission can be done via ble. In this case the following parameters are used:
    * --ble-enable: enable BLE support (default: false) If this is enabled the controller will try to connect via BLE first (15s timeout) and then via IP if not commissioned yet!
    * --ble-hci-id: Optionally, HCI ID to use (Linux only, default 0)
    * --ble-wifi-ssid: SSID/Name of the Wifi network to connect to - The device will scan especially for this network and commissioning will fail if not found
    * --ble-wifi-credentials: Credentials for the Wifi network to connect to
    * --ble-thread-networkname: Name of the Thread network to connect to - The device will verify that a thread network with this name is reachable by the device and commissioning will fail if not found
    * --ble-thread-operationaldataset: Operational dataset as hex string to use for commissioning (of using OTBR use `ot-ctl dataset active -x` to get the value)
