import { ServerNode } from "@matter/main";
import { OnOffLightDevice } from "@matter/main/devices/on-off-light";

// Create the "node".  In Matter a "node" is a standalone device
const node = await ServerNode.create();

// Create the light "endpoint".  In Matter an "endpoint" is a component of a node
const light = await node.add(OnOffLightDevice);

// Add an event handler to log the light's current status
light.events.onOff.onOff$Changed.on(value => console.log(`Light is now ${value}`));

// Run our server
await node.start();
