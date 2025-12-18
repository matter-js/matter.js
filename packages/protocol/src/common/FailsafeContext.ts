/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AsyncObservable,
    Bytes,
    Construction,
    Duration,
    Logger,
    MatterFlowError,
    UnexpectedDataError,
    UninitializedDependencyError,
} from "#general";
import type { MessageExchange } from "#protocol/MessageExchange.js";
import type { NodeSession } from "#session/NodeSession.js";
import { CaseAuthenticatedTag, NodeId, ValidationError, VendorId } from "#types";
import { Fabric, FabricBuilder } from "../fabric/Fabric.js";
import { FabricManager } from "../fabric/FabricManager.js";
import { SessionManager } from "../session/SessionManager.js";
import { FailsafeTimer, MatterFabricConflictError } from "./FailsafeTimer.js";

const logger = Logger.get("FailsafeContext");

export class MatterFabricInvalidAdminSubjectError extends MatterFlowError {}

/**
 * A "timed operation" is a command or sequence of commands that operate with a failsafe timer that will abort the
 * operation if it does not complete within a specific window.
 *
 * FailsafeContext maintains the failsafe timer and tracks information required to rollback state if the operation
 * aborts.
 *
 * Timed operations are exclusive for a node.
 */
export abstract class FailsafeContext {
    #sessions: SessionManager;
    #fabrics: FabricManager;
    #failsafe?: FailsafeTimer;
    #construction: Construction<FailsafeContext>;
    #associatedFabric?: Fabric;
    #csrSessionId?: number;
    #forUpdateNoc?: boolean;
    #fabricBuilder?: FabricBuilder;
    #rootCertSet = false;

    #commissioned = AsyncObservable<[], void>();

    constructor(options: FailsafeContext.Options) {
        const { sessions, fabrics, expiryLength, session, maxCumulativeFailsafe } = options;

        this.#sessions = sessions;
        this.#fabrics = fabrics;
        this.#associatedFabric = session.fabric;

        this.#construction = Construction(this, async () => {
            this.#fabricBuilder = await FabricBuilder.create(this.#fabrics.crypto);
            // Ensure derived class construction is complete
            await Promise.resolve();

            await this.storeEndpointState();

            // If ExpiryLengthSeconds is non-zero and the fail-safe timer was not currently armed, then the fail-safe
            // timer SHALL be armed for that duration.
            this.#failsafe = new FailsafeTimer(
                this.#associatedFabric,
                expiryLength,
                maxCumulativeFailsafe,
                this.#failSafeExpired.bind(this),
            );
            logger.debug(`Arm failSafe timer for ${Duration.format(expiryLength)}`);

