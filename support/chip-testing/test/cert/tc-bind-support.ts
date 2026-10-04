/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Seconds } from "@matter/main";
import { Matter } from "@matter/model";
import type { CertDevice, CertNodeApi, CertStepContext, CheckRecord } from "@matter/testing";
import { COMMISSIONED, COMMISSIONING_LOG_TIMEOUT } from "./tc-dd-support.js";
import {
    ACCESS_CONTROL,
    ACCESS_CONTROL_ID,
    attributeId,
    AUTH_MODE_GROUP,
    GROUP_KEY_MANAGEMENT,
    GROUP_KEY_MANAGEMENT_ID,
    GROUPS,
    GROUPS_ID,
    PRIVILEGE_OPERATE,
    readAcl,
    ROOT_ENDPOINT,
} from "./tc-group-support.js";
import {
    attempt,
    CommissionedRefs,
    describeValue,
    expectCommandInvoke,
    expectDeviceLog,
    expectMessageWithPath,
    LOG_TIMEOUT,
    type RecordedCheck,
    requireId,
    runCleanups,
    withChecks,
} from "./tc-support.js";

const ON_OFF = Matter.clusters.require("OnOff");
export const ON_OFF_ID = requireId(ON_OFF.id, "OnOff cluster");
const ON_OFF_ATTRIBUTE = requireId(ON_OFF.attributes.require("onOff").id, "OnOff.onOff");
export const ON_COMMAND = requireId(ON_OFF.commands.require("on").id, "OnOff.on");
export const OFF_COMMAND = requireId(ON_OFF.commands.require("off").id, "OnOff.off");

const BINDING = Matter.clusters.require("Binding");

/** The DUT's endpoint with the OnOff client and the Binding cluster. */
export const DUT_ENDPOINT = 1;

const BINDING_PATH = {
    endpoint: DUT_ENDPOINT,
    cluster: requireId(BINDING.id, "Binding cluster"),
    attribute: requireId(BINDING.attributes.require("binding").id, "Binding.binding"),
};

const ACL_PATH = { endpoint: ROOT_ENDPOINT, cluster: ACCESS_CONTROL_ID, attribute: attributeId(ACCESS_CONTROL, "acl") };

const GROUP_KEY_MAP_PATH = {
    endpoint: ROOT_ENDPOINT,
    cluster: GROUP_KEY_MANAGEMENT_ID,
    attribute: attributeId(GROUP_KEY_MANAGEMENT, "groupKeyMap"),
};

const AUTH_MODE_CASE = 2;

const DESCRIPTOR = Matter.clusters.require("Descriptor");
const ROOT_SERVER_LIST_PATH = {
    endpoint: ROOT_ENDPOINT,
    cluster: requireId(DESCRIPTOR.id, "Descriptor cluster"),
    attribute: attributeId(DESCRIPTOR, "serverList"),
};

const GROUPCAST = Matter.clusters.require("Groupcast");
const GROUPCAST_ID = requireId(GROUPCAST.id, "Groupcast cluster");
const GROUPCAST_FEATURE_MAP_PATH = {
    endpoint: ROOT_ENDPOINT,
    cluster: GROUPCAST_ID,
    attribute: attributeId(GROUPCAST, "featureMap"),
};

/** The Sender feature of the Groupcast FeatureMap, bit 1. */
const GROUPCAST_SENDER = 1 << 1;

/**
 * Whether a Groupcast FeatureMap read sets the Sender feature. Both adapters decode a bitmap through the model into an
 * object of named bits, where one arrives; a raw number is read by its bit.
 */
function hasSenderFeature(value: unknown) {
    if (typeof value === "number") {
        return (value & GROUPCAST_SENDER) !== 0;
    }
    return fieldOf(value, "sender") === true;
}

/** A Groupcast JoinGroup request as TC-BIND-2.3 sends it. */
export interface GroupcastJoin {
    group: number;
    endpoints: number[];
    keySet: GroupKeySet;
}

/**
 * How long a TH that must not receive a command is watched for one. It covers the TH's log reaching the follower,
 * and for a group command, which nobody answers, the message's own travel.
 */
export const ABSENCE_WINDOW = Seconds(5);

