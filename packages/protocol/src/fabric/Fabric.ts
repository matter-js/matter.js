/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Certificate } from "#certificate/kinds/Certificate.js";
import { Icac } from "#certificate/kinds/Icac.js";
import { Noc } from "#certificate/kinds/Noc.js";
import { Rcac } from "#certificate/kinds/Rcac.js";
import {
    AsyncObservable,
    BinaryKeyPair,
    Bytes,
    Crypto,
    DataWriter,
    Diagnostic,
    Endian,
    ImplementationError,
    InternalError,
    Key,
    Logger,
    MatterError,
    MatterFlowError,
    MaybePromise,
    PrivateKey,
    StorageContext,
} from "#general";
import { FabricGroups, GROUP_SECURITY_INFO } from "#groups/FabricGroups.js";
import { FabricAccessControl } from "#interaction/FabricAccessControl.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { SecureSession } from "#session/SecureSession.js";
import {
    CaseAuthenticatedTag,
    FabricId,
    FabricIndex,
    GlobalFabricId,
    GroupId,
    NodeId,
    StatusResponse,
    VendorId,
} from "#types";

const logger = Logger.get("Fabric");

export class PublicKeyError extends MatterError {}

export type ExposedFabricInformation = {
    fabricIndex: FabricIndex;
    fabricId: FabricId;
    nodeId: NodeId;
    rootNodeId: NodeId;
    rootVendorId: VendorId;
    label: string;
};

export class Fabric {
    readonly #crypto: Crypto;
    readonly fabricIndex: FabricIndex;
    readonly fabricId: FabricId;
    readonly nodeId: NodeId;
    readonly rootNodeId: NodeId;
    readonly globalId: GlobalFabricId;
    #rootPublicKey?: Bytes;
    #rootVendorId: VendorId;
    readonly rootCert: Bytes;
    readonly identityProtectionKey: Bytes;
    readonly operationalIdentityProtectionKey: Bytes;
    readonly intermediateCACert: Bytes | undefined;
    readonly operationalCert: Bytes;
    readonly #keyPair: Key;
    readonly #sessions = new Set<SecureSession>();
    readonly #groups: FabricGroups;
    readonly #accessControl: FabricAccessControl;

    readonly #leaving = AsyncObservable<[]>();
    readonly #deleting = AsyncObservable<[]>();
    readonly #deleted = AsyncObservable<[]>();

    #vidVerificationStatement?: Bytes;
    #vvsc?: Bytes;
    #label: string;
    #persistCallback: ((isUpdate?: boolean) => MaybePromise<void>) | undefined;
    #storage?: StorageContext;
    #isDeleting?: boolean;

    /**
     * Create a fabric synchronously.
     *
     * Certain derived fields that require async crypto operations to compute must be supplied here.  Use {@link create}
     * to populate these fields automatically.
     */
    constructor(crypto: Crypto, config: Fabric.ConstructorConfig) {
        this.#crypto = crypto;
        this.fabricIndex = config.fabricIndex;
        this.fabricId = config.fabricId;
        this.nodeId = config.nodeId;
        this.rootNodeId = config.rootNodeId;
        if ("operationalId" in config) {
            this.globalId = GlobalFabricId(config.operationalId);
        } else {
            this.globalId = config.globalId;
        }
        this.#rootPublicKey = config.rootPublicKey;
        this.#rootVendorId = config.rootVendorId;
        this.rootCert = config.rootCert;
        this.identityProtectionKey = config.identityProtectionKey;
        this.operationalIdentityProtectionKey = config.operationalIdentityProtectionKey;
        this.intermediateCACert = config.intermediateCACert;
        this.operationalCert = config.operationalCert;
        this.#vidVerificationStatement = config.vidVerificationStatement;
        this.#vvsc = config.vvsc;
        this.#label = config.label;
        this.#keyPair = PrivateKey(config.keyPair);
        this.#accessControl = new FabricAccessControl(this);
        this.#groups = new FabricGroups(this);
    }

