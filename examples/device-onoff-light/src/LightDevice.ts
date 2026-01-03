#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// This demonstrates bringing a "light" device online with matter.js.

import { ServerNode } from "@matter/main";
import { OnOffLightDevice, OnOffLightRequirements } from "@matter/main/devices/on-off-light";

// Matter exposes functionality in groups called "clusters".  For this example device we override the matter.js "On/Off"
// cluster implementation to print status to the console.
class ReportingOnOffServer extends OnOffLightRequirements.OnOffServer {
    // Intercept the "on" command to the Matter On/Off cluster to print a log message.
    override async on() {
        console.log("Turning light ON");
        await super.on();
    }

    // This is the functional inverse of on() above.
    //
    // For demonstration purposes we update state ourselves rather than deferring to matter.js's default "off" handler
    // via super.off().
    override off() {
        console.log("Turning light OFF");
        this.state.onOff = false;
    }

    // Use event handlers to log on/off state reactively, after it changes.
    override initialize() {
        this.events.onOff$Changed.on(value => {
            console.log(`Light is now ${value ? "ON" : "OFF"}`);
        });
    }
}

// Devices are compositions of behaviors like OnOffServer above.  To extend an existing device you use builder methods.
//
// In this case we are using with() to install our On/Off cluster behavior.
const ExampleLight = OnOffLightDevice.with(ReportingOnOffServer);

// Physical devices appear as "nodes" on a Matter network.  As a device implementer you use a NodeServer to bring a
// device online.
//
// Note there are a large number of options to NodeServer that we are allowing to take default values here.  See
// IlluminatedRollerShade.ts for a more detailed example.
const node = await ServerNode.create();

// Nodes are a composition of endpoints.  Add a single endpoint to the node, our example light device.
await node.add(ExampleLight);

// Our device is now built and we can bring the node online.
//
// Note that you may serve multiple nodes from a single process.  We only have one, however, so we can use the run()
// method of the node.
await node.run();
