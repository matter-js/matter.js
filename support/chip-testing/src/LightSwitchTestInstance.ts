/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    Diagnostic,
    Duration,
    Endpoint,
    ImplementationError,
    Logger,
    MatterAggregateError,
    MatterError,
    Millis,
    Seconds,
    ServerNode,
    Time,
} from "@matter/main";
import { NetworkCommissioningServer } from "@matter/main/behaviors";
import { BindingServer, type BindingResolution } from "@matter/main/behaviors/binding";
import { GroupsServer } from "@matter/main/behaviors/groups";
import { OnOffClient } from "@matter/main/behaviors/on-off";
import { BasicInformation } from "@matter/main/clusters";
import { Binding } from "@matter/main/clusters/binding";
import { OnOff } from "@matter/main/clusters/on-off";
import { OnOffLightSwitchDevice } from "@matter/main/devices/on-off-light-switch";
import { DeviceTypeId, EndpointNumber, VendorId } from "@matter/main/types";
import { BackchannelCommand } from "@matter/testing";
import { DeviceTestInstanceConfig } from "./GenericTestApp.js";
import { NodeTestInstance } from "./NodeTestInstance.js";

const logger = Logger.get("LightSwitchTestInstance");

const SWITCH_ENDPOINT = EndpointNumber(1);

/** How long a binding entry may take to resolve before a send through it fails. */
const RESOLUTION_TIMEOUT = Seconds(30);

const RESOLUTION_POLL = Millis(50);

const LightSwitchRootEndpoint = ServerNode.RootEndpoint.with(
    NetworkCommissioningServer.with("EthernetNetworkInterface"),
);

const LightSwitchRootEndpointWithoutGroupcast = ServerNode.RootEndpointWithoutGroupcast.with(
    NetworkCommissioningServer.with("EthernetNetworkInterface"),
);

const LightSwitchEndpoint = OnOffLightSwitchDevice.with(BindingServer, GroupsServer);

/** Sends to one or more binding targets failed; the causes are the errors each send raised. */
export class BindingSendError extends MatterAggregateError {}

/** A binding entry the Binding attribute holds never resolved into a target the switch could send to. */
export class BindingUnresolvedError extends MatterError {}

/** Identifies a binding entry by every field that makes it a distinct target. */
function entryKey({ fabricIndex, node, group, endpoint, cluster }: Binding.Target) {
    return [fabricIndex, node ?? "", group ?? "", endpoint ?? "", cluster ?? ""].join("/");
}

/**
 * An on/off light switch whose endpoint 1 sends OnOff commands to whatever its Binding cluster names — the DUT of the
 * TC-BIND cases.
 *
 * The switch only sends: every other device, access entry and binding entry is set up by the controller.
 */
export class LightSwitchTestInstance extends NodeTestInstance {
    static override id = "light-switch-6100";

    /** Resolutions BindingServer has reported for the switch endpoint, by {@link entryKey}. */
    #resolved = new Map<string, BindingResolution>();

    /** Whether the root endpoint has the Groupcast cluster. Overridden by {@link LightSwitchNoGroupcastTestInstance}. */
    protected readonly groupcast: boolean = true;

    constructor(config: DeviceTestInstanceConfig) {
        super(config);
    }

    override async initialize() {
        await this.activateCommandPipe("light_switch");
        await super.initialize();
    }

    async setupServer(): Promise<ServerNode> {
        this.#resolved.clear();

        const serverNode = await ServerNode.create(
            this.groupcast ? LightSwitchRootEndpoint : LightSwitchRootEndpointWithoutGroupcast,
            {
                id: this.id,
                environment: this.env,
                network: {
                    port: this.config.port ?? 5540,
                },
                commissioning: {
                    passcode: this.config.passcode ?? 20202021,
                    discriminator: this.config.discriminator ?? 3840,
                },
                productDescription: {
                    name: this.appName,
                    deviceType: DeviceTypeId(OnOffLightSwitchDevice.deviceType),
                },
                basicInformation: {
                    vendorName: "Binford",
                    vendorId: VendorId(0xfff1),
                    nodeLabel: "",
                    productName: "MorePowerPro 6100 Light Switch",
                    productLabel: "MorePowerPro 6100 Light Switch",
                    productId: 0x8002,
                    serialNumber: "9999-9999-9999",
                    manufacturingDate: "20200101",
                    partNumber: "123456",
                    productUrl: "https://test.com",
                    uniqueId: "node-matter-unique",
                    localConfigDisabled: false,
                    productAppearance: {
                        finish: BasicInformation.ProductFinish.Satin,
                        primaryColor: BasicInformation.Color.Purple,
                    },
                    reachable: true,
                },
                generalDiagnostics: {
                    testEventTriggersEnabled: true,
                    deviceTestEnableKey: Bytes.fromHex(NodeTestInstance.testEnableKey),
                },
                networkCommissioning: {
                    maxNetworks: 1,
                    interfaceEnabled: true,
                    networks: [{ networkId: Bytes.fromHex("6574682D617070"), connected: true }],
                },
            },
        );

        const switchEndpoint = new Endpoint(LightSwitchEndpoint, { number: SWITCH_ENDPOINT });
        await serverNode.add(switchEndpoint);

        const events = switchEndpoint.eventsOf(BindingServer);
        events.established.on(resolution => {
            this.#resolved.set(entryKey(resolution.entry), resolution);
        });
        events.removed.on(resolution => {
            const key = entryKey(resolution.entry);
            if (this.#resolved.get(key) === resolution) {
                this.#resolved.delete(key);
            }
        });

        return serverNode;
    }