/** A matter.js device announcing, as it comes online, that it holds no fabric. */
const UNCOMMISSIONED = /Commissioning \S+ is uncommissioned/;

/** A binding entry naming one endpoint of a TH, or a group. */
export type BindingEntrySpec<Role extends string> = { role: Role; endpoint: number } | { group: number };

/** The field `name` of a decoded struct, or undefined where `value` is no struct or lacks it. */
function fieldOf(value: unknown, name: string): unknown {
    return typeof value === "object" && value !== null ? Reflect.get(value, name) : undefined;
}

/** Whether `value` is the uint64 `expected`, which reaches here as a `bigint` or a `number` depending on its size. */
function isId(value: unknown, expected: bigint) {
    return (typeof value === "bigint" || typeof value === "number") && BigInt(value) === expected;
}

/**
 * The devices of a TC-BIND run, all commissioned by TH1, which also sets up everything between them. The DUT only
 * sends along the bindings TH1 gave it.
 */
export class BindRun<Role extends string> {
    // One per device: `CommissionedRefs` removes a fabric through the controller role it is keyed by, and TH1
    // commissions every device
    readonly #refs = new Map<Role, CommissionedRefs<"th1">>();

    constructor(roles: readonly Role[]) {
        for (const role of roles) {
            this.#refs.set(role, new CommissionedRefs<"th1">());
        }
    }

