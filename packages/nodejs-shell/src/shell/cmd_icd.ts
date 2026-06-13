/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Millis, ObserverGroup } from "@matter/general";
import { IcdClient, IcdMultiAdminError, litSupported } from "@matter/node";
import { IcdManagementClient } from "@matter/node/behaviors/icd-management";
import { NodeId, SubjectId, VendorId } from "@matter/types";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import { PairedNode } from "@project-chip/matter.js/device";
import type { Argv } from "yargs";
import { MatterNode } from "../MatterNode.js";

const watchers = new Map<string, ObserverGroup>();

async function printStatus(paired: PairedNode) {
    const clientNode = paired.node;
    if (!clientNode.behaviors.has(IcdClient)) {
        return;
    }
    const icd = clientNode.stateOf(IcdClient);
    const mgmt = clientNode.maybeStateOf(IcdManagementClient);
    const supportsLit = litSupported(clientNode);
    const awake = await clientNode.act(agent => agent.get(IcdClient).awake);
    const operatingModeLabel =
        mgmt === undefined
            ? "n/a"
            : (IcdManagement.OperatingMode[mgmt.operatingMode ?? -1] ?? mgmt.operatingMode ?? "unknown");
    console.log(
        [
            `node ${paired.nodeId}:`,
            `  registered=${icd.registered}`,
            `  available=${icd.available}`,
            `  awake=${awake}`,
            `  supportsLit=${supportsLit}`,
            `  operatingMode=${operatingModeLabel}`,
            `  activeModeThreshold(ms)=${mgmt?.activeModeThreshold ?? "n/a"}`,
            `  idleModeDuration(s)=${mgmt?.idleModeDuration ?? "n/a"}`,
            `  lastCheckIn=${icd.lastCheckInReceivedAt ?? "never"}`,
            `  counterStart=${icd.counterStart ?? "n/a"} lastOffset=${icd.lastOffset ?? "n/a"}`,
        ].join("\n"),
    );
}

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
                .command({
                    command: "stay-active <node-id> [duration-ms]",
                    describe: "Ask the peer to stay in Active mode; prints the promised duration",
                    builder: (y: Argv) =>
                        y
                            .positional("node-id", { describe: "node id", type: "string", demandOption: true })
                            .positional("duration-ms", {
                                describe: "requested active duration (ms)",
                                type: "number",
                                default: 30000,
                            }),
                    handler: async (argv: any) => {
                        const clientNode = await clientNodeFor(theNode, argv.nodeId);
                        const promised = await clientNode.act(agent =>
                            agent.get(IcdClient).stayActive(Millis(argv.durationMs)),
                        );
                        console.log(`Node ${argv.nodeId} promised active for ${Duration.format(promised)}`);
                    },
                })
                .command({
                    command: "status [node-id]",
                    describe: "Show ICD state for one peer, or all ICD peers if no id",
                    builder: (y: Argv) =>
                        y.positional("node-id", { describe: "node id", type: "string", default: undefined }),
                    handler: async (argv: any) => {
                        const nodes = await theNode.connectAndGetNodes(argv.nodeId);
                        for (const paired of nodes) {
                            await printStatus(paired);
                        }
                    },
                })
                .command({
                    command: "watch <node-id> [state]",
                    describe:
                        "Stream ICD events for a peer live (state: on|off, default on); awake is shown by `icd status`",
                    builder: (y: Argv) =>
                        y
                            .positional("node-id", { describe: "node id", type: "string", demandOption: true })
                            .positional("state", {
                                describe: "on|off",
                                choices: ["on", "off"] as const,
                                default: "on" as const,
                            }),
                    handler: async (argv: any) => {
                        const key = String(argv.nodeId);
                        watchers.get(key)?.close();
                        watchers.delete(key);
                        if (argv.state === "off") {
                            console.log(`Stopped watching node ${argv.nodeId}`);
                            return;
                        }
                        const clientNode = await clientNodeFor(theNode, argv.nodeId);
                        const observers = new ObserverGroup();
                        const stamp = (msg: string) => console.log(`[icd ${argv.nodeId}] ${msg}`);
                        const events = clientNode.eventsOf(IcdClient);
                        observers.on(events.registered, () => stamp("registered"));
                        observers.on(events.unregistered, () => stamp("unregistered"));
                        observers.on(events.checkedIn, ({ counter, activeModeThreshold }) =>
                            stamp(`check-in counter=${counter} SAT(ms)=${activeModeThreshold}`),
                        );
                        observers.on(events.keyRefreshed, () => stamp("key refreshed"));
                        observers.on(events.available$Changed, (value: boolean) => stamp(`available=${value}`));
                        watchers.set(key, observers);
                        // Drop the watcher when the node goes away so it doesn't leak in the map.
                        clientNode.lifecycle.destroyed.once(() => {
                            watchers.get(key)?.close();
                            watchers.delete(key);
                        });
                        console.log(`Watching node ${argv.nodeId} (run \`icd watch ${argv.nodeId} off\` to stop)`);
                    },
                })
                .demandCommand(1, "You must specify an icd subcommand"),
        handler: async (argv: any) => {
            argv.unhandled = true;
        },
    };
}
