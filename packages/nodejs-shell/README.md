# @matter/nodejs-shell - matter.js Node Shell

This project provides a light-weight node.js implementation of a Matter shell application like the chip-tool from the official Matter-SDK.

> This package supports all Node.js LTS versions starting with 18.x

## Install

If you want to install just the shell app then you can do so by running:

```
npm install @matter/nodejs-shell
```

## Run

There are three ways to start matter-node-shell. The `nodenum` parameter provides a unique identifier for the matter-node-shell process mainly to allocate a unique port number. If `nodenum` is not passed, it will default to `0`.
The shell currently just supports Controller side and so the port is not used and the node is always by default a "controller".

```
npx matter-shell <nodenum>
```


Alternatively you can use

```
cd node_modules/@matter/nodejs-shell
npm run shell <nodenum>
```

There are other parameters available to enable BLE and define the HCI device to use. See `npx matter-shell -- --help` for more details.
Please note the extra `--` to separate the npm parameters from the shell parameters!

## matter.js v0.11 Storage adjustment!
In matter.js 0.11 we adjusted the storage to the new environment based one. This means that by default the storage is in the user directory in .matter/shell-XX where XX is the nodeNum you provided as parameter. You can adjust the storage base location with "--storage-path=..." as parameter.

Before matter.js 0.13 it was possible to use a former storage with "--legacyStorage" and the storage will be in the .matter-shell-XX directory in the local directory as before. This option was removed in matter,js 0.13.
To manually convert a storage you can follow the following steps. The described steps assume ./.matter-shell-XX is the old storage and ~/.matter/shell-XX is the new storage location.

* Stop the shell
* Copy ./.matter-shell-XX/0.RootCertificateManager.* to ~/.matter/shell-XX/credentials.*
* Copy ./.matter-shell-XX/0.MatterController.fabric to ~/.matter/shell-XX/credentials.fabric
* Copy ./.matter-shell-XX/0.MatterController.commissionedNodes to ~/.matter/shell-XX/nodes.commissionedNodes
* Copy ./.matter-shell-XX/0.SessionManager.* to ~/.matter/shell-XX/sessions.*
* Copy ./.matter-shell-XX/Node.* to ~/.matter/shell-XX/Node.*

All "0.MatterController.node-*" files from the old storage are not needed to be copied, if existing. They are automatically regenerated on next start.

## General usage

The shell offers and interactive prompt that can execute commands. If you just enter the command name that has sub commands (with or without followed by "help"), it will display the command options. If you enter the command name followed by the options, it will execute the command, with "help" after the command name it will show the detailed help for this command.

e.g. `commission` or `commission help` will display the commissioning command options

### help

Display a list of all top-level commands supported and a brief description.

```
matter-node> help
  commission                               Handle device commissioning
  config                                   Manage global configuration
  session                                  Manage session
  nodes                                    Manage nodes
  ota                                      OTA update operations
  cert                                     Certificate management operations
  subscribe [node-id]                      Subscribe to all events and attributes of a node
  identify [time] [node-id] [endpoint-id]  Trigger Identify command with given time (default 10s). Execute on one node or endpoint, else all onoff clusters will be controlled
  discover                                 Handle device discovery
  attributes                               Read and Write attributes
  events                                   Read events
  commands                                 Invoke commands
  tlv                                      TLV decoding tools
  exit                                     Exit
```

### Help for commands

For every command help can be requested by using the command name, or by adding with `--help` as parameter to any command text.

For instance `config --help` will display all node configuration for the persistent store of the shell.

```
> config
  config loglevel                 Manage Console and File LogLevels
  config logfile                  Manage Logfile path
  config ble-hci                  Manage BLE HCI ID (Linux)
  config wifi-credentials         Manage Wi-Fi credentials used in commissioning process
  config thread-credentials       Manage Thread credentials used in commissioning process
  config dcl-test-certificates    Manage DCL test certificate fetching

Done
```

### Logging

By default the Shell logs messages to the console. The log level can be changed using the `config loglevel` command. The log level can be set to `error`, `warn`, `info`, `debug` or `trace`. The console default is "info".

Additionally the Shell can log to a file. The log file path can be set using the `config logfile` command or as commandline parameter (which will then be persisted in the configuration). The log file always contain the logs in "debug" level.

### DCL Test Certificates

By default, the shell only fetches production certificates from the Distributed Compliance Ledger (DCL). To also fetch test certificates from DCL and development certificates from GitHub, use the `config dcl-test-certificates` command:

```
config dcl-test-certificates set true
config dcl-test-certificates set false
config dcl-test-certificates get
config dcl-test-certificates delete
```