    #refsOf(role: Role) {
        const refs = this.#refs.get(role);
        if (refs === undefined) {
            throw new InternalError(`${role} is not a device of this run`);
        }
        return refs;
    }

    node(cx: CertStepContext, role: Role, what: string): CertNodeApi {
        return cx.controllers.th1.node(this.#refsOf(role).require("th1", what));
    }

    /** The node id TH1 gave `role`, which is what a binding entry and an ACL subject name it by. */
    nodeId(role: Role, what: string): bigint {
        return BigInt(this.#refsOf(role).require("th1", what));
    }

    /** Removes every fabric TH1 put on a device, the DUT first so it stops reaching for THs that left the fabric. */
    finalize(cx: CertStepContext, dutFirst: Role) {
        const ordered = [dutFirst, ...[...this.#refs.keys()].filter(role => role !== dutFirst)];
        return runCleanups(...ordered.map(role => () => this.#refsOf(role).decommissionAll(cx)));
    }

    /** The plan's "Factory Reset DUT": the DUT erases itself and announces it holds no fabric. */
    factoryResetStep(role: Role) {
        return async (cx: CertStepContext) => {
            const dut = cx.devices[role];
            const from = await dut.log.markSettled();
            await withChecks(cx, async checks => {
                const reset = await attempt(
                    () => dut.backchannel({ name: "factoryReset" }),
                    () => "The DUT reset to factory defaults",
                );
                checks.push({ what: "Factory reset", check: () => reset.check });

                const announced = await expectDeviceLog(
                    dut.log,
                    dut.flavor,
                    { matterjs: UNCOMMISSIONED },
                    from,
                    COMMISSIONING_LOG_TIMEOUT,
                );
                checks.push({ what: "The DUT announced it holds no fabric", check: () => announced.check });
            });
        };
    }

    /** TH1 commissions `role`, and the device's own log shows the commissioning completed. */
    commissionStep(role: Role, name: string) {
        return async (cx: CertStepContext) => {
            const device = cx.devices[role];
            const from = await device.log.markSettled();

            await withChecks(cx, async checks => {
                const commissioned = await attempt(
                    () =>
                        cx.controllers.th1.commission({
                            passcode: device.commissioning.passcode,
                            discriminator: device.commissioning.discriminator,
                        }),
                    ref => `TH1 commissioned ${name} as node ${ref}`,
                );
                if (commissioned.ok) {
                    this.#refsOf(role).set("th1", commissioned.value);
                }
                checks.push({ what: `TH1 commissions ${name}`, check: () => commissioned.check });

                const logged = await expectDeviceLog(
                    device.log,
                    device.flavor,
                    COMMISSIONED,
                    from,
                    COMMISSIONING_LOG_TIMEOUT,
                );
                checks.push({ what: `${name} logged the commissioning completing`, check: () => logged.check });
            });
        };
    }

    /**
     * TH1 writes the DUT's Binding attribute to hold `specs`, with the checks that the DUT received the write and
     * holds exactly those entries afterwards.
     */
    writeBindingStep(dutRole: Role, specs: readonly BindingEntrySpec<Role>[]) {
        return async (cx: CertStepContext) => {
            const dut = cx.devices[dutRole];

            await withChecks(cx, async checks => {
                const node = this.node(cx, dutRole, "TH1 writes the DUT's bindings");
                const entries = specs.map(spec =>
                    "group" in spec
                        ? { group: spec.group }
                        : {
                              node: this.nodeId(spec.role, `The binding entry for ${spec.role.toUpperCase()}`),
                              endpoint: spec.endpoint,
                              cluster: ON_OFF_ID,
                          },
                );

                const from = await dut.log.markSettled();
                const write = await attempt(
                    () => node.writeAttribute(BINDING_PATH, entries),
                    () => `Binding write of ${entries.length} entries accepted`,
                );
                checks.push({ what: "Binding write", check: () => write.check });

                const logged = await expectMessageWithPath(
                    dut.log,
                    dut.flavor,
                    "write",
                    BINDING_PATH,
                    from,
                    LOG_TIMEOUT,
                );
                checks.push({ what: "The DUT received the Binding write", check: () => logged });

                if (write.ok) {
                    const readBack = await attempt(
                        () => node.readAttribute(BINDING_PATH),
                        value => `Binding reads back as ${describeValue(value)}`,
                    );
                    const held: CheckRecord = readBack.ok
                        ? { ...readBack.check, verdict: holdsExactly(readBack.value, entries) ? "pass" : "fail" }
                        : readBack.check;
                    checks.push({ what: "The DUT holds exactly the entries written", check: () => held });
                }
            });
        };
    }

    /** TH1 appends an ACL entry on `role` letting the DUT operate OnOff on `endpoint` over CASE, and reads it back. */
    async grantOperate(cx: CertStepContext, role: Role, dutRole: Role, endpoint: number, checks: RecordedCheck[]) {
        const dutNodeId = this.nodeId(dutRole, "The ACL subject for the DUT");
        await this.#appendAcl(
            cx,
            role,
            {
                privilege: PRIVILEGE_OPERATE,
                authMode: AUTH_MODE_CASE,
                subjects: [dutNodeId],
                targets: [{ cluster: ON_OFF_ID, endpoint, deviceType: null }],
            },
            entry => admits(entry, AUTH_MODE_CASE, dutNodeId, endpoint),
            `node ${dutNodeId} to operate OnOff on endpoint ${endpoint}`,
            checks,
        );
    }

    /** TH1 appends an ACL entry on `role` letting group `group` operate OnOff on `endpoint`, and reads it back. */
    async grantGroupOperate(cx: CertStepContext, role: Role, group: number, endpoint: number, checks: RecordedCheck[]) {
        await this.#appendAcl(
            cx,
            role,
            {
                privilege: PRIVILEGE_OPERATE,
                authMode: AUTH_MODE_GROUP,
                subjects: [group],
                targets: [{ cluster: ON_OFF_ID, endpoint, deviceType: null }],
            },
            entry => admits(entry, AUTH_MODE_GROUP, BigInt(group), endpoint),
            `group ${group} to operate OnOff on endpoint ${endpoint}`,
            checks,
        );
    }

    async #appendAcl(
        cx: CertStepContext,
        role: Role,
        entry: object,
        isEntry: (entry: unknown) => boolean,
        what: string,
        checks: RecordedCheck[],
    ) {
        const name = role.toUpperCase();
        const node = this.node(cx, role, `TH1 writes ${name}'s ACL`);

        // TH1's own administer entry is in this list, and writing the new entry alone would revoke it
        const existing = await attempt(
            () => readAcl(node),
            acl => `${name} holds ${acl.length} ACL entries`,
        );
        checks.push({ what: `${name}'s ACL read`, check: () => existing.check });
        if (!existing.ok) {
            return;
        }

        const write = await attempt(
            () => node.writeAttribute(ACL_PATH, [...existing.value, entry]),
            () => `${name} accepted the ACL entry`,
        );
        checks.push({ what: `${name}'s ACL write`, check: () => write.check });
        if (!write.ok) {
            return;
        }

        const readBack = await attempt(
            () => readAcl(node),
            acl => `${name} holds ${acl.length} ACL entries`,
        );
        let admitted = readBack.check;
        if (readBack.ok) {
            const found = readBack.value.some(isEntry);
            admitted = {
                type: "response",
                verdict: found ? "pass" : "fail",
                detail: `${name}'s ACL ${found ? "admits" : "does not admit"} ${what}: ${describeValue(readBack.value)}`,
            };
        }
        checks.push({ what: `${name}'s ACL admits ${what}`, check: () => admitted });
    }

    /** TH1 writes key set `keySet` to `role` with KeySetWrite, and checks the answer and the TH's receipt. */
    async keySetWrite(cx: CertStepContext, role: Role, keySet: GroupKeySet, checks: RecordedCheck[]) {
        const name = role.toUpperCase();
        const node = this.node(cx, role, `TH1 writes ${name}'s key set`);
        const device = cx.devices[role];

        const from = await device.log.markSettled();
        const written = await attempt(
            () => node.invoke(GROUP_KEY_MANAGEMENT.name, "keySetWrite", { groupKeySet: keySet }, ROOT_ENDPOINT),
            () => `${name} accepted KeySetWrite of key set 0x${keySet.groupKeySetId.toString(16)}`,
        );
        checks.push({ what: `KeySetWrite to ${name}`, check: () => written.check });

        const logged = await expectCommandInvoke(
            device.log,
            device.flavor,
            ROOT_ENDPOINT,
            GROUP_KEY_MANAGEMENT_ID,
            requireId(GROUP_KEY_MANAGEMENT.commands.require("keySetWrite").id, "GroupKeyManagement.keySetWrite"),
            [],
            from,
            LOG_TIMEOUT,
        );
        checks.push({ what: `${name} received the KeySetWrite`, check: () => logged });
    }

    /** TH1 binds `group` to key set `groupKeySetId` in `role`'s GroupKeyMap, and reads the binding back. */
    async groupKeyMap(cx: CertStepContext, role: Role, group: number, groupKeySetId: number, checks: RecordedCheck[]) {
        const name = role.toUpperCase();
        const node = this.node(cx, role, `TH1 writes ${name}'s GroupKeyMap`);
        const device = cx.devices[role];

        const from = await device.log.markSettled();
        const mapped = await attempt(
            () => node.writeAttribute(GROUP_KEY_MAP_PATH, [{ groupId: group, groupKeySetId }]),
            () => `${name} accepted the GroupKeyMap write`,
        );
        checks.push({ what: `GroupKeyMap write to ${name}`, check: () => mapped.check });

        const logged = await expectMessageWithPath(
            device.log,
            device.flavor,
            "write",
            GROUP_KEY_MAP_PATH,
            from,
            LOG_TIMEOUT,
        );
        checks.push({ what: `${name} received the GroupKeyMap write`, check: () => logged });
        if (!mapped.ok) {
            return;
        }

        const readBack = await attempt(
            () => node.readAttribute(GROUP_KEY_MAP_PATH),
            value => `${name}'s GroupKeyMap reads back as ${describeValue(value)}`,
        );
        const bound: CheckRecord = readBack.ok
            ? {
                  ...readBack.check,
                  verdict:
                      Array.isArray(readBack.value) &&
                      readBack.value.some(
                          entry =>
                              Number(fieldOf(entry, "groupId")) === group &&
                              Number(fieldOf(entry, "groupKeySetId")) === groupKeySetId,
                      )
                          ? "pass"
                          : "fail",
              }
            : readBack.check;
        checks.push({ what: `${name} binds group ${group} to the key set`, check: () => bound });
    }

    /** TH1 has `role` join `group` on `endpoint` with AddGroup, and checks the answer and the TH's receipt. */
    async addGroup(cx: CertStepContext, role: Role, group: number, endpoint: number, checks: RecordedCheck[]) {
        const name = role.toUpperCase();
        const node = this.node(cx, role, `TH1 adds ${name} to the group`);
        const device = cx.devices[role];

        const from = await device.log.markSettled();
        const added = await attempt(
            () => node.invoke(GROUPS.name, "addGroup", { groupId: group, groupName: "" }, endpoint),
            response => `${name} answered AddGroup with ${describeValue(response)}`,
        );
        const status: CheckRecord = added.ok
            ? { ...added.check, verdict: Number(fieldOf(added.value, "status")) === 0 ? "pass" : "fail" }
            : added.check;
        checks.push({ what: `AddGroup on ${name}`, check: () => status });

        const logged = await expectCommandInvoke(
            device.log,
            device.flavor,
            endpoint,
            GROUPS_ID,
            requireId(GROUPS.commands.require("addGroup").id, "Groups.addGroup"),
            [{ id: 0, value: group }],
            from,
            LOG_TIMEOUT,
        );
        checks.push({ what: `${name} received the AddGroup`, check: () => logged });
    }

    /**
     * TH1 reads `role`'s root Descriptor ServerList and records whether it lists the Groupcast cluster, which is the
     * condition TC-BIND-2.3 branches on. Returns the answer, or undefined where the read failed.
     */
    async rootHasGroupcast(cx: CertStepContext, role: Role, checks: RecordedCheck[]): Promise<boolean | undefined> {
        const name = role.toUpperCase();
        const read = await attempt(
            () => this.node(cx, role, `TH1 reads ${name}'s root endpoint`).readAttribute(ROOT_SERVER_LIST_PATH),
            value => `${name}'s root endpoint lists the clusters ${describeValue(value)}`,
        );
        if (!read.ok) {
            checks.push({ what: `${name}'s root ServerList`, check: () => read.check });
            return undefined;
        }
        if (!Array.isArray(read.value)) {
            const malformed: CheckRecord = { ...read.check, verdict: "fail" };
            checks.push({ what: `${name}'s root ServerList`, check: () => malformed });
            return undefined;
        }
        const has = read.value.some(id => Number(id) === GROUPCAST_ID);
        const answered: CheckRecord = {
            ...read.check,
            detail: `${read.check.detail}, so it ${has ? "has" : "has no"} Groupcast cluster (0x${GROUPCAST_ID.toString(16)})`,
        };
        checks.push({ what: `${name}'s root ServerList`, check: () => answered });
        return has;
    }

    /** TH1 reads `role`'s Groupcast FeatureMap and checks the Sender feature is set. */
    async groupcastSender(cx: CertStepContext, role: Role, checks: RecordedCheck[]) {
        const name = role.toUpperCase();
        const read = await attempt(
            () =>
                this.node(cx, role, `TH1 reads ${name}'s Groupcast FeatureMap`).readAttribute(
                    GROUPCAST_FEATURE_MAP_PATH,
                ),
            value => `${name}'s Groupcast FeatureMap reads ${describeValue(value)}`,
        );
        const sender: CheckRecord = read.ok
            ? { ...read.check, verdict: hasSenderFeature(read.value) ? "pass" : "fail" }
            : read.check;
        checks.push({ what: `${name}'s Groupcast Sender feature (bit 1)`, check: () => sender });
    }

    /** TH1 sends Groupcast JoinGroup to `role`'s root endpoint, and checks the answer and `role`'s receipt. */
    async joinGroup(cx: CertStepContext, role: Role, join: GroupcastJoin, checks: RecordedCheck[]) {
        const name = role.toUpperCase();
        const device = cx.devices[role];
        const from = await device.log.markSettled();
        const joined = await attempt(
            () =>
                this.node(cx, role, `TH1 sends JoinGroup to ${name}`).invoke(
                    GROUPCAST.name,
                    "joinGroup",
                    {
                        groupId: join.group,
                        endpoints: join.endpoints,
                        keySetId: join.keySet.groupKeySetId,
                        key: join.keySet.epochKey0,
                    },
                    ROOT_ENDPOINT,
                ),
            () => `${name} answered JoinGroup with SUCCESS`,
        );
        checks.push({ what: `JoinGroup to ${name}`, check: () => joined.check });

        const logged = await expectCommandInvoke(
            device.log,
            device.flavor,
            ROOT_ENDPOINT,
            GROUPCAST_ID,
            requireId(GROUPCAST.commands.require("joinGroup").id, "Groupcast.joinGroup"),
            [{ id: 0, value: join.group }],
            from,
            LOG_TIMEOUT,
        );
        checks.push({ what: `${name} received the JoinGroup`, check: () => logged });
    }

    /** TH1 reads the OnOff attribute of `role`'s `endpoint` and checks it is `expected`. */
    readOnOffStep(role: Role, endpoint: number, expected: boolean) {
        return async (cx: CertStepContext) => {
            const name = role.toUpperCase();
            await withChecks(cx, async checks => {
                const node = this.node(cx, role, `TH1 reads ${name}`);
                const read = await attempt(
                    () => node.readAttribute({ endpoint, cluster: ON_OFF_ID, attribute: ON_OFF_ATTRIBUTE }),
                    value => `${name} endpoint ${endpoint} OnOff=${describeValue(value)}`,
                );
                const matches: CheckRecord = read.ok
                    ? { ...read.check, verdict: read.value === expected ? "pass" : "fail" }
                    : read.check;
                checks.push({ what: `${name}'s OnOff attribute`, check: () => matches });
            });
        };
    }
}

/** A group key set as KeySetWrite carries it. */
export interface GroupKeySet {
    groupKeySetId: number;
    groupKeySecurityPolicy: number;
    epochKey0: Uint8Array;
    epochStartTime0: bigint;
    epochKey1: null;
    epochStartTime1: null;
    epochKey2: null;
    epochStartTime2: null;
}

/**
 * A key set with a freshly generated EpochKey0. The start time is a Unix timestamp rather than the plan's own
 * literal, for the reason AGENTS.md records under "An `epoch-us` cannot carry the plan's literal start time".
 */
export function randomGroupKeySet(groupKeySetId: number): GroupKeySet {
    return {
        groupKeySetId,
        groupKeySecurityPolicy: 0,
        epochKey0: crypto.getRandomValues(new Uint8Array(16)),
        epochStartTime0: 1_600_000_000_000_000n,
        epochKey1: null,
        epochStartTime1: null,
        epochKey2: null,
        epochStartTime2: null,
    };
}

/** Whether `entry`, an ACL entry, lets `subject` operate OnOff on `endpoint` under `authMode`. */
function admits(entry: unknown, authMode: number, subject: bigint, endpoint: number): boolean {
    const subjects = fieldOf(entry, "subjects");
    const targets = fieldOf(entry, "targets");
    return (
        Number(fieldOf(entry, "privilege")) >= PRIVILEGE_OPERATE &&
        Number(fieldOf(entry, "authMode")) === authMode &&
        Array.isArray(subjects) &&
        subjects.some(value => isId(value, subject)) &&
        Array.isArray(targets) &&
        targets.some(
            target =>
                Number(fieldOf(target, "cluster")) === ON_OFF_ID && Number(fieldOf(target, "endpoint")) === endpoint,
        )
    );
}

/** Whether `value`, a Binding read, holds exactly `entries`. */
function holdsExactly(
    value: unknown,
    entries: readonly ({ group: number } | { node: bigint; endpoint: number; cluster: number })[],
): boolean {
    if (!Array.isArray(value) || value.length !== entries.length) {
        return false;
    }
    return entries.every(wanted =>
        value.some(entry =>
            "group" in wanted
                ? Number(fieldOf(entry, "group")) === wanted.group && fieldOf(entry, "node") === undefined
                : isId(fieldOf(entry, "node"), wanted.node) &&
                  Number(fieldOf(entry, "endpoint")) === wanted.endpoint &&
                  Number(fieldOf(entry, "cluster")) === wanted.cluster,
        ),
    );
}

/** Has the DUT send `command` to its binding targets, which is what the plan's "DUT is triggered" means. */
export function trigger(dut: CertDevice, command: "on" | "off") {
    return attempt(
        () => dut.backchannel({ name: "sendOnOffToBindings", endpointId: DUT_ENDPOINT, command }),
        () => `The DUT sent OnOff.${command} to its binding targets`,
    );
}

/** The TH's log shows a unicast OnOff `command` on `endpoint`. */
export function receivedUnicast(device: CertDevice, endpoint: number, command: number, from: number) {
    return expectCommandInvoke(device.log, device.flavor, endpoint, ON_OFF_ID, command, [], from, LOG_TIMEOUT);
}
