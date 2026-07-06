/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This is simple command line application that demonstrates device control using the @matter/node API.
 *
 * This API is a work in progress and is not yet fully implemented.
 */

import { ServerNode } from "@matter/main";
import { OnOffClient } from "@matter/main/behaviors/on-off";

// Create the controller
const controller = await ServerNode.create({ id: "controller" });

const [command, ...args] = process.argv.slice(2);

switch (command) {
    case "commission":
        // Validation
        if (controller.peers.get("device")) {
            die("There is already a device commissioned");
        }
        if (args.length !== 1) {
            die(`Usage: ${process.argv[0]} commission <pairingcode>`);
        }
        const [pairingCode] = args;

        // This is the actual commissioning
        await controller.peers.commission({ id: "device", pairingCode });

        break;

    case "toggle":
        {
            // Validation
            const endpointNo = Number.parseInt(args[0]);
            if (args.length !== 1 || !Number.isFinite(endpointNo)) {
                die(`Usage: ${process.argv[0]} toggle <endpoint number>`);
            }
            const node = controller.peers.get("device");
            if (node === undefined) {
                die("Cannot toggle because there is no commissioned device");
            }

            // A peer must be online before we can interact with it.  Either start the controller ServerNode (its
            // `online` event starts all peers automatically) or start each peer individually as we do here.
            await node.start();

            const endpoint = node.parts.get(endpointNo);
            if (endpoint === undefined) {
                die(`Cannot toggle because endpoint ${endpointNo} does not exist`);
            }

            // Invocation
            await endpoint.commandsOf(OnOffClient).toggle();
        }

        break;

    case "decommission":
        {
            // Validation
            const node = controller.peers.get("device");
            if (node === undefined) {
                die("Cannot decommission because there is no commissioned device");
            }

            // decommission() talks to the device to remove our fabric, so the peer must be online first (same as
            // toggle).  Use delete() instead if the device is unreachable, but that leaves it factory-reset-pending.
            await node.start();
            await node.decommission();
        }
        break;

    default:
        die(`Unsupported command ${command ?? "(none)"}.  Supported commands: commission, toggle, decommission`);
}

/**
 * Report command line error and exit.
 */
function die(message: string): never {
    console.log(message);
    process.exit(1);
}
