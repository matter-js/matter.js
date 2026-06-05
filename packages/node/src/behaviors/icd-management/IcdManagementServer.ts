/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeLifecycle } from "#node/NodeLifecycle.js";
import { Bytes, ImplementationError } from "@matter/general";
import { AccessLevel, DataModelPath, fabricIdx, field, listOf, nodeId, nonvolatile, octstr } from "@matter/model";
import { AccessControl, assertRemoteActor, hasRemoteActor, IcdCounter } from "@matter/protocol";
import { FabricIndex, NodeId, Status, StatusResponseError } from "@matter/types";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import { IcdManagementBehavior } from "./IcdManagementBehavior.js";

const Base = IcdManagementBehavior.with(IcdManagement.Feature.CheckInProtocolSupport);

/**
 * Default device-side ICD Management behavior. Enables the Check-In Protocol Support (CIP) feature and validates
 * spec constraints on the timing attributes at startup.
 *
 * @see {@link MatterSpecification.v151.Core} § 9.16
 */
export class IcdManagementServer extends Base {
    declare internal: IcdManagementServer.Internal;
    declare readonly state: IcdManagementServer.State;

    override initialize() {
        // IdleModeDuration is in seconds; ActiveModeDuration is in milliseconds — unit conversion required.
        // @see {@link MatterSpecification.v151.Core} § 9.16.6.1
        if (this.state.idleModeDuration * 1000 < this.state.activeModeDuration) {
            throw new ImplementationError(
                `idleModeDuration (${this.state.idleModeDuration}s) * 1000 must be >= activeModeDuration (${this.state.activeModeDuration}ms)`,
            );
        }
        // @see {@link MatterSpecification.v151.Core} § 9.16.6.10
        if (this.state.maximumCheckInBackoff < this.state.idleModeDuration) {
            throw new ImplementationError(
                `maximumCheckInBackoff (${this.state.maximumCheckInBackoff}s) must be >= idleModeDuration (${this.state.idleModeDuration}s)`,
            );
        }

        this.reactTo((this.endpoint.lifecycle as NodeLifecycle).online, this.#online);
    }

    async #online() {
        const prev = this.internal.icdCounter;
        if (prev !== undefined) {
            // Node restarted — drop the old counter's reactor so it doesn't accumulate dead backings.
            await this.stopReacting({ observable: prev.changed });
        }
        const counter = new IcdCounter(this.state.icdCounter);
        this.internal.icdCounter = counter;
        // Persist the boot-bump immediately; later increments go through the reactor so state writes stay transactional.
        // @see {@link MatterSpecification.v151.Core} § 4.6.3
        this.state.icdCounter = counter.value;
        this.reactTo(counter.changed, this.#persistCounter);

        const keyMap = new Map<string, IcdManagementServer.IcdKeyEntry>();
        for (const entry of this.state.icdKeys) {
            keyMap.set(this.#keyFor(entry.fabricIndex, entry.checkInNodeId), entry);
        }
        this.internal.icdKeys = keyMap;
    }

    #persistCounter(value: number) {
        this.state.icdCounter = value;
    }

    /**
     * @see {@link MatterSpecification.v151.Core} § 9.16.7.1
     */
    override async registerClient(
        request: IcdManagement.RegisterClientRequest,
    ): Promise<IcdManagement.RegisterClientResponse> {
        assertRemoteActor(this.context);
        const fabric = this.context.session.associatedFabric;
        const fabricIndex = fabric.fabricIndex;

        const clients = this.state.registeredClients;
        let existingIndex = -1;
        let fabricCount = 0;
        for (let i = 0; i < clients.length; i++) {
            const c = clients[i];
            if (c.fabricIndex !== fabricIndex) {
                continue;
            }
            fabricCount++;
            if (c.checkInNodeId === request.checkInNodeId) {
                existingIndex = i;
            }
        }

        if (existingIndex === -1) {
            // @see {@link MatterSpecification.v151.Core} § 9.16.7.1 step 1
            if (fabricCount >= this.state.clientsSupportedPerFabric) {
                throw new StatusResponseError("ICD client slots exhausted for fabric", Status.ResourceExhausted);
            }
        } else if (!this.#isAdministrator()) {
            // @see {@link MatterSpecification.v151.Core} § 9.16.7.1 steps 2-3
            const stored = this.internal.icdKeys.get(this.#keyFor(fabricIndex, request.checkInNodeId));
            if (
                request.verificationKey === undefined ||
                stored === undefined ||
                !Bytes.areEqual(request.verificationKey, stored.key)
            ) {
                throw new StatusResponseError("VerificationKey mismatch", Status.Failure);
            }
        }

        const entry: IcdManagement.MonitoringRegistration = {
            checkInNodeId: request.checkInNodeId,
            monitoredSubject: request.monitoredSubject,
            clientType: request.clientType,
            fabricIndex,
        };

        if (existingIndex === -1) {
            clients.push(entry);
        } else {
            clients[existingIndex] = entry;
        }

        this.internal.icdKeys.set(this.#keyFor(fabricIndex, request.checkInNodeId), {
            fabricIndex,
            checkInNodeId: request.checkInNodeId,
            key: request.key,
        });
        this.#persistKeys();

        fabric.icd.setRegistration({
            checkInNodeId: request.checkInNodeId,
            monitoredSubject: request.monitoredSubject,
            key: request.key,
            clientType: request.clientType,
        });

        return { icdCounter: this.internal.icdCounter!.value };
    }

    /**
     * @see {@link MatterSpecification.v151.Core} § 9.16.7.3
     */
    override async unregisterClient(request: IcdManagement.UnregisterClientRequest): Promise<void> {
        assertRemoteActor(this.context);
        const fabric = this.context.session.associatedFabric;
        const fabricIndex = fabric.fabricIndex;

        const existing = this.state.registeredClients.find(
            c => c.fabricIndex === fabricIndex && c.checkInNodeId === request.checkInNodeId,
        );
        if (existing === undefined) {
            throw new StatusResponseError("No such ICD client registration", Status.NotFound);
        }

        if (!this.#isAdministrator()) {
            // @see {@link MatterSpecification.v151.Core} § 9.16.7.3 step 2
            const stored = this.internal.icdKeys.get(this.#keyFor(fabricIndex, request.checkInNodeId));
            if (
                request.verificationKey === undefined ||
                stored === undefined ||
                !Bytes.areEqual(request.verificationKey, stored.key)
            ) {
                throw new StatusResponseError("VerificationKey mismatch", Status.Failure);
            }
        }

        this.state.registeredClients = this.state.registeredClients.filter(
            c => !(c.fabricIndex === fabricIndex && c.checkInNodeId === request.checkInNodeId),
        );
        this.internal.icdKeys.delete(this.#keyFor(fabricIndex, request.checkInNodeId));
        this.#persistKeys();
        fabric.icd.deleteRegistration(request.checkInNodeId);
    }

    /**
     * Returns true when the invoking session has Administer privilege on this cluster.
     *
     * Administer skips the verificationKey check on register update and unregister; Manage must provide it.
     * @see {@link MatterSpecification.v151.Core} § 9.16.7.1 step 2
     * @see {@link MatterSpecification.v151.Core} § 9.16.7.3 step 2
     */
    #isAdministrator(): boolean {
        const context = this.context;
        if (!hasRemoteActor(context)) {
            return false;
        }
        const location: AccessControl.Location = {
            path: DataModelPath.none,
            endpoint: this.endpoint.number,
            cluster: this.cluster.id,
        };
        return context.authorityAt(AccessLevel.Administer, location) === AccessControl.Authority.Granted;
    }

    #keyFor(fabricIndex: FabricIndex, checkInNodeId: NodeId): string {
        return `${fabricIndex}:${checkInNodeId}`;
    }

    #persistKeys() {
        this.state.icdKeys = [...this.internal.icdKeys.values()];
    }
}

export namespace IcdManagementServer {
    /** Persisted key entry. */
    export class IcdKeyEntry {
        @field(fabricIdx)
        fabricIndex!: FabricIndex;

        @field(nodeId)
        checkInNodeId!: NodeId;

        @field(octstr)
        key!: Bytes;
    }

    export class State extends Base.State {
        /** Persisted ICDToken keys, mirroring the per-registration key not stored in the RegisteredClients attribute. */
        @field(listOf(IcdKeyEntry), nonvolatile)
        icdKeys: IcdKeyEntry[] = [];
    }

    export class Internal {
        icdCounter?: IcdCounter;
        icdKeys: Map<string, IcdKeyEntry> = new Map();
    }
}