    /**
     * Create a fabric.
     *
     * This async creation path populates derived fields that require async crypto operations to compute.
     */
    static async create(crypto: Crypto, config: Fabric.Config) {
        let { globalId, operationalIdentityProtectionKey } = config;

        // Compute global ID if not passed as config
        if (globalId === undefined) {
            const caKey = config.rootPublicKey ?? Rcac.publicKeyOfTlv(config.rootCert);
            globalId = await GlobalFabricId.compute(crypto, config.fabricId, caKey);
        }

        // Compute operational IPK if not passed as config
        if (operationalIdentityProtectionKey === undefined) {
            operationalIdentityProtectionKey = await crypto.createHkdfKey(
                config.identityProtectionKey,
                Bytes.fromBigInt(globalId),
                GROUP_SECURITY_INFO,
            );
        }

        return new Fabric(crypto, {
            ...config,
            globalId,
            operationalIdentityProtectionKey,
        });
    }

    get crypto() {
        return this.#crypto;
    }

    /**
     * Obtain configuration required to recreate fabric.
     *
     * TODO - we currently use this for persistence; remove when we move to OperationalCredentials as "source of truth"
     */
    get config(): Fabric.SyncConfig {
        const config = {
            fabricIndex: this.fabricIndex,
            fabricId: this.fabricId,
            nodeId: this.nodeId,
            rootNodeId: this.rootNodeId,
            globalId: this.globalId,
            rootPublicKey: this.rootPublicKey,
            keyPair: this.#keyPair.keyPair,
            rootVendorId: this.rootVendorId,
            rootCert: this.rootCert,
            identityProtectionKey: this.identityProtectionKey,
            operationalIdentityProtectionKey: this.operationalIdentityProtectionKey,
            intermediateCACert: this.intermediateCACert,
            operationalCert: this.operationalCert,
            vidVerificationStatement: this.vidVerificationStatement,
            label: this.#label,
        };

        // Backwards compatibility
        (config as unknown as { operationalId: Bytes }).operationalId = Bytes.fromBigInt(this.globalId);

        return config;
    }

    get label() {
        return this.#label;
    }

    async setLabel(label: string) {
        if (label.length === 0 || label.length > 32) {
            throw new ImplementationError("Fabric label must be between 1 and 32 characters long.");
        }
        if (this.#label === label) {
            return;
        }
        this.#label = label;
        await this.persist();
    }

    get vidVerificationStatement() {
        return this.#vidVerificationStatement;
    }

    async updateVendorVerificationData(
        vendorId: VendorId | undefined,
        vidVerificationStatement: Bytes | undefined,
        vvsc: Bytes | undefined,
    ) {
        if (vvsc !== undefined && this.intermediateCACert !== undefined) {
            throw new StatusResponse.InvalidCommandError("A VVSC is only allowed without an ICAC.");
        }

        if (vidVerificationStatement !== undefined) {
            if (vidVerificationStatement.byteLength === 0) {
                this.#vidVerificationStatement = undefined;
            } else if (vidVerificationStatement.byteLength === 85) {
                // VERIFICATION_STATEMENT_SIZE
                this.#vidVerificationStatement = vidVerificationStatement;
            } else {
                throw new StatusResponse.ConstraintErrorError("VID Verification Statement must be 0 or 85 bytes long.");
            }
        }
        if (vendorId !== undefined) {
            this.#rootVendorId = vendorId;
        }
        if (vvsc !== undefined) {
            if (vvsc.byteLength === 0) {
                this.#vvsc = undefined;
            } else {
                this.#vvsc = vvsc;
            }
        }
        logger.info(
            "Updated Vendor Verification Data for Fabric",
            this.#rootVendorId,
            this.#vidVerificationStatement,
            this.#vvsc,
        );
        await this.persist();
    }

    get vvsc() {
        return this.#vvsc;
    }

    get rootPublicKey() {
        if (this.#rootPublicKey === undefined) {
            this.#rootPublicKey = Rcac.publicKeyOfTlv(this.rootCert);
        }
        return this.#rootPublicKey;
    }

    get rootVendorId() {
        return this.#rootVendorId;
    }

    set storage(storage: StorageContext) {
        this.#storage = storage;
        this.#groups.storage = storage;
    }

    get storage(): StorageContext | undefined {
        return this.#storage;
    }

    get groups() {
        return this.#groups;
    }