            // When the PASE session used to arm the Fail-Safe timer is terminated by peer, the Fail-Safe timer SHALL
            // be considered expired and do the relevant cleanup actions.
            session.closedByPeer.on(() => {
                if (!this.#failsafe?.completed) {
                    return this.#failSafeExpired();
                }
            });
        });
    }

    async extend(fabric: Fabric | undefined, expiryLength: Duration, currentExchange?: MessageExchange) {
        await this.#construction;
        await this.#failsafe?.reArm(fabric, expiryLength, currentExchange);
        if (expiryLength > 0) {
            logger.debug(`Extend failSafe timer for ${Duration.format(expiryLength)}`);
        }
    }

    get fabricIndex() {
        return this.#builder.fabricIndex;
    }

    get construction() {
        return this.#construction;
    }

    get commissioned() {
        return this.#commissioned;
    }

    get associatedFabric() {
        return this.#associatedFabric;
    }

    get csrSessionId() {
        return this.#csrSessionId;
    }

    get forUpdateNoc() {
        return this.#forUpdateNoc;
    }

    get rootCertSet() {
        return this.#rootCertSet;
    }

    get hasRootCert() {
        return this.#builder.rootCert !== undefined;
    }

    get rootCert() {
        return this.#builder.rootCert;
    }

    async completeCommission() {
        // 1. The Fail-Safe timer associated with the current Fail-Safe context SHALL be disarmed.
        if (this.#failsafe === undefined) {
            throw new MatterFlowError("armFailSafe should be called first!"); // TODO
        }
        this.#failsafe.complete();

        if (this.fabricIndex !== undefined) {
            await this.#fabrics.persistFabrics();
        }

        this.#failsafe = undefined;

        // 2. The commissioning window at the Server SHALL be closed.
        await this.commissioned.emit();

        // TODO 3. Any temporary administrative privileges automatically granted to any open PASE session SHALL be revoked (see Section 6.6.2.8, “Bootstrapping of the Access Control Cluster”).

        // 4. The Secure Session Context of any PASE session still established at the Server SHALL be cleared.
        await this.closePaseSession();

        await this.close();
    }

    getFailSafeContext() {
        if (this.#failsafe === undefined) throw new MatterFlowError("armFailSafe should be called first!");
        return this.#failsafe;
    }

    getNextFabricIndex() {
        return this.#fabrics.allocateFabricIndex();
    }

    async replaceFabric(fabric: Fabric) {
        await this.#fabrics.replaceFabric(fabric);
        await this.#sessions.deleteResumptionRecordsForFabric(fabric);
    }

    /**
     * Handles a CSR from OperationalCredentials cluster and stores additional internal information for further
     * validity checks.
     */
    createCertificateSigningRequest(isForUpdateNoc: boolean, sessionId: number) {
        if (this.#fabrics.findByKeypair(this.#builder.keyPair)) {
            throw new MatterFlowError("Key pair already exists."); // becomes Failure as StatusResponse
        }

        const result = this.#builder.createCertificateSigningRequest();
        this.#csrSessionId = sessionId;
        this.#forUpdateNoc = isForUpdateNoc;
        return result;
    }

    async closePaseSession(currentExchange?: MessageExchange) {
        const session = this.#sessions.getPaseSession();
        if (session) {
            await session.initiateForceClose(currentExchange);
        }
    }

    async close(currentExchange?: MessageExchange) {
        await this.#construction.close(async () => {
            if (this.#failsafe) {
                await this.#failsafe.close();
                this.#failsafe = undefined;
                await this.rollback(currentExchange);
            }
        });
    }

    /** Handles adding a trusted root certificate from Operational Credentials cluster. */
    async setRootCert(rootCert: Bytes) {
        await this.#builder.setRootCert(rootCert);
        this.#rootCertSet = true;
    }

    /**
     * Build a new Fabric object based on an existing fabric for the "UpdateNoc" case of the Operational Credentials
     * cluster.
     */
    async buildUpdatedFabric(nocValue: Bytes, icacValue: Bytes | undefined) {
        if (this.associatedFabric === undefined) {
            throw new MatterFlowError("No fabric associated with failsafe context, but we prepare an Fabric update.");
        }
        this.#builder.initializeFromFabricForUpdate(this.associatedFabric);
        await this.#builder.setOperationalCert(nocValue, icacValue);
        return await this.#builder.build(this.associatedFabric.fabricIndex);
    }

    /** Build a new Fabric object for a new fabric for the "AddNoc" case of the Operational Credentials cluster. */
    async buildFabric(nocData: {
        nocValue: Bytes;
        icacValue: Bytes | undefined;
        adminVendorId: VendorId;
        ipkValue: Bytes;
        caseAdminSubject: NodeId;
    }) {
        const builder = this.#builder;

        const { nocValue, icacValue, adminVendorId, ipkValue, caseAdminSubject } = nocData;

        // Handle error if the CaseAdminSubject field is not a valid ACL subject in the context of AuthMode set to CASE
        if (!NodeId.isOperationalNodeId(caseAdminSubject) && !NodeId.isCaseAuthenticatedTag(caseAdminSubject)) {
            try {
                if (CaseAuthenticatedTag.getVersion(NodeId.extractAsCaseAuthenticatedTag(caseAdminSubject)) === 0) {
                    throw new MatterFabricInvalidAdminSubjectError();
                }
            } catch (error) {
                // Validation error can happen when parsing the CaseAuthenticatedTag, then it is invalid too
                if (error instanceof ValidationError || error instanceof UnexpectedDataError) {
                    throw new MatterFabricInvalidAdminSubjectError();
                } else {
                    throw error;
                }
            }
        }

        await builder.setOperationalCert(nocValue, icacValue);
        const newGlobalId = await builder.globalId;

        if (this.#fabrics.has(newGlobalId)) {
            throw new MatterFabricConflictError(
                `Fabric with Id ${builder.fabricId} and Node Id ${builder.nodeId} already exists.`,
            );
        }

        this.#associatedFabric = await builder
            .setRootVendorId(adminVendorId)
            .setIdentityProtectionKey(ipkValue)
            .setRootNodeId(caseAdminSubject)
            .build(this.#fabrics.allocateFabricIndex());
        this.#fabrics.addFabric(this.#associatedFabric);

        if (this.#failsafe) {
            this.#failsafe.associatedFabric = this.#associatedFabric;
        }

        return this.#associatedFabric;
    }

    async #failSafeExpired(currentExchange?: MessageExchange) {
        logger.info("Failsafe timer expired; resetting fabric builder");

        await this.close(currentExchange);
    }

    protected async rollback(currentExchange?: MessageExchange) {
        if (this.fabricIndex !== undefined && !this.#forUpdateNoc) {
            logger.debug(`Revoking fabric index ${this.fabricIndex}`);
            await this.#associatedFabric?.delete(currentExchange);
        }

        // On expiry of the fail-safe timer, the following actions SHALL be performed in order:
        // 1. Terminate any open PASE secure session by clearing any associated Secure Session Context at the Server.
        await this.closePaseSession(currentExchange);

        // TODO 2. Revoke the temporary administrative privileges granted to any open PASE session (see Section 6.6.2.8, “Bootstrapping of the Access Control Cluster”) at the Server.

        // 3. If an AddNOC or UpdateNOC command has been successfully invoked, terminate all CASE sessions associated with the Fabric whose Fabric Index is recorded in the Fail-Safe context (see Section 11.9.6.2, “ArmFailSafe Command”) by clearing any associated Secure Session Context at the Server.
        let fabric: Fabric | undefined = undefined;
        if (this.fabricIndex !== undefined) {
            const fabricIndex = this.fabricIndex;
            if (this.#fabrics.has(fabricIndex)) {
                fabric = this.#fabrics.for(fabricIndex);
                for (const session of this.#sessions.sessionsForFabricIndex(fabricIndex)) {
                    await session.initiateForceClose(currentExchange);
                }
            }
        }

        // 4. Reset the configuration of all Network Commissioning Networks attribute to their state prior to the
        //    Fail-Safe being armed.
        await this.restoreNetworkState();

        // 5. If an UpdateNOC command had been successfully invoked, revert the state of operational key pair, NOC and
        //    ICAC for that Fabric to the state prior to the Fail-Safe timer being armed, for the Fabric Index that was
        //    the subject of the UpdateNOC command.
        if (this.#forUpdateNoc && this.associatedFabric !== undefined) {
            // update FabricManager and Resumption records but leave current session intact
            await this.restoreFabric(this.associatedFabric);
        }

        // 6. If an AddNOC command had been successfully invoked, achieve the equivalent effect of invoking the RemoveFabric command against the Fabric Index stored in the Fail-Safe Context for the Fabric Index that was the subject of the AddNOC command. This SHALL remove all associations to that Fabric including all fabric-scoped data, and MAY possibly factory-reset the device depending on current device state. This SHALL only apply to Fabrics added during the fail-safe period as the result of the AddNOC command.
        // 7. Remove any RCACs added by the AddTrustedRootCertificate command that are not currently referenced by any entry in the Fabrics attribute.
        if (!this.#forUpdateNoc && fabric !== undefined) {
            await this.#associatedFabric?.delete();
        }

        // 8. Reset the Breadcrumb attribute to zero.
        await this.restoreBreadcrumb();

        // TODO 9. Optionally: if no factory-reset resulted from the previous steps, it is RECOMMENDED that the
        //  Node rollback the state of all non fabric-scoped data present in the Fail-Safe context.
        //  In theory happens automatically by revoking last fabric
    }

    abstract storeEndpointState(): Promise<void>;

    /** Restore Cluster data when the FailSafe context expired. */
    abstract restoreNetworkState(): Promise<void>;

    async restoreFabric(fabric: Fabric) {
        await this.replaceFabric(fabric);
    }

    abstract restoreBreadcrumb(): Promise<void>;

    get #builder() {
        if (this.#fabricBuilder === undefined) {
            throw new UninitializedDependencyError("FailsafeContext", "Fabric builder has not been initialized");
        }
        return this.#fabricBuilder;
    }
}

export namespace FailsafeContext {
    export interface Options {
        sessions: SessionManager;
        fabrics: FabricManager;
        expiryLength: Duration;
        maxCumulativeFailsafe: Duration;
        session: NodeSession;
    }
}
