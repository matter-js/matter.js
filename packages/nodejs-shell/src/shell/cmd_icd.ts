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
import { NodeStates, PairedNode } from "@project-chip/matter.js/device";
import type { Argv } from "yargs";
import { MatterNode } from "../MatterNode.js";

const watchers = new Map<string, ObserverGroup>();

async function printStatus(paired: PairedNode) {
    const clientNode = paired.node;
    if (!clientNode.behaviors.has(IcdClient)) {
        if (!paired.initialized) {
            console.log(`node ${paired.nodeId}: uninitialized (no cached data yet)`);
        }
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
    const marker = paired.initialized ? "" : " [uninitialized]";
    console.log(
        [
            `node ${paired.nodeId}:${marker}`,
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

async function pairedNodeFor(theNode: MatterNode, nodeIdStr: string) {
    const paired = (await theNode.connectAndGetNodes(nodeIdStr))[0];
    if (paired === undefined) {
        throw new Error(`Node ${nodeIdStr} not found / not connected`);
    }
    if (!paired.node.behaviors.has(IcdClient)) {
        throw new Error(`Node ${nodeIdStr} is not an ICD device (no IcdManagement cluster)`);
    }
    return paired;
}

async function clientNodeFor(theNode: MatterNode, nodeIdStr: string) {
    return (await pairedNodeFor(theNode, nodeIdStr)).node;
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
                        y
                            .positional("node-id", { describe: "node id", type: "string", demandOption: true })
                            .option("force", {
                                describe:
                                    "forget the registration locally without contacting the peer (escape hatch for an unreachable LIT ICD)",
                                type: "boolean",
                                default: false,
                            }),
                    handler: async (argv: any) => {
                        if (argv.force) {
                            // A registered-but-unreachable LIT peer parks every connecting/peer-I/O path on its
                            // never-coming Check-In; reach it via the non-connecting accessor and forget() locally.
                            await theNode.start();
                            const clientNode = (await theNode.controller.getNode(NodeId(BigInt(argv.nodeId)))).node;
                            if (!clientNode.behaviors.has(IcdClient)) {
                                throw new Error(`Node ${argv.nodeId} is not an ICD device (no IcdManagement cluster)`);
                            }
                            await clientNode.act(agent => agent.get(IcdClient).forget());
                            console.log(
                                `Forgot Check-In registration for node ${argv.nodeId} locally (peer not contacted)`,
                            );
                            return;
                        }
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
                        // getNode() never awaits remote init, unlike connectAndGetNodes(), so a peer stuck mid-read can't hang this command.
                        await theNode.start();
                        const nodeIds =
                            argv.nodeId !== undefined
                                ? [NodeId(BigInt(argv.nodeId))]
                                : theNode.controller.getCommissionedNodes();
                        if (nodeIds.length === 0) {
                            console.log("No commissioned nodes.");
                            return;
                        }
                        for (const nodeId of nodeIds) {
                            try {
                                await printStatus(await theNode.controller.getNode(nodeId));
                            } catch (e) {
                                const message = e instanceof Error ? e.message : String(e);
                                console.log(`node ${nodeId}: unavailable (${message})`);
                            }
                        }
                    },
                })
                .command({
                    command: "watch <node-id> [state]",
                    describe:
                        "Stream ICD events for a peer live (state: on|off, default on), including awake, nextCheckIn and connection state",
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
                        const paired = await pairedNodeFor(theNode, argv.nodeId);
                        const clientNode = paired.node;
                        const observers = new ObserverGroup();
                        const stamp = (msg: string) => console.log(`[icd ${argv.nodeId}] ${msg}`);
                        // Fresh awake/nextCheckIn read; the event emitters discard emit()'s promise, so a rejection here must not escape.
                        const wakefulnessSuffix = async () => {
                            try {
                                const { nextCheckIn, awake } = await clientNode.act(agent => {
                                    const icd = agent.get(IcdClient);
                                    return { nextCheckIn: icd.nextExpectedCheckin, awake: icd.awake };
                                });
                                return `nextCheckIn=${nextCheckIn} awake=${awake}`;
                            } catch (e) {
                                return `wakefulness read failed: ${e instanceof Error ? e.message : String(e)}`;
                            }
                        };
                        const events = clientNode.eventsOf(IcdClient);
                        observers.on(events.registered, () => stamp("registered"));
                        observers.on(events.unregistered, () => stamp("unregistered"));
                        observers.on(events.checkedIn, async ({ counter, activeModeThreshold }) =>
                            stamp(
                                `check-in counter=${counter} SAT(ms)=${activeModeThreshold} ${await wakefulnessSuffix()}`,
                            ),
                        );
                        observers.on(events.checkInMissed, async () =>
                            stamp(`check-in MISSED ${await wakefulnessSuffix()}`),
                        );
                        observers.on(events.keyRefreshed, () => stamp("key refreshed"));
                        observers.on(events.available$Changed, (value: boolean) => stamp(`available=${value}`));
                        observers.on(paired.events.stateChanged, state =>
                            stamp(`connection=${NodeStates[state] ?? state}`),
                        );
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