    override async backchannel(command: BackchannelCommand) {
        switch (command.name) {
            case "sendOnOffToBindings":
                await this.#sendOnOffToBindings(command);
                break;

            default:
                await super.backchannel(command);
                break;
        }
    }

    /**
     * Sends the command to every OnOff target the endpoint's Binding attribute names now.
     *
     * The attribute is the authority, not what BindingServer has reported: it resolves an entry after the write that
     * added it and forgets one after the write that removed it, so a send right after a write would otherwise reach
     * the targets from before it.
     */
    async #sendOnOffToBindings({ endpointId, command }: BackchannelCommand.SendOnOffToBindings) {
        if (endpointId !== SWITCH_ENDPOINT) {
            throw new ImplementationError(
                `The light switch sends bound commands from endpoint ${SWITCH_ENDPOINT}, not ${endpointId}`,
            );
        }
        const endpoint = this.node.endpoints.for(SWITCH_ENDPOINT);
        const targets = await this.#resolveTargets(endpoint);

        const failures = new Array<unknown>();
        for (const target of targets) {
            logger.info(
                `Sending OnOff.${command} to binding target`,
                Diagnostic.dict({ kind: target.kind, node: target.node.id, entry: target.entry }),
            );
            try {
                await target.endpoint.commandsOf(OnOffClient)[command]();
            } catch (e) {
                logger.error(`OnOff.${command} to binding target ${target.node.id} failed:`, e);
                failures.push(e);
            }
        }

        if (failures.length) {
            throw new BindingSendError(
                failures,
                `OnOff.${command} failed for ${failures.length} of ${targets.length} binding targets`,
            );
        }
    }

    /**
     * The resolutions of every entry the Binding attribute holds that can carry an OnOff command, once each has
     * resolved. An entry naming another cluster is not an OnOff target and is left out.
     */
    async #resolveTargets(endpoint: Endpoint) {
        const deadline = Time.nowUs + RESOLUTION_TIMEOUT;
        while (true) {
            const targets = new Map<string, BindingResolution>();
            const unresolved = new Array<string>();
            for (const entry of endpoint.stateOf(BindingServer).binding) {
                if (entry.cluster !== undefined && entry.cluster !== OnOff.Cluster.id) {
                    continue;
                }
                const key = entryKey(entry);
                const target = this.#resolved.get(key);
                if (target === undefined) {
                    unresolved.push(key);
                } else {
                    targets.set(key, target);
                }
            }
            if (unresolved.length === 0) {
                return [...targets.values()];
            }
            if (Time.nowUs >= deadline) {
                throw new BindingUnresolvedError(
                    `Binding entries ${unresolved.join(", ")} did not resolve within ` +
                        `${Duration.format(RESOLUTION_TIMEOUT)}. BindingManager logs a warning for an entry it rejects; ` +
                        "a unicast entry it accepted stays unresolved until its peer node is online, and a group entry " +
                        "until this node holds a key for the group",
                );
            }
            await Time.sleep("binding resolution", RESOLUTION_POLL);
        }
    }
}

/**
 * {@link LightSwitchTestInstance} on a root endpoint without the Groupcast cluster, a switch built before Matter 1.6.1
 * or without Groupcast. Group settings reach it only through GroupKeyManagement.
 */
export class LightSwitchNoGroupcastTestInstance extends LightSwitchTestInstance {
    static override id = "light-switch-6100-no-groupcast";

    protected override readonly groupcast: boolean = false;
}
