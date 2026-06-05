/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { BasicInformationServer, validateBasicInfoAttributes } from "#behaviors/basic-information";
import { DescriptorServer } from "#behaviors/descriptor";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { RootEndpoint } from "#endpoints/root";
import { ImplementationError, Logger, MaybePromise } from "@matter/general";
import { BridgedDeviceBasicInformationBehavior } from "./BridgedDeviceBasicInformationBehavior.js";

const logger = Logger.get("BridgedDeviceBasicInformationServer");

/**
 * This is the default server implementation of BridgedDeviceBasicInformationBehavior.
 *
 * All attributes are optional except for the "reachable" attribute.
 */
export class BridgedDeviceBasicInformationServer extends BridgedDeviceBasicInformationBehavior {
    override async initialize() {
        if (this.endpoint.lifecycle.isInstalled) {
            await this.agent.load(DescriptorServer);
            await this.#configurePart();
        } else {
            this.reactTo(this.endpoint.lifecycle.installed, this.#configurePart, { once: true });
        }
        this.reactTo(this.events.reachable$Changed, this.#emitReachableChange);

        const { uniqueId } = this.state;

        if (uniqueId === undefined) {
            this.state.uniqueId = BasicInformationServer.createUniqueId();
        }

        validateBasicInfoAttributes(this.state, logger);
    }

    /**
     * Run a configuration change for this bridged node and increase its ConfigurationVersion afterwards.
     *
     * A bridged-node configuration change is also a configuration change of the bridge itself.  When called standalone
     * the bridge's {@link BasicInformationServer} ConfigurationVersion is increased as well.
     *
     * To group changes across multiple bridged nodes into a single bridge increment, drive them from
     * {@link BasicInformationServer.increaseConfigurationVersion} and pass its callback's `context` here: the change is
     * applied in that shared transaction and the bridge increment is left to the enclosing call.
     */
    async increaseConfigurationVersion<T = void>(
        change?: (context: ActionContext) => MaybePromise<T>,
        context?: ActionContext,
    ): Promise<T> {
        const result = await change?.(context ?? this.context);

        if (this.state.configurationVersion !== undefined) {
            this.state.configurationVersion = BasicInformationServer.nextConfigurationVersion(
                this.state.configurationVersion,
            );
        }

        // A shared context means the bridge increment is owned by the enclosing change; only bump it standalone.
        if (context === undefined) {
            const root = this.endpoint.ownerOfType(RootEndpoint);
            if (root !== undefined) {
                const agent = root.agentFor(this.context);
                const basicInformation = agent.get(BasicInformationServer);
                await agent.context.transaction.addResources(basicInformation);
                await agent.context.transaction.begin();
                await basicInformation.increaseConfigurationVersion();
            }
        }

        return result as T;
    }

    static override readonly schema = BasicInformationServer.enableUniqueIdPersistence(
        BridgedDeviceBasicInformationBehavior.schema,
    );

    /**
     * Per the specification.  Not sure what this adds vs. subscribing to attribute changes.
     */
    #emitReachableChange(reachable: boolean) {
        this.events.reachableChanged.emit({ reachableNewValue: reachable }, this.context);
    }

    /**
     * Per the specification, BridgedDeviceBasicInformation may only appear on bridged nodes, and bridged nodes may only
     * appear under aggregator nodes.
     *
     * Therefore, this default implementation of BridgedDeviceBasicInformation injects the BridgedNode device type on the
     * associated {@link Endpoint} and asserts that its parent is a {@link AggregatorEndpoint}.
     */
    async #configurePart() {
        // Obtain endpoint's owner.  This method should only be invoked after owner is known
        const owner = this.agent.owner;
        if (owner === undefined) {
            throw new ImplementationError(`Bridged node ${this.endpoint} has no parent`);
        }

        // Assert owner is an aggregator
        if (!owner.get(DescriptorServer).hasDeviceType(AggregatorEndpoint.deviceType)) {
            throw new ImplementationError(`Bridged node ${this.endpoint} owner ${owner} is not an aggregator`);
        }

        // Ensure endpoint is a bridged node
        (await this.agent.load(DescriptorServer)).addDeviceTypes("BridgedNode");
    }
}

export namespace BridgedDeviceBasicInformationServer {
    export class State extends BridgedDeviceBasicInformationBehavior.State {
        // Assume Device is online when it is added, but developers should set correctly if needed
        override reachable = true;
    }
}
