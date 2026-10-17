/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { limitEndpointAttributeDataToAllowedFabrics } from "#behavior/cluster/FabricScopedDataHandler.js";
import { BehaviorBacking } from "#behavior/internal/BehaviorBacking.js";
import { ServerBehaviorBacking } from "#behavior/internal/ServerBehaviorBacking.js";
import { IndexBehavior } from "#behavior/system/index/IndexBehavior.js";
import type { Agent } from "#endpoint/Agent.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointVariableService } from "#endpoint/EndpointVariableService.js";
import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import { RootEndpoint } from "#endpoints/root";
import { ServerNodeStore } from "#storage/server/ServerNodeStore.js";
import { Environment, InternalError, Lifecycle, Logger, MaybePromise } from "@matter/general";
import { FabricManager, type Val } from "@matter/protocol";
import { BasicInformationServer } from "../../behaviors/basic-information/BasicInformationServer.js";
import { BridgedDeviceBasicInformationServer } from "../../behaviors/bridged-device-basic-information/BridgedDeviceBasicInformationServer.js";
import { DescriptorServer } from "../../behaviors/descriptor/DescriptorServer.js";
import { DeviceTypeConformanceService } from "./DeviceTypeConformanceService.js";

const logger = Logger.get("BehaviorInit");

export class ServerEndpointInitializer extends EndpointInitializer {
    #store: ServerNodeStore;

    constructor(environment: Environment) {
        super();
        this.#store = environment.get(ServerNodeStore);
        this.variableService = new EndpointVariableService(environment);
    }

    override reserveDescendant(endpoint: Endpoint) {
        if (!endpoint.lifecycle.hasId) {
            endpoint.id = this.#identifyPart(endpoint);
        }

        this.#store.endpointStores.assignNumber(endpoint, {
            presetNumbers: () => presetNumbersNotInstalled(endpoint),
            isInstalled: number => IndexBehavior.holderOf(endpoint, number) !== undefined,
        });
    }

    override initializeDescendant(endpoint: Endpoint) {
        // Parts reserve before they install; a node root reserves here, once its environment provides this initializer
        if (endpoint.maybeNumber === 0) {
            this.reserveDescendant(endpoint);
        }

        // Generated device types include DescriptorServer only where they specialize it
        if (!(DescriptorServer.id in endpoint.behaviors.supported)) {
            endpoint.behaviors.inject(DescriptorServer, undefined, false);
        }

        endpoint.env.get(DeviceTypeConformanceService).constructing(endpoint);
    }

    async prepareEraseDescendant(endpoint: Endpoint): Promise<EndpointInitializer.Erasure> {
        // A wiped bridged endpoint restarts from storage, so its increased version is persisted with the wipe
        const presets = new Map<Endpoint, Record<string, Val.Struct>>();
        const parts = new Array<Endpoint>();
        endpoint.visit(part => {
            parts.push(part);
        });
        for (const part of parts) {
            const version = await this.#erasedConfigurationVersionOf(part);
            if (version !== undefined) {
                presets.set(part, {
                    [BridgedDeviceBasicInformationServer.id]: {
                        configurationVersion: BasicInformationServer.nextConfigurationVersion(version),
                    },
                });
            }
        }

        return {
            wipe: async () => {
                if (endpoint.lifecycle.hasId) {
                    await this.#store.endpointStores.wipeStoreForEndpoint(endpoint, presets);
                }
            },
            finish: () => increaseConfigurationVersion(endpoint.owner),
        };
    }

    /**
     * The bridged ConfigurationVersion of an endpoint about to be erased: the live value of a running endpoint, else the
     * persisted value, so a crashed endpoint does not restart with a lower version.
     */
    async #erasedConfigurationVersionOf(part: Endpoint) {
        if (!part.behaviors.has(BridgedDeviceBasicInformationServer)) {
            return;
        }
        const live = bridgedConfigurationVersionOf(part);
        if (live !== undefined || !part.lifecycle.hasId) {
            return live;
        }
        const stored = await this.#store.endpointStores.storedValueOf(
            part,
            BridgedDeviceBasicInformationServer.id,
            "configurationVersion",
        );
        return typeof stored === "number" ? stored : undefined;
    }

    async prepareDeleteDescendant(endpoint: Endpoint): Promise<EndpointInitializer.Erasure> {
        const owner = endpoint.owner;
        return {
            wipe: async () => {
                if (endpoint.lifecycle.hasId) {
                    await this.#store.endpointStores.eraseStoreForEndpoint(endpoint);
                }
            },
            finish: () => increaseConfigurationVersion(owner),
        };
    }

    async deactivateDescendant(_endpoint: Endpoint) {
        // A closed endpoint keeps its reservation; whether a number is installed is known by the node's index
    }

    /**
     * Create the backing.
     *
     * If the behavior is a cluster behavior and the node is already initialized, create a server when the behavior
     * initializes.
     */
    createBacking(endpoint: Endpoint, type: Behavior.Type): BehaviorBacking {
        const store = this.#store.storeForEndpoint(endpoint).createStoreForBehavior(type.id);

        return new ServerBehaviorBacking(endpoint, type, store, endpoint.behaviors.optionsFor(type));
    }

    /**
     * Select an ID for an endpoint automatically based on available metadata.
     */
    #identifyPart(endpoint: Endpoint) {
        const basicInfo =
            endpoint.behaviors.supported.basicInformation ?? endpoint.behaviors.supported.bridgedDeviceBasicInformation;
        if (basicInfo) {
            const defaults = {
                ...new basicInfo.State(),
                ...endpoint.behaviors.defaultsFor(basicInfo),
            };

            let id = (defaults as Record<string, string>).uniqueId;
            if (id) {
                return id;
            }

            id = (defaults as Record<string, string>).serialNumber;
            if (id) {
                return id;
            }
        }

        if (!(endpoint.owner instanceof Endpoint)) {
            throw new InternalError("Cannot determine ID for endpoint with unknown parent type");
        }
        if (!endpoint.owner.lifecycle.hasId) {
            throw new InternalError("Cannot determine ID for endpoint because parent has no ID");
        }

        const index = endpoint.owner.parts.indexOf(endpoint);
        if (index === -1) {
            throw new InternalError("Cannot determine ID for endpoint because parent does not list as child");
        }

        // Use "part" rather than "endpoint" because it is scoped within parent endpoint
        const id = `part${index}`;
        logger.warn(`Using fallback ID of ${id} for child of ${endpoint.owner}; assign ID to remove this warning`);

        return id;
    }

    override partsInitialized(endpoint: Endpoint) {
        endpoint.env.get(DeviceTypeConformanceService).constructed(endpoint);
    }

    override behaviorsInitialized(agent: Agent): MaybePromise {
        // Make sure the state only includes allowed Fabric scoped data when an endpoint is added after node is online
        if (agent.env.has(FabricManager)) {
            const fabricIndices = agent.env.get(FabricManager).fabrics.map(fabric => fabric.fabricIndex);
            if (fabricIndices.length > 0) {
                return limitEndpointAttributeDataToAllowedFabrics(agent, fabricIndices);
            }
        }
    }
}

