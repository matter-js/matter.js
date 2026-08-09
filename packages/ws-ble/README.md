# @matter/ws-ble - BLE-over-WebSocket proxy for matter.js

This is a matter.js plugin that proxies BLE GATT access for Matter commissioning over a
WebSocket connection, letting a matter.js controller reach BLE peripherals attached to a remote
host. The wire protocol (v1) is wire-compatible with existing matterjs-server deployments,
including its Python reference proxy client.

## Security

**The proxy endpoint is unauthenticated by design.** Any peer that can reach it gains BLE radio
access on every proxy client connected to the hub — scanning, connecting, and reading/writing
GATT characteristics. `BleProxyHandler` and `ProxyConnection` perform no authentication of their
own.

The embedder that hosts the WebSocket endpoint is responsible for securing it: put
authentication in front of the upgrade, isolate the network it is reachable on, or front it with
a reverse proxy. If you run the `matter-ble-proxy` reference client, never point it at a hub port
that is exposed without one of these protections.

## Architecture

The **hub** is the WebSocket server side. It runs next to the matter.js controller (for example
inside matterjs-server) and exposes a `/ble` WebSocket endpoint. `BleProxyHandler` accepts any
number of proxy client connections there, and `ProxyBle` (a `Ble` implementation) lets the
controller drive BLE scanning and GATT operations through it as if the hardware were local.

A **proxy client** dials in from wherever the actual Bluetooth adapter lives — a Raspberry Pi
next to the devices being commissioned, a container with `hci0` attached, and so on. It executes
the commands the hub sends (scan, connect, read, write, subscribe) against the local adapter and
reports results and notifications back.

Each discovered peripheral is owned by exactly one proxy client (the one that reports it first,
or a client that takes over if the owner disconnects). The hub can hold connections from
multiple proxy clients at once; commands for a given peripheral route only to its owner. Multiple
BLE-capable hosts can therefore extend one controller's radio range.

```
matter.js controller (ProxyBle)
          │
          │ WebSocket, path "/ble"
          ▼
BleProxyHandler (hub)
   │                    │
   │ WebSocket          │ WebSocket
   ▼                    ▼
proxy client            proxy client
(hci0)                  (hci1)
```

## Hub usage

The hub side needs a WebSocket upgrade path and a `BleProxyHandler` to accept connections on it.
Route WebSocket upgrades for the `/ble` path to `handler.accept(...)`, then register a
`ProxyBle` so the controller uses the proxy instead of local BLE hardware:

```ts
import { Environment, HttpEndpointFactory } from "@matter/general";
import "@matter/nodejs-ws"; // registers the WS adapter; transitively bootstraps the Node environment via @matter/nodejs
import { Ble } from "@matter/protocol";
import { BleProxyHandler, ProxyBle } from "@matter/ws-ble";

const handler = new BleProxyHandler();

const endpoint = await Environment.default.get(HttpEndpointFactory).create({ address: "http://0.0.0.0:5580" });
endpoint.ws = async (request, upgrade) => {
    if (new URL(request.url).pathname !== "/ble") return;
    handler.accept(await upgrade());
};

Environment.default.set(Ble, new ProxyBle(handler, Environment.default));
```

`ProxyBle` only implements central (client) mode; peripheral operations throw. Call
`handler.close()` and `ble.close()` on shutdown to close all proxy client connections.

## Hardware client (proxy)

`NobleBleProxyClient` is the reference proxy client: it connects out to the hub and drives a
local Bluetooth adapter via `@stoprocent/noble`.

```ts
import { NobleBleProxyClient } from "@matter/ws-ble/noble-client";

const client = new NobleBleProxyClient({ serverUrl: "ws://hub-host:5580/ble", hciId: 0 });
await client.connect();
// ... runs until the hub disconnects or client.close() is called
```

The package also installs a `matter-ble-proxy` CLI for running the reference client as a
standalone process — `matter-ble-proxy` on `PATH` after a global install, or
`node_modules/.bin/matter-ble-proxy` when installed as a project dependency:

```
matter-ble-proxy --server ws://hub-host:5580/ble [--hci-id 0]
```

- `--server <url>` — BLE proxy WebSocket URL of the hub (required)
- `--hci-id <id>` — Bluetooth adapter HCI ID, e.g. `0` for `hci0` (Linux only)
- `--help`, `-h` — show usage

The CLI exits on `SIGINT`/`SIGTERM` and on hub disconnect, so it is meant to run under a
supervisor that restarts it.

## Protocol summary

The BLE proxy protocol (version 1, `BLE_PROXY_PROTOCOL_VERSION`) layers a BLE-specific
command/event vocabulary on top of the generic WS-proxy framing shared with other proxies
(`@matter/general`'s `net/ws-proxy`: hello handshake, JSON command/response, JSON events, and a
binary frame format). A connection opens with a `hello`/`hello_response` exchange that pins the
protocol version before either side sends commands.

| Kind | Names |
| --- | --- |
| Commands (12) | `start_scan`, `stop_scan`, `connect`, `disconnect`, `discover_services`, `discover_characteristics`, `read_characteristic`, `write_characteristic`, `subscribe_characteristic`, `write_and_subscribe`, `unsubscribe_characteristic`, `request_mtu` |
| Events (4) | `device_discovered`, `disconnected`, `scan_stopped`, `characteristic_notification` |

Binary frames carry high-throughput GATT traffic (writes, notifications, read responses) outside
the JSON envelope. Layout: `[1 byte opcode][2 bytes handle, big-endian][payload]`.

| Opcode | Direction | Meaning |
| --- | --- | --- |
| `0x01` | hub → client | write payload to the active write characteristic |
| `0x02` | client → hub | notification data from a subscribed characteristic |
| `0x03` | client → hub | response data for a `read_characteristic` command |

See `src/BleProxyProtocol.ts` for the full command argument/result shapes and error codes. A
Python implementation of the proxy client protocol lives in matterjs-server as its hardware
client.

## Building

- `npm run build`: Build all code and create CommonJS and ES6 variants in dist directory. This
  will build incrementally and only build the changed files.
- `npm run build-clean`: Clean the dist directory and build all code from scratch

## Testing

- `npm run test`: Run the package's test suite