When enabled, the certificate service will fetch:
- Production certificates from DCL
- Test certificates from DCL
- Development certificates from the Matter GitHub repository

When disabled (default), only production certificates from DCL are fetched. Changes require restarting the shell to take effect.

### Commission a device

The shell supports discovery and also commissioning of devices. The commissioning process is based on the Matter SDK and uses the same commissioning process as the chip-tool. The commissioning process is started by the `commission pair` command.

In order to pair a device you need to specify the pairing-code which is printed on the device QR-Code as parameter pairing-code: `commission pair --pairing-code 123456789`. This is the easiest way for all production devices.
For development devices that use the matter standard discriminator and pin code the parameter con be omitted or more details can be provided as parameters (see `commission pair --help` for more details).

If the device should be commissioned via BLE because it is not yet in the IP network you can add the `--ble` parameter. This will start the BLE advertisement and the device can be paired via BLE. BLE is only available when the shell was started with the `--ble` parameter!
When commissioning a device via BLE you also need to setup wifi or thread credentials (based on the device type) that are then used in the commissioning process. This can be done using the `config wifi-credentials` or `config thread-credentials` commands.
IMPORTANT: These credentials are stored unencrypted in the filesystem!

You can also define the node id to pair the device by providing this ID as parameter `commission pair 5000`.

You can commission multiple nodes to the controller.

After a successful commissioning the shell outputs the device name and some information and automatically described to the node and logs potential updates.

### List commissioned nodes

The list of nodes can be listed using `nodes list` command. This will list all nodes that are currently commissioned to the controller and provides some information stored in the controller like name, node-id and a copy of the Basic Information cluster details and latest MDNS discovery data.

### Connect to a node

When fresh starting the shell it do not connect to the commissioned nodes automatically.

Using `nodes connect` the shell tries to connect to all commissioned nodes. Alternatively you can provide a node-id to connect to a specific node (`nodes connect 5000`).

Additional parameters to the connect command are the subscription delays (min/max). So if you want to make sure you get data subscribed use `nodes connect 5000 <min> <max>` with values in seconds.

### Log a Node structure

To see the full node structure of a node you can use the `nodes log` command and provide the node-id as parameter (`nodes log 5000`).

### OTA Update Management

The shell provides comprehensive OTA (Over-The-Air) update management through DCL (Distributed Compliance Ledger) integration and local file operations.

#### Check for OTA updates for a commissioned node

Use `nodes ota check <node-id>` to query the DCL for available OTA updates for a specific commissioned node. The command uses the node's basic information (vendor ID, product ID, current software version) to check for newer firmware versions.

```
nodes ota check 5000
nodes ota check 5000 --mode test
```

Options:
- `--mode <prod|test>`: Specify DCL mode - production (default) or test

The command will display information about available updates including version, file size, and download URL.

#### Download OTA updates for a commissioned node

Use `nodes ota download <node-id>` to check for and download OTA updates from DCL. The downloaded update is validated and stored locally for later use.

```
nodes ota download 5000
nodes ota download 5000 --mode test --force
```

Options:
- `--mode <prod|test>`: Specify DCL mode - production (default) or test
- `--force`: Force re-download even if the update is already cached locally

#### Display OTA image information

Use `ota info <file>` to display detailed information about an OTA image file including vendor ID, product ID, software version, and applicable version ranges.

```
ota info file:///path/to/firmware.bin
ota info fff1-8000-prod
```

The command accepts:
- `file://` prefix: Absolute file path on the filesystem
- No prefix: Storage key for a previously downloaded/imported OTA file

#### List stored OTA images

Use `ota list` to list all OTA images currently stored locally with optional filtering.

```
ota list
ota list --vendor 0xfff1
ota list --vendor 0xfff1 --product 0x8000
ota list --mode test
```

Options:
- `--vendor <vid>`: Filter by vendor ID (hex format like 0xFFF1 or decimal)
- `--product <pid>`: Filter by product ID (hex format like 0x8000 or decimal) - requires --vendor
- `--mode <prod|test>`: Filter by DCL mode (production or test)

#### Add OTA image to storage

Use `ota add <file>` to import a local OTA image file into storage after validation.

```
ota add /path/to/firmware.bin
ota add /path/to/test-firmware.bin --mode test
```

Options:
- `--mode <prod|test>`: Mark the OTA image as production (default) or test mode

The command validates the OTA file format and extracts metadata before storing it.

#### Delete OTA images from storage

Use `ota delete` to remove OTA images from local storage.

