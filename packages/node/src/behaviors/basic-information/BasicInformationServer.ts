/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { OnlineEvent } from "#behavior/Events.js";
import { NodeLifecycle } from "#node/NodeLifecycle.js";
import { Diagnostic, ImplementationError, Logger, MaybePromise } from "@matter/general";
import { AttributeModel, EventModel, Schema, Specification } from "@matter/model";
import { Fabric, FabricManager } from "@matter/protocol";
import { DEFAULT_MAX_PATHS_PER_INVOKE, VendorId } from "@matter/types";
import { BasicInformation } from "@matter/types/clusters/basic-information";
import { validateBasicInfoAttributes } from "./basic-information-validators.js";
import { BasicInformationBehavior } from "./BasicInformationBehavior.js";

const logger = Logger.get("BasicInformationServer");

// Enable Events support by the Default implementation and tweak the maxPathsPerInvoke to 0 to have default handling
const Base = BasicInformationBehavior.enable({
    events: { startUp: true, shutDown: true, leave: true },
}).set({ maxPathsPerInvoke: 0 });

// Advertised CapabilityMinima: the guaranteed minimums we promise clients (core §11.1).  These are a floor, not a cap;
// the server accepts up to a higher hard ceiling and only blocks beyond it (see InteractionServer).
const DEFAULT_SIMULTANEOUS_INVOCATIONS_SUPPORTED = 20;
const DEFAULT_SIMULTANEOUS_WRITES_SUPPORTED = 20;
const DEFAULT_READ_PATHS_SUPPORTED = 20;
const DEFAULT_SUBSCRIBE_PATHS_SUPPORTED = 20;

/**
 * This is the default server implementation of BasicInformationBehavior.
 *
 * `ConfigurationVersion` (mandatory since Matter 1.6) is seeded to 1 and constrained to only ever increase.  When the
 * node's configuration changes in a way clients should detect, bump it with {@link increaseConfigurationVersion},
 * which runs your change and increments the version exactly once afterwards — do not set `configurationVersion`
 * directly.  Bridged nodes have their own version; see {@link BridgedDeviceBasicInformationServer}.
 */
