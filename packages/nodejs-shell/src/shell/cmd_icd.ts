/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, ImplementationError, Millis, ObserverGroup } from "@matter/general";
import { ClientNode, IcdClient, IcdMultiAdminError, NodeConnectionState } from "@matter/node";
import { IcdManagementClient } from "@matter/node/behaviors/icd-management";
import { NodeId, SubjectId, VendorId } from "@matter/types";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import type { Argv } from "yargs";
import { MatterNode } from "../MatterNode.js";

const watchers = new Map<string, ObserverGroup>();

/** Look up a commissioned peer by node id without connecting or awaiting remote initialization. */
function findCommissionedNode(theNode: MatterNode, nodeId: NodeId): ClientNode | undefined {
    return theNode.node.peers.commissioned.find(peer => peer.peerAddress?.nodeId === nodeId);
}

async function printStatus(nodeId: NodeId, clientNode: ClientNode) {
    if (!clientNode.behaviors.has(IcdClient)) {
        if (!clientNode.lifecycle.isSeeded) {
            console.log(`node ${nodeId}: uninitialized (no cached data yet)`);
        }
        return;
    }
    const icd = clientNode.stateOf(IcdClient);
    const mgmt = clientNode.maybeStateOf(IcdManagementClient);
    const supportsLit = IcdClient.litSupported(clientNode);
    const awake = await clientNode.act(agent => agent.get(IcdClient).awake);
    const operatingModeLabel =
        mgmt === undefined
            ? "n/a"
            : (IcdManagement.OperatingMode[mgmt.operatingMode ?? -1] ?? mgmt.operatingMode ?? "unknown");
    const marker = clientNode.lifecycle.isSeeded ? "" : " [uninitialized]";
    console.log(
        [
            `node ${nodeId}:${marker}`,
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

/** The reserved node-id token that targets every commissioned node. */
const ALL_NODES = "all";

function selectsAll(nodeIdStr: string) {
    return nodeIdStr.toLowerCase() === ALL_NODES;
}

/** Resolve a node-id argument to concrete ids: `all` expands to every commissioned node, otherwise a single id. */
async function targetNodeIds(theNode: MatterNode, nodeIdStr: string): Promise<NodeId[]> {
    await theNode.start();
    if (!selectsAll(nodeIdStr)) {
        return [NodeId(BigInt(nodeIdStr))];
    }
    return theNode.node.peers.commissioned
        .map(peer => peer.peerAddress?.nodeId)
        .filter((nodeId): nodeId is NodeId => nodeId !== undefined);
}

/**
 * Run `action` for each targeted node. A single explicit id surfaces its error to the caller; `all` is best-effort,
 * reporting per-node failures and continuing so one unreachable peer does not abort the rest.
 */
async function eachNode(theNode: MatterNode, nodeIdStr: string, action: (nodeId: NodeId) => Promise<void>) {
    const all = selectsAll(nodeIdStr);
    const nodeIds = await targetNodeIds(theNode, nodeIdStr);
    if (nodeIds.length === 0) {
        console.log("No commissioned nodes.");
        return;
    }
    for (const nodeId of nodeIds) {
        try {
            await action(nodeId);
        } catch (e) {
            if (!all) {
                throw e;
            }
            console.log(`node ${nodeId}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

/** Connect to `nodeId` and verify it exposes IcdManagement, throwing an {@link ImplementationError} otherwise. */
async function connectedIcdNode(theNode: MatterNode, nodeId: NodeId): Promise<ClientNode> {
    const clientNode = (await theNode.connectAndGetNodes(String(nodeId)))[0];
    if (clientNode === undefined) {
        throw new ImplementationError(`Node ${nodeId} not found / not connected`);
    }
    // Behaviors populate as part of seeding; await it so a not-yet-seeded peer isn't misread as non-ICD.
    if (!clientNode.lifecycle.isSeeded) {
        await clientNode.lifecycle.seeded;
    }
    if (!clientNode.behaviors.has(IcdClient)) {
        throw new ImplementationError(`Node ${nodeId} is not an ICD device (no IcdManagement cluster)`);
    }
    return clientNode;
}

function stopWatch(nodeIdStr: string) {
    if (selectsAll(nodeIdStr)) {
        for (const observers of watchers.values()) {
            observers.close();
        }
        watchers.clear();
        console.log("Stopped watching all nodes");
        return;
    }
    // Normalize through NodeId so the key matches startWatch's regardless of the id's textual form (e.g. 0x2f vs 47).
    const key = String(NodeId(BigInt(nodeIdStr)));
    watchers.get(key)?.close();
    watchers.delete(key);
    console.log(`Stopped watching node ${nodeIdStr}`);
}

async function startWatch(theNode: MatterNode, nodeId: NodeId) {
    const key = String(nodeId);
    watchers.get(key)?.close();
    watchers.delete(key);

    const clientNode = await connectedIcdNode(theNode, nodeId);
    const observers = new ObserverGroup();
    const stamp = (msg: string) => console.log(`[icd ${nodeId}] ${msg}`);
    // Event emitters discard emit()'s promise, so a rejection from this async read must not escape.
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
        stamp(`check-in counter=${counter} SAT(ms)=${activeModeThreshold} ${await wakefulnessSuffix()}`),
    );
    observers.on(events.checkInMissed, async () => stamp(`check-in MISSED ${await wakefulnessSuffix()}`));
    observers.on(events.keyRefreshed, () => stamp("key refreshed"));
    observers.on(events.available$Changed, (value: boolean) => stamp(`available=${value}`));
    observers.on(clientNode.lifecycle.connectionStateChanged, state =>
        stamp(`connection=${NodeConnectionState[state] ?? state}`),
    );
    watchers.set(key, observers);
    // Drop the watcher when the node goes away so it doesn't leak in the map.
    clientNode.lifecycle.destroyed.once(() => {
        watchers.get(key)?.close();
        watchers.delete(key);
    });
    console.log(`Watching node ${nodeId} (run \`icd watch ${nodeId} off\` to stop)`);
}

export default function commands(theNode: MatterNode) {
    return {
        command: "icd",
        describe: "Controller-side ICD (Intermittently Connected Device) operations",
        builder: (yargs: Argv) =>
            yargs
                .command({
                    command: "register <node-id>",
                    describe: "Register this controller as a Check-In client on the peer ('all' for every node)",
                    builder: (y: Argv) =>
                        y
                            .positional("node-id", {
                                describe: "node id, or 'all'",
                                type: "string",
                                demandOption: true,
                            })
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
                        await eachNode(theNode, argv.nodeId, async nodeId => {
                            const clientNode = await connectedIcdNode(theNode, nodeId);
                            try {
                                await clientNode.act(agent => agent.get(IcdClient).register(options));
                                console.log(`Registered as Check-In client on node ${nodeId}`);
                            } catch (e) {
                                if (e instanceof IcdMultiAdminError) {
                                    console.log(
                                        `node ${nodeId}: refused — peer has other-vendor admins (${e.adminVendorIds.join(", ")}). Re-run with --allow-multi-admin to proceed.`,
                                    );
                                    return;
                                }
                                throw e;
                            }
                        });
                    },
                })
                .command({
                    command: "unregister <node-id>",
                    describe: "Remove this controller's Check-In registration from the peer ('all' for every node)",
                    builder: (y: Argv) =>
                        y
                            .positional("node-id", {
                                describe: "node id, or 'all'",
                                type: "string",
                                demandOption: true,
                            })
                            .option("force", {
                                describe:
                                    "forget the registration locally without contacting the peer (escape hatch for an unreachable LIT ICD)",
                                type: "boolean",
                                default: false,
                            }),
                    handler: async (argv: any) => {
                        await eachNode(theNode, argv.nodeId, async nodeId => {
                            if (argv.force) {
                                // A registered-but-unreachable LIT peer parks every connecting/peer-I/O path on its
                                // never-coming Check-In; reach it via the non-connecting accessor and forget() locally.
                                const clientNode = findCommissionedNode(theNode, nodeId);
                                if (clientNode === undefined) {
                                    throw new ImplementationError(`Node ${nodeId} is not commissioned`);
                                }
                                if (!clientNode.behaviors.has(IcdClient)) {
                                    throw new ImplementationError(
                                        `Node ${nodeId} is not an ICD device (no IcdManagement cluster)`,
                                    );
                                }
                                await clientNode.act(agent => agent.get(IcdClient).forget());
                                console.log(
                                    `Forgot Check-In registration for node ${nodeId} locally (peer not contacted)`,
                                );
                                return;
                            }
                            const clientNode = await connectedIcdNode(theNode, nodeId);
                            await clientNode.act(agent => agent.get(IcdClient).unregister());
                            console.log(`Unregistered Check-In client on node ${nodeId}`);
                        });
                    },
                })
                .command({
                    command: "stay-active <node-id> [duration-ms]",
                    describe:
                        "Ask the peer to stay in Active mode; prints the promised duration ('all' for every node)",
                    builder: (y: Argv) =>
                        y
                            .positional("node-id", {
                                describe: "node id, or 'all'",
                                type: "string",
                                demandOption: true,
                            })
                            .positional("duration-ms", {
                                describe: "requested active duration (ms)",
                                type: "number",
                                default: 30000,
                            }),
                    handler: async (argv: any) => {
                        await eachNode(theNode, argv.nodeId, async nodeId => {
                            const clientNode = await connectedIcdNode(theNode, nodeId);
                            const promised = await clientNode.act(agent =>
                                agent.get(IcdClient).stayActive(Millis(argv.durationMs)),
                            );
                            console.log(`Node ${nodeId} promised active for ${Duration.format(promised)}`);
                        });
                    },
                })
                .command({
                    command: "status <node-id>",
                    describe: "Show ICD state for a peer ('all' for every commissioned node)",
                    builder: (y: Argv) =>
                        y.positional("node-id", { describe: "node id, or 'all'", type: "string", demandOption: true }),
                    handler: async (argv: any) => {
                        // findCommissionedNode never connects/awaits remote init, so a peer stuck mid-read can't hang this command.
                        const nodeIds = await targetNodeIds(theNode, argv.nodeId);
                        if (nodeIds.length === 0) {
                            console.log("No commissioned nodes.");
                            return;
                        }
                        // Diagnostic command: report an unreachable node inline rather than aborting, even for a single id.
                        for (const nodeId of nodeIds) {
                            try {
                                const clientNode = findCommissionedNode(theNode, nodeId);
                                if (clientNode === undefined) {
                                    throw new ImplementationError(`Node ${nodeId} is not commissioned`);
                                }
                                await printStatus(nodeId, clientNode);
                            } catch (e) {
                                console.log(
                                    `node ${nodeId}: unavailable (${e instanceof Error ? e.message : String(e)})`,
                                );
                            }
                        }
                    },
                })
                .command({
                    command: "watch <node-id> [state]",
                    describe:
                        "Stream ICD events for a peer live ('all' for every node; state: on|off, default on), including awake, nextCheckIn and connection state",
                    builder: (y: Argv) =>
                        y
                            .positional("node-id", {
                                describe: "node id, or 'all'",
                                type: "string",
                                demandOption: true,
                            })
                            .positional("state", {
                                describe: "on|off",
                                choices: ["on", "off"] as const,
                                default: "on" as const,
                            }),
                    handler: async (argv: any) => {
                        if (argv.state === "off") {
                            stopWatch(argv.nodeId);
                            return;
                        }
                        await eachNode(theNode, argv.nodeId, nodeId => startWatch(theNode, nodeId));
                    },
                })
                .demandCommand(1, "You must specify an icd subcommand"),
        handler: async (argv: any) => {
            argv.unhandled = true;
        },
    };
}