```
ota delete fff1-8000-prod
ota delete --vendor 0xfff1
ota delete --vendor 0xfff1 --product 0x8000 --mode test
```

Options:
- `<keyname>`: Delete specific OTA file by storage key
- `--vendor <vid>`: Delete all OTA files for a vendor
- `--product <pid>`: Delete specific product (requires --vendor)
- `--mode <prod|test>`: Specify DCL mode - production (default) or test

#### Copy OTA image to filesystem

Use `ota copy` to export a stored OTA image to the filesystem.

```
ota copy fff1-8000-prod /path/to/output.bin
ota copy 0xfff1 0x8000 prod /path/to/output.bin
```

Both forms are supported:
- `ota copy <keyname> <target>`: Copy by storage key
- `ota copy <vendor-id> <product-id> <mode> <target>`: Copy by vendor/product/mode

If target is a directory, the source keyname is used as the filename.

#### Verify OTA image

Use `ota verify <file>` to validate an OTA image file without extracting the payload. This performs full validation including header parsing and checksum verification.

```
ota verify file:///path/to/firmware.bin
ota verify fff1-8000-prod
```

#### Extract OTA payload

Use `ota extract <file>` to extract and validate the payload from an OTA image file. The payload is written to a new file with "-payload" added to the filename.

```
ota extract /path/to/firmware.bin
```

The extracted payload file will be created at `/path/to/firmware-payload.bin`.

### Certificate Management

The shell provides certificate management operations for PAA (Product Attestation Authority) certificates stored locally. Certificates are automatically fetched from DCL (Distributed Compliance Ledger) and can be managed through the cert commands.

#### List certificates

Use `cert list` to display all stored certificates with their subject key IDs and subject information. Optionally filter by vendor ID.

```
cert list
cert list 0xFFF1
```

The command displays:
- Subject Key ID (unique identifier)
- Subject (certificate subject as text)

For detailed information about a specific certificate, use the `cert details` command.

#### View certificate details

Use `cert details <subject-key-id>` to view detailed metadata about a specific certificate.

```
cert details 6AFD22771F511FECBF1641976710DCDC31A1717E
```

This displays all certificate metadata in JSON format, including subject information, serial number, VID, and more.

#### Get certificate as PEM

Use `cert as-pem <subject-key-id>` to retrieve a certificate in PEM format, which can be saved to a file or used for verification.

```
cert as-pem 6AFD22771F511FECBF1641976710DCDC31A1717E
cert as-pem 6AFD22771F511FECBF1641976710DCDC31A1717E > certificate.pem
```

The PEM format output can be redirected to a file for use with standard certificate tools.

#### Delete certificate

Use `cert delete <subject-key-id>` to remove a certificate from local storage.

```
cert delete 6AFD22771F511FECBF1641976710DCDC31A1717E
```

Note: This only removes the certificate from local storage. Production certificates from DCL will be re-downloaded during the next automatic update cycle.

#### Update certificates from DCL

Use `cert update` to manually trigger an update of certificates from the Distributed Compliance Ledger.

```
cert update
```

This fetches the latest production certificates from DCL and, if configured, also fetches test certificates from DCL and GitHub. The shell automatically performs periodic updates, but this command allows manual updates when needed.

### Commissioning related node operations

To open a commissioning window on a node to allow an additional pairing use `commission open-enhanced-window <node-id>`. When the command was successful the shell outputs the pairing code and a QR code to scan with the relevant pairing App.

To unpair a node use `commission unpair <node-id>`. This will remove the node from the controller and also remove the node from the persistent storage.

### Interact with the node using Attributes, Events and Commands

The shell supports reading and writing attributes (top level command `attributes` or `a` as alias), reading events (`events`/`e`) and invoking commands (`commands`/`c`) on the node. Below these top level commands the full list of the officially defined clusters is available to be used. See the help for the relevant cluster for more details.

For reading attributes also a bulk read for all attributes is supported and with the `by-id` variant you can read and attribute from any cluster including custom clusters.
Attribute reads are done locally (when connected with a subscription and attribute is subscribable) by default. For remote reads (always from the node) add the `--remote` parameter. Unknown attributes or attributes from unknown clusters are always read remotely.

Writing attributes and executing commands (when the request requires data) these can be provided as JSON when it is no simple type. The shell will try to parse the JSON and send the data to the node. Binary data and Numbers >56bit needs to be provided as strings in this JSON and are automatically converted.
For convenience reasons any number in the value to write or invoke data can be provided as hex string by prefixing it with `0x` (e.g. `"0x1234"`) and is then also converted automatically.
When sending complex JSON content ideally use single quotes around the json because double quotes are used to define the JSON content.