/**
 * Preset numbers of the endpoints of {@link endpoint}'s node that have not installed yet, other than {@link endpoint}.
 */
function presetNumbersNotInstalled(endpoint: Endpoint) {
    const numbers = new Set<number>();
    endpoint.ownerOfType(RootEndpoint)?.visit(other => {
        if (other !== endpoint && !other.lifecycle.isInstalled && other.lifecycle.hasNumber) {
            numbers.add(other.number);
        }
    });
    return numbers;
}

/**
 * Increase the ConfigurationVersion of the nearest running bridged endpoint at or above {@link from} that enables it,
 * which also increases the version of the node, or else the version of the node alone.  The node's version is skipped
 * while the node root is not active, as its state is not accessible then.
 *
 * @see {@link MatterSpecification.v161.Core} § 9.2.11
 */
async function increaseConfigurationVersion(from: Endpoint | undefined) {
    for (let candidate = from; candidate !== undefined; candidate = candidate.owner) {
        if (bridgedConfigurationVersionOf(candidate) !== undefined) {
            await candidate.act("increaseConfigurationVersion", agent =>
                agent.get(BridgedDeviceBasicInformationServer).increaseConfigurationVersion(),
            );
            return;
        }
    }

    const root = from?.ownerOfType(RootEndpoint);
    if (
        root === undefined ||
        root.construction.status !== Lifecycle.Status.Active ||
        !root.behaviors.has(BasicInformationServer)
    ) {
        return;
    }

    await root.act("increaseConfigurationVersion", agent =>
        agent.get(BasicInformationServer).increaseConfigurationVersion(),
    );
}

/**
 * The ConfigurationVersion of a running bridged endpoint, if the endpoint enables it.
 */
function bridgedConfigurationVersionOf(endpoint: Endpoint) {
    if (
        endpoint.construction.status !== Lifecycle.Status.Active ||
        !endpoint.behaviors.has(BridgedDeviceBasicInformationServer)
    ) {
        return;
    }
    return endpoint.stateOf(BridgedDeviceBasicInformationServer).configurationVersion;
}
