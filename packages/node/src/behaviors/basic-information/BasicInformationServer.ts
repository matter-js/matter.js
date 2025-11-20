/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { OnlineEvent } from "#behavior/Events.js";
import { BasicInformation } from "#clusters/basic-information";
import { Diagnostic, ImplementationError, Logger, MaybePromise } from "#general";
import { AttributeModel, EventModel, Schema, Specification } from "#model";
import { NodeLifecycle } from "#node/NodeLifecycle.js";
import { Fabric, FabricManager } from "#protocol";
import { DEFAULT_MAX_PATHS_PER_INVOKE, VendorId } from "#types";
import { BasicInformationBehavior } from "./BasicInformationBehavior.js";

const logger = Logger.get("BasicInformationServer");

// Enable Events support by the Default implementation and tweak the maxPathsPerInvoke to 0 to have default handling
const Base = BasicInformationBehavior.enable({
    events: { startUp: true, shutDown: true, leave: true },
}).set({ maxPathsPerInvoke: 0 });

/**
 * This is the default server implementation of BasicInformationBehavior.
 */
export class BasicInformationServer extends Base {
    override initialize(): MaybePromise {
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
        if (this.state.uniqueId === undefined) {
            this.state.uniqueId = BasicInformationServer.createUniqueId();
        }

        const lifecycle = this.endpoint.lifecycle as NodeLifecycle;

        this.reactTo(lifecycle.online, this.#online);
        this.reactTo(lifecycle.goingOffline, this.#goingOffline);

        if (this.state.reachable !== undefined && this.events.reachable$Changed !== undefined) {
            const reachableChangedSchema = BasicInformationBehavior.schema.get(
                EventModel,
                BasicInformation.Cluster.events.reachableChanged.id,
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

        if (
            this.state.uniqueId !== undefined &&
            this.state.serialNumber !== undefined &&
            this.state.uniqueId === this.state.serialNumber
        ) {
            logger.warn("uniqueId and serialNumber shall not be the same.");
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
        this.reactTo(fabricManager.events.deleting, this.#handleRemovedFabric);
    }

    #goingOffline() {
        this.events.shutDown?.emit(undefined, this.context);
    }

    #emitReachableChange(reachable: boolean) {
        this.events.reachableChanged?.emit({ reachableNewValue: reachable }, this.context);
    }

    #handleRemovedFabric({ fabricIndex }: Fabric) {
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