Some examples:

-   `attributes basicinformation read all 5000 0` reads all attributes from the Basic Information cluster from node 5000 endpoint 0 (reads values locally when connected with subscription, else remote)
-   `attributes basicinformation read all 5000 0 --remote` reads all attributes from the Basic Information cluster from node 5000 endpoint 0 always from remote (also when connected with a subscription)
-   `attributes basicinformation read nodelabel 5000 0` reads the attribute "nodelabel" from the Basic Information cluster from node 5000 endpoint 0
-   `attributes basicinformation read 0x5 5000 0` reads the attribute "nodelabel" (aliased with it's hex attribute id) from the Basic Information cluster from node 5000 endpoint 0
-   `attributes by-id 0x28 read 0x5 5000 0` also reads the attribute "nodelabel" from the Basic Information cluster from node 5000 endpoint 0, but as generic read from the cluster with id 0x28 (also the decimal value 40 can be used)
-   `attributes basicinformation write nodelabel "My Node" 5000 0` writes the value "My Node" to the attribute "nodelabel" from the Basic Information cluster from node 5000 endpoint 0. Instead of nodelabel also 0x5 as alias can be used.
-   `attributes binding write binding '[{"node": "4568118954124746267" , "cluster": 6 , "endpoint": 1 }]' 5000 1` writes the binding array to the Binding cluster from node 5000 endpoint 1 to create a binding for node 4568118954124746267 to cluster 6 on endpoint 1. Note that the 64bit Node-id (4568118954124746267) needs to be provided as string because it is too big for a number.
-   `attributes binding write binding '[{"node": "4568118954124746267" , "cluster": "0x6" , "endpoint": 1 }]' 5000 1` writes the same binding array as abobe but uses a hex string for the cluster id in the json data
-   `events basicinformation startup 5000 0` reads the details from the startup event from the Basic Information cluster from node 5000 endpoint 0
-   `commands onoff toggle 5000 1` executes the "toggle" command on the OnOff cluster from node 5000 endpoint 1
-   `commands onoff offwitheffect '{"effectIdentifier":0,"effectVariant":0}' 5000 1` executes the "offwitheffect" command on the OnOff cluster from node 5000 endpoint 1 with the given JSON data

### exit

Exit the shell terminal.

```
> exit
Goodbye
```

# Running multiple instances

The matter shell app uses the `node-localstorage` package to persistently store configuration data of each node on disk. In order to run multiple nodes on one machine, start each node with their own `nodenum` so each will create and use their own `.matter-shell-#` directory and use different ports for communication where `#` is the `nodenum` passed from the commandline.

```
# From matter-node-shell top-level
npm run shell 1

# In different terminal
npm run shell 2
```

To delete node state, i.e. factory reset, just delete the `.matter-shell-#` directory of the node:

```
rm -fr .matter-shell-2
```

The contents of the `.matter-shell-#` directory are human-readable, where each field in the key/value store is a separate file in ascii format:

```
$ ls .matter-shell-1
0.MatterController.fabric			0.SessionManager.resumptionRecords
0.MatterController.fabricCommissioned		Node.discriminator
0.MatterController.operationalIpServerAddress	Node.ip
0.RootCertificateManager.nextCertificateId	Node.longDiscriminator
0.RootCertificateManager.rootCertBytes		Node.pin
0.RootCertificateManager.rootCertId		Node.port
0.RootCertificateManager.rootKeyIdentifier	Node.shortDiscriminator
0.RootCertificateManager.rootKeyPair

$ more .matter-shell-1/Node.ip
"fe80::148d:9bd8:5006:243%en0"
```
# Running over websockets

If the matter shell is started with the parameter --webSocketInterface all interaction with the shell will be done over a websocket instead of the local terminal. The parameter --webSocketPort NNNN can be used to change from the default port of 3000 to a user-specified port. If the parameter --webServer is added, the matter shell will also start an http server that will serve files from the same directory as the application itself utilizying the same port as the websocket. The functionality of the shell will be identical to the above description with the exception that the "exit" command will only close the websocket and not exit the matter shell application.

An example application that shows interaction from a web browser is included. The example shows how commands can be sent from html and javascript in the browser to the shell and how the results of the commands can be parsed to create a user interface. 

![Web Interface](src/shell/webassets/WebShell.png "Example Application")
```
          █
          █
      ▄   █   ▄
      ▀▀█████▀▀
    ▀█▄       ▄█▀
      ▀█▄   ▄█▀
   ▄██▀▀█   █▀▀██▄
  ▀▀    █   █    ▀▀
```
