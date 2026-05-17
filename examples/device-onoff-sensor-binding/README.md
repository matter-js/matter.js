# OnOff Light with Occupancy Sensor Binding Example

This example demonstrates the cluster-client binding workflow for an OnOff Light that reacts to a
remote occupancy sensor.

## Overview

The device exposes a single **OnOff Light** endpoint (`OnOffLightDevice`) with:

- `OnOffServer` — standard light behavior.
- `OccupancySensingClient` — optional client cluster, permitted by the Matter spec (§ 4.1) for
  light devices, declared so `BindingManager` can resolve occupancy sensor bindings.
- `BindingServer` — enables binding table management.

## Binding workflow

A controller writes a `Binding.Target` entry on this endpoint pointing at an occupancy sensor
endpoint on a remote node.  Once the remote node is online:

1. `BindingManager` resolves the entry and fires `BindingServer.events.established` with
   `kind="client"`.
2. The application handler subscribes to `occupancy$Changed` on the bound remote endpoint.
3. When the sensor reports occupied, the local light turns on.
4. When the binding is removed, the subscription is torn down.

Group bindings (`kind="group"`) and self-bindings (`kind="server"`) are logged and ignored in this
example.

## Running

```bash
npm run build
npm run device-onoff-sensor-binding
```

Commission the node with a Matter controller.  Then write a Binding entry on endpoint 1 that points
at an occupancy sensor node/endpoint.  Watch the console for occupancy-driven on messages.
