/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdClient, IcdMultiAdminError } from "@matter/node";
import { NodeId, SubjectId, VendorId } from "@matter/types";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import type { Argv } from "yargs";
import { MatterNode } from "../MatterNode.js";

async function clientNodeFor(theNode: MatterNode, nodeIdStr: string) {
    const paired = (await theNode.connectAndGetNodes(nodeIdStr))[0];
    if (paired === undefined) {
        throw new Error(`Node ${nodeIdStr} not found / not connected`);
    }
    const clientNode = paired.node;
    if (!clientNode.behaviors.has(IcdClient)) {
        throw new Error(`Node ${nodeIdStr} is not an ICD device (no IcdManagement cluster)`);
    }
    return clientNode;
}

export default function commands(theNode: MatterNode) {
    return {
        command: "icd",
        describe: "Controller-side ICD (Intermittently Connected Device) operations",
        builder: (yargs: Argv) =>
            yargs
                .command({
                    command: "register <node-id>",
                    describe: "Register this controller as a Check-In client on the peer",
                    builder: (y: Argv) =>
                        y
                            .positional("node-id", { describe: "node id", type: "string", demandOption: true })
                            .option("subject", { describe: "monitored subject id", type: "string" })
                            .option("type", {
                                describe: "client type",
                                choices: ["permanent", "ephemeral"] as const,
                                default: "permanent" as const,
                            })
                            .option("allow-multi-admin", {
                                describe: "allow registering alongside other-vendor admins",
                                type: "boolean",
                                default: false,
                            })
                            .option("ignore-vendor", {
                                describe: "vendor id(s) to treat as trusted",
                                type: "array",
                            }),
                    handler: async (argv: any) => {
                        const clientNode = await clientNodeFor(theNode, argv.nodeId);
                        const options = {
                            monitoredSubject:
                                argv.subject === undefined ? undefined : SubjectId(NodeId(BigInt(argv.subject))),
                            clientType:
                                argv.type === "ephemeral"
                                    ? IcdManagement.ClientType.Ephemeral
                                    : IcdManagement.ClientType.Permanent,
                            allowMultiAdmin: argv.allowMultiAdmin,
                            ignoredVendors: argv.ignoreVendor?.map((v: string | number) => VendorId(Number(v))),
                        };
                        try {
                            await clientNode.act(agent => agent.get(IcdClient).register(options));
                            console.log(`Registered as Check-In client on node ${argv.nodeId}`);
                        } catch (e) {
                            if (e instanceof IcdMultiAdminError) {
                                console.log(
                                    `Refused: peer has other-vendor admins (${e.adminVendorIds.join(", ")}). Re-run with --allow-multi-admin to proceed.`,
                                );
                                return;
                            }
                            throw e;
                        }
                    },
                })
                .command({
                    command: "unregister <node-id>",
                    describe: "Remove this controller's Check-In registration from the peer",
                    builder: (y: Argv) =>
                        y.positional("node-id", { describe: "node id", type: "string", demandOption: true }),
                    handler: async (argv: any) => {
                        const clientNode = await clientNodeFor(theNode, argv.nodeId);
                        await clientNode.act(agent => agent.get(IcdClient).unregister());
                        console.log(`Unregistered Check-In client on node ${argv.nodeId}`);
                    },
                })
                .demandCommand(1, "You must specify an icd subcommand"),
        handler: async (argv: any) => {
            argv.unhandled = true;
        },
    };
}