    get accessControl() {
        return this.#accessControl;
    }

    get publicKey() {
        return this.#keyPair.publicKey;
    }

    get isDeleting() {
        return this.#isDeleting;
    }

    get leaving() {
        return this.#leaving;
    }

    get deleting() {
        return this.#deleting;
    }

    get deleted() {
        return this.#deleted;
    }

    sign(data: Bytes) {
        return this.crypto.signEcdsa(this.#keyPair, data);
    }

    async verifyCredentials(operationalCert: Bytes, intermediateCACert?: Bytes) {
        const rootCert = Rcac.fromTlv(this.rootCert);
        const nocCert = Noc.fromTlv(operationalCert);
        const icaCert = intermediateCACert !== undefined ? Icac.fromTlv(intermediateCACert) : undefined;
        if (icaCert !== undefined) {
            // Validate ICACertificate against Root Certificate
            await icaCert.verify(this.#crypto, rootCert);
        }
        // Validate NOC Certificate against ICA Certificate
        await nocCert.verify(this.#crypto, rootCert, icaCert);
    }

    matchesFabricIdAndRootPublicKey(fabricId: FabricId, rootPublicKey: Bytes) {
        return this.fabricId === fabricId && Bytes.areEqual(this.rootPublicKey, rootPublicKey);
    }

    matchesKeyPair(keyPair: Key) {
        return (
            Bytes.areEqual(this.#keyPair.publicKey, keyPair.publicKey) &&
            Bytes.areEqual(this.#keyPair.privateKey, keyPair.privateKey)
        );
    }

    #generateSalt(nodeId: NodeId, random: Bytes) {
        const writer = new DataWriter(Endian.Little);
        writer.writeByteArray(random);
        writer.writeByteArray(this.rootPublicKey);
        writer.writeUInt64(this.fabricId);
        writer.writeUInt64(nodeId);
        return writer.toByteArray();
    }

    /**
     * Returns the destination IDs for a given nodeId, random value and optional groupId. When groupId is provided, it
     * returns the time-wise valid operational keys for that groupId.
     */
    async currentDestinationIdFor(nodeId: NodeId, random: Bytes) {
        return this.#crypto.signHmac(this.groups.keySets.currentKeyForId(0).key, this.#generateSalt(nodeId, random));
    }

    /**
     * Returns the destination IDs for a given nodeId, random value and optional groupId. When groupId is provided, it
     * returns all operational keys for that groupId.
     */
    async destinationIdsFor(nodeId: NodeId, random: Bytes) {
        const salt = this.#generateSalt(nodeId, random);
        logger.debug(
            "keys for destinies",
            this.groups.keySets.allKeysForId(0).map(({ key }) => Bytes.toHex(key)),
        );
        // Check all keys of keyset 0 - typically it is only the IPK
        const destinationIds = this.groups.keySets.allKeysForId(0).map(({ key }) => this.#crypto.signHmac(key, salt));
        return await Promise.all(destinationIds);
    }

    addSession(session: SecureSession) {
        this.#sessions.add(session);
    }

    deleteSession(session: SecureSession) {
        this.#sessions.delete(session);
    }

    hasSessionForPeer(peerNodeId: NodeId) {
        for (const session of this.#sessions) {
            if (session.peerNodeId === peerNodeId) {
                return true;
            }
        }
    }

    set persistCallback(callback: (isUpdate?: boolean) => MaybePromise<void>) {
        // TODO Remove "isUpdate" parameter as soon as the fabric scoped data are removed from here/legacy API gets removed
        this.#persistCallback = callback;
    }

    /**
     * Gracefully exit the fabric.
     *
     * Devices should use this to cleanly exit a fabric.  It flushes subscriptions to ensure the "leave" event emits
     * and closes sessions.
     */
    async leave(currentExchange?: MessageExchange) {
        await this.#leaving.emit();

        for (const session of [...this.#sessions]) {
            await session.initiateClose(async () => {
                await session.closeSubscriptions(true);
            });
        }

        await this.delete(currentExchange);
    }

    /**
     * Permanently remove the fabric.
     *
     * Does not emit the leave event.
     */
    async delete(currentExchange?: MessageExchange) {
        this.#isDeleting = true;

        await this.#deleting.emit();

        for (const session of [...this.#sessions]) {
            await session.initiateForceClose(currentExchange);
        }

        await this.#deleted.emit();
    }

    persist(isUpdate = true) {
        return this.#persistCallback?.(isUpdate);
    }

    get externalInformation(): ExposedFabricInformation {
        return {
            fabricIndex: this.fabricIndex,
            fabricId: this.fabricId,
            nodeId: this.nodeId,
            rootNodeId: this.rootNodeId,
            rootVendorId: this.rootVendorId,
            label: this.#label,
        };
    }

    addressOf(nodeId: NodeId): PeerAddress {
        return PeerAddress({ fabricIndex: this.fabricIndex, nodeId });
    }

    groupAddressOf(groupId: GroupId) {
        GroupId.assertGroupId(groupId);

        return PeerAddress({ fabricIndex: this.fabricIndex, nodeId: NodeId.fromGroupId(groupId) });
    }
}

export class FabricBuilder {
    #crypto: Crypto;
    #keyPair: PrivateKey;
    #rootVendorId?: VendorId;
    #rootCert?: Bytes;
    #intermediateCACert?: Bytes;
    #operationalCert?: Bytes;
    #fabricId?: FabricId;
    #nodeId?: NodeId;
    #rootNodeId?: NodeId;
    #identityProtectionKey?: Bytes;
    #vidVerificationStatement?: Bytes;
    #vvsc?: Bytes;
    #fabricIndex?: FabricIndex;
    #label = "";

    constructor(crypto: Crypto, key: PrivateKey) {
        this.#crypto = crypto;
        this.#keyPair = key;
    }

    static async create(crypto: Crypto) {
        return new FabricBuilder(crypto, await crypto.createKeyPair());
    }

    get publicKey() {
        return this.#keyPair.publicKey;
    }

    get fabricIndex() {
        return this.#fabricIndex;
    }

    createCertificateSigningRequest() {
        return Certificate.createCertificateSigningRequest(this.#crypto, this.#keyPair);
    }

    async setRootCert(rootCert: Bytes) {
        const root = Rcac.fromTlv(rootCert);
        await root.verify(this.#crypto);
        this.#rootCert = rootCert;
        return this;
    }

    get rootCert() {
        return this.#rootCert;
    }

    async setOperationalCert(operationalCert: Bytes, intermediateCACert?: Bytes) {
        if (intermediateCACert !== undefined && intermediateCACert.byteLength === 0) {
            intermediateCACert = undefined;
        }
        const {
            subject: { nodeId, fabricId, caseAuthenticatedTags },
            ellipticCurvePublicKey,
        } = Noc.fromTlv(operationalCert).cert;
        logger.debug(
            "Installing operational certificate",
            Diagnostic.dict({ nodeId: NodeId.strOf(nodeId), fabricId, caseAuthenticatedTags }),
        );
        if (caseAuthenticatedTags !== undefined) {
            CaseAuthenticatedTag.validateNocTagList(caseAuthenticatedTags);
        }

        if (!Bytes.areEqual(ellipticCurvePublicKey, this.#keyPair.publicKey)) {
            throw new PublicKeyError("Operational certificate does not match public key");
        }

        if (this.#rootCert === undefined) {
            throw new MatterFlowError("Root certificate needs to be set first");
        }

        const rootCert = Rcac.fromTlv(this.#rootCert);
        const nocCert = Noc.fromTlv(operationalCert);
        const icaCert = intermediateCACert !== undefined ? Icac.fromTlv(intermediateCACert) : undefined;
        if (icaCert !== undefined) {
            await icaCert.verify(this.#crypto, rootCert);
        }
        await nocCert.verify(this.#crypto, rootCert, icaCert);

        this.#operationalCert = operationalCert;
        this.#intermediateCACert = intermediateCACert;
        this.#fabricId = FabricId(fabricId);
        this.#nodeId = nodeId;

        return this;
    }

    setRootVendorId(rootVendorId: VendorId) {
        this.#rootVendorId = rootVendorId;
        return this;
    }

    setRootNodeId(rootNodeId: NodeId) {
        this.#rootNodeId = rootNodeId;
        return this;
    }

    setIdentityProtectionKey(key: Bytes) {
        this.#identityProtectionKey = key;
        return this;
    }

    setLabel(label: string) {
        if (label.length === 0 || label.length > 32) {
            throw new ImplementationError("Fabric label must be between 1 and 32 characters long.");
        }
        this.#label = label;
        return this;
    }

    initializeFromFabricForUpdate(fabric: Fabric) {
        this.#rootVendorId = fabric.rootVendorId;
        this.#rootNodeId = fabric.rootNodeId;
        this.#identityProtectionKey = fabric.identityProtectionKey;
        this.#rootCert = fabric.rootCert;
        this.#vidVerificationStatement = fabric.vidVerificationStatement;
        this.#vvsc = fabric.vvsc;
        this.#label = fabric.label;
    }

    get globalId() {
        if (this.#fabricId === undefined || this.#rootCert === undefined) {
            throw new MatterFlowError("Node Operational Data needs to be set first.");
        }
        return GlobalFabricId.compute(this.#crypto, this.#fabricId, Rcac.publicKeyOfTlv(this.#rootCert));
    }

    get nodeId() {
        return this.#nodeId;
    }

    get fabricId() {
        return this.#fabricId;
    }

    get keyPair() {
        return this.#keyPair;
    }

    async build(fabricIndex: FabricIndex) {
        if (this.#fabricIndex !== undefined) throw new InternalError("FabricBuilder can only be built once");
        if (this.#rootNodeId === undefined) throw new InternalError("rootNodeId needs to be set");
        if (this.#rootVendorId === undefined) throw new InternalError("vendorId needs to be set");
        if (this.#rootCert === undefined) throw new InternalError("rootCert needs to be set");
        if (this.#identityProtectionKey === undefined) throw new InternalError("identityProtectionKey needs to be set");
        if (this.#operationalCert === undefined || this.#fabricId === undefined || this.#nodeId === undefined)
            throw new InternalError("operationalCert needs to be set");

        this.#fabricIndex = fabricIndex;

        return await Fabric.create(this.#crypto, {
            fabricIndex: this.#fabricIndex,
            fabricId: this.#fabricId,
            nodeId: this.#nodeId,
            rootNodeId: this.#rootNodeId,
            keyPair: this.#keyPair,
            rootVendorId: this.#rootVendorId,
            rootCert: this.#rootCert,
            identityProtectionKey: this.#identityProtectionKey, // Epoch Key
            intermediateCACert: this.#intermediateCACert,
            operationalCert: this.#operationalCert,
            vidVerificationStatement: this.#vidVerificationStatement,
            vvsc: this.#vvsc,
            label: this.#label,
        });
    }
}

export namespace Fabric {
    /**
     * Configuration required to initialize a fabric.
     */
    export type Config = {
        fabricIndex: FabricIndex;
        fabricId: FabricId;
        nodeId: NodeId;
        rootNodeId: NodeId;
        keyPair: BinaryKeyPair;
        rootVendorId: VendorId;
        rootCert: Bytes;
        identityProtectionKey: Bytes;
        vidVerificationStatement?: Bytes;
        vvsc?: Bytes;
        intermediateCACert: Bytes | undefined;
        operationalCert: Bytes;
        label: string;

        // These are derived; Fabric.create() will generate if necessary
        rootPublicKey?: Bytes;
        globalId?: GlobalFabricId;
        operationalIdentityProtectionKey?: Bytes;
    };

    /**
     * Configuration required to initialize a fabric without asynchronous crypto operations.
     */
    export type SyncConfig = Config & {
        operationalIdentityProtectionKey: Bytes;
        globalId: GlobalFabricId;
    };

    /**
     * Configuration passed to fabric constructor.
     *
     * Provides deprecated fields for backwards compatibility.
     */
    export type ConstructorConfig = Omit<SyncConfig, "globalId"> &
        (
            | {
                  globalId: GlobalFabricId;
              }
            | {
                  /** @deprecated */
                  operationalId: Bytes;
              }
        );

    /**
     * An object that may be used to identify a fabric.
     */
    export type Identifier = FabricIndex | GlobalFabricId | { fabricIndex: FabricIndex };
}