export class BasicInformationServer extends Base {
    override initialize() {
        const state = this.state;

        const defaultsSet = {} as Record<string, any>;

        function setDefault<T extends keyof typeof state>(name: T, value: (typeof state)[T]) {
            if (state[name] === undefined || state[name] === 0) {
                state[name] = value;
                defaultsSet[name] = value;
            }
        }

        // These are development defaults, we log a warning when we set them
        setDefault("vendorId", VendorId(0xfff1));
        setDefault("vendorName", "Matter.js Test Vendor");
        setDefault("productId", 0x8000);
        setDefault("productName", "Matter.js Test Product");
        setDefault("hardwareVersion", 0);
        setDefault("softwareVersion", 0);

        // Warn if we used development defaults
        if (Object.keys(defaultsSet).length) {
            logger.warn("Using development values for some BasicInformation attributes:", Diagnostic.dict(defaultsSet));
        }

        // These defaults are appropriate for development or production so do not warn
        setDefault("productLabel", state.productName);
        setDefault("nodeLabel", state.productName);
        setDefault("dataModelRevision", Specification.DATA_MODEL_REVISION);
        setDefault("hardwareVersionString", state.hardwareVersion.toString());
        setDefault("softwareVersionString", state.softwareVersion.toString());
        setDefault("specificationVersion", Specification.SPECIFICATION_VERSION);
        setDefault("maxPathsPerInvoke", DEFAULT_MAX_PATHS_PER_INVOKE);

        setDefault("configurationVersion", 1);
        this.reactTo(this.events.configurationVersion$Changing, this.#preventConfigurationVersionRegression);

        const capabilityMinima = this.state.capabilityMinima;
        this.state.capabilityMinima = {
            ...capabilityMinima,
            simultaneousInvocationsSupported:
                capabilityMinima.simultaneousInvocationsSupported ?? DEFAULT_SIMULTANEOUS_INVOCATIONS_SUPPORTED,
            simultaneousWritesSupported:
                capabilityMinima.simultaneousWritesSupported ?? DEFAULT_SIMULTANEOUS_WRITES_SUPPORTED,
            readPathsSupported: capabilityMinima.readPathsSupported ?? DEFAULT_READ_PATHS_SUPPORTED,
            subscribePathsSupported: capabilityMinima.subscribePathsSupported ?? DEFAULT_SUBSCRIBE_PATHS_SUPPORTED,
        };

        if (this.state.uniqueId === undefined) {
            this.state.uniqueId = BasicInformationServer.createUniqueId();
        }

        const lifecycle = this.endpoint.lifecycle as NodeLifecycle;
        this.reactTo(lifecycle.online, this.#online);
        this.reactTo(lifecycle.goingOffline, this.#goingOffline);

        if (this.state.reachable !== undefined && this.events.reachable$Changed !== undefined) {
            const reachableChangedSchema = BasicInformationBehavior.schema.get(
                EventModel,
                BasicInformation.events.reachableChanged.id,
            );
            if (reachableChangedSchema === undefined) {
                throw new ImplementationError("Reachable Changed event schema is missing");
            }

            // Manually enable the reachableChanged event if not yet existing when reachable attribute exists (TODO -
            // make a more elegant way of doing this once introspection API is fleshed out)
            if (this.events.reachableChanged === undefined) {
                this.events.reachableChanged = new OnlineEvent<
                    [payload: BasicInformation.ReachableChangedEvent, context: ActionContext],
                    EventModel
                >(reachableChangedSchema, this.events);
            }

            this.reactTo(this.events.reachable$Changed, this.#emitReachableChange);
        }

        validateBasicInfoAttributes(this.state, logger);
    }

    /**
     * Run a configuration change and increase {@link BasicInformation.State.configurationVersion} afterwards.
     *
     * Use via the agent, e.g. `agent.get(BasicInformationServer).increaseConfigurationVersion(() => { ...changes... })`.
     * The callback runs first and receives the acting {@link ActionContext}; the version is increased once it completes
     * so a single logical change yields a single increment.
     *
     * To group changes across multiple bridged nodes into one transaction with a single bridge increment, perform the
     * bridged-node changes inside this callback via the provided context and pass that context to
     * {@link BridgedDeviceBasicInformationServer.increaseConfigurationVersion}.
     */
    async increaseConfigurationVersion<T = void>(change?: (context: ActionContext) => MaybePromise<T>): Promise<T> {
        const result = await change?.(this.context);
        this.state.configurationVersion = BasicInformationServer.nextConfigurationVersion(
            this.state.configurationVersion,
        );
        return result as T;
    }

    /**
     * Compute the next configuration version, wrapping at the uint32 maximum back to the minimum value of 1.  The
     * overflow behavior is not defined by the specification; see the spec-clarification follow-up.
     */
    static nextConfigurationVersion(current = 0) {
        return current >= 0xffffffff ? 1 : current + 1;
    }

    #preventConfigurationVersionRegression(value: number, oldValue: number) {
        // ConfigurationVersion must only ever increase; the sole exception is the wrap from the uint32 maximum
        if (value < oldValue && oldValue !== 0xffffffff) {
            throw new ImplementationError(`ConfigurationVersion must not decrease (${oldValue} -> ${value})`);
        }
    }

    static override readonly schema = this.enableUniqueIdPersistence(Base.schema);

    static enableUniqueIdPersistence(schema: Schema.Cluster): Schema.Cluster {
        return schema.extend({}, schema.require(AttributeModel, "uniqueId").extend({ quality: "FN" }));
    }

    static createUniqueId() {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        const charLength = chars.length;
        let id = "";
        for (let i = 0; i < 32; i++) {
            id += chars.charAt(Math.floor(Math.random() * charLength));
        }
        return id;
    }

    #online() {
        this.events.startUp.emit({ softwareVersion: this.state.softwareVersion }, this.context);

        const fabricManager = this.env.get(FabricManager);
        this.reactTo(fabricManager.events.leaving, this.#handleFabricLeave);
    }

    #goingOffline() {
        this.events.shutDown?.emit(undefined, this.context);
    }

    #emitReachableChange(reachable: boolean) {
        this.events.reachableChanged?.emit({ reachableNewValue: reachable }, this.context);
    }

    #handleFabricLeave({ fabricIndex }: Fabric) {
        this.events.leave.emit({ fabricIndex }, this.context);
    }
}

export namespace BasicInformationServer {
    export interface ProductDescription {
        /**
         * The device name for commissioning announcements.
         */
        readonly name: string;

        /**
         * The device type for commissioning announcements.
         */
        readonly deviceType: number;

        /**
         * The vendor ID for commissioning announcements.
         */
        readonly vendorId: VendorId;

        /**
         * The product ID for commissioning announcements.
         */
        readonly productId: number;
    }
}
