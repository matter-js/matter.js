/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Icac } from "#certificate/kinds/Icac.js";
import { Noc } from "#certificate/kinds/Noc.js";
import { Rcac } from "#certificate/kinds/Rcac.js";
import { X509Base } from "#certificate/kinds/X509Base.js";
import {
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
import { Session } from "#session/Session.js";
import { CaseAuthenticatedTag, FabricId, FabricIndex, GroupId, NodeId, VendorId } from "#types";

const logger = Logger.get("Fabric");

const COMPRESSED_FABRIC_ID_INFO = Bytes.fromString("CompressedFabric");

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
    readonly operationalId: Bytes;
    readonly rootPublicKey: Bytes;
    readonly rootVendorId: VendorId;
    readonly rootCert: Bytes;
    readonly identityProtectionKey: Bytes;
    readonly operationalIdentityProtectionKey: Bytes;
    readonly intermediateCACert: Bytes | undefined;
    readonly operationalCert: Bytes;
    readonly #keyPair: Key;
    readonly #sessions = new Set<Session>();
    readonly #groups: FabricGroups;
    readonly #accessControl: FabricAccessControl;
    #label: string;
    #removeCallbacks = new Array<() => MaybePromise<void>>();
    #persistCallback: ((isUpdate?: boolean) => MaybePromise<void>) | undefined;
    #storage?: StorageContext;

    constructor(crypto: Crypto, config: Fabric.Config) {
        this.#crypto = crypto;
        this.fabricIndex = config.fabricIndex;
        this.fabricId = config.fabricId;
        this.nodeId = config.nodeId;
        this.rootNodeId = config.rootNodeId;
        this.operationalId = config.operationalId;
        this.rootPublicKey = config.rootPublicKey;
        this.rootVendorId = config.rootVendorId;
        this.rootCert = config.rootCert;
        this.identityProtectionKey = config.identityProtectionKey;
        this.operationalIdentityProtectionKey = config.operationalIdentityProtectionKey;
        this.intermediateCACert = config.intermediateCACert;
        this.operationalCert = config.operationalCert;
        this.#label = config.label;
        this.#keyPair = PrivateKey(config.keyPair);
        this.#accessControl = new FabricAccessControl(this);
        this.#groups = new FabricGroups(this);
    }

    get crypto() {
        return this.#crypto;
    }

    get config(): Fabric.Config {
        return {
            fabricIndex: this.fabricIndex,
            fabricId: this.fabricId,
            nodeId: this.nodeId,
            rootNodeId: this.rootNodeId,
            operationalId: this.operationalId,
            rootPublicKey: this.rootPublicKey,
            keyPair: this.#keyPair.keyPair,
            rootVendorId: this.rootVendorId,
            rootCert: this.rootCert,
            identityProtectionKey: this.identityProtectionKey,
            operationalIdentityProtectionKey: this.operationalIdentityProtectionKey,
            intermediateCACert: this.intermediateCACert,
            operationalCert: this.operationalCert,
            label: this.#label,
        };
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
        // Check all keys of keyset 0 - typically it is only the IPK
        const destinationIds = this.groups.keySets.allKeysForId(0).map(({ key }) => this.#crypto.signHmac(key, salt));
        return await Promise.all(destinationIds);
    }

    addSession(session: Session) {
        this.#sessions.add(session);
    }

    removeSession(session: Session) {
        this.#sessions.delete(session);
    }

    hasSessionForPeer(peerNodeId: NodeId) {
        for (const session of this.#sessions) {
            if (session.peerNodeId === peerNodeId) {
                return true;
            }
        }
    }

    addRemoveCallback(callback: () => MaybePromise<void>) {
        this.#removeCallbacks.push(callback);
    }

    deleteRemoveCallback(callback: () => MaybePromise<void>) {
        const index = this.#removeCallbacks.indexOf(callback);
        if (index >= 0) {
            this.#removeCallbacks.splice(index, 1);
        }
    }

    set persistCallback(callback: (isUpdate?: boolean) => MaybePromise<void>) {
        // TODO Remove "isUpdate" parameter as soon as the fabric scoped data are removed from here/legacy API gets removed
        this.#persistCallback = callback;
    }

    async remove(currentSessionId?: number) {
        for (const callback of this.#removeCallbacks) {
            await callback();
        }
        for (const session of [...this.#sessions]) {
            await session.destroy(false, session.id === currentSessionId); // Delay Close for current session only
        }
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
    #rootPublicKey?: Bytes;
    #identityProtectionKey?: Bytes;
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
        return X509Base.createCertificateSigningRequest(this.#crypto, this.#keyPair);
    }

    async setRootCert(rootCert: Bytes) {
        const root = Rcac.fromTlv(rootCert);
        await root.verify(this.#crypto);
        this.#rootCert = rootCert;
        this.#rootPublicKey = root.cert.ellipticCurvePublicKey;
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
            Diagnostic.dict({ nodeId, fabricId, caseAuthenticatedTags }),
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
        this.#rootPublicKey = fabric.rootPublicKey;
        this.#label = fabric.label;
    }

    matchesToFabric(fabric: Fabric) {
        if (this.#fabricId === undefined || this.#rootPublicKey === undefined) {
            throw new MatterFlowError("Node Operational Data needs to be set first.");
        }
        return fabric.matchesFabricIdAndRootPublicKey(this.#fabricId, this.#rootPublicKey);
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
        if (this.#rootCert === undefined || this.#rootPublicKey === undefined)
            throw new InternalError("rootCert needs to be set");
        if (this.#identityProtectionKey === undefined) throw new InternalError("identityProtectionKey needs to be set");
        if (this.#operationalCert === undefined || this.#fabricId === undefined || this.#nodeId === undefined)
            throw new InternalError("operationalCert needs to be set");

        this.#fabricIndex = fabricIndex;
        const saltWriter = new DataWriter();
        saltWriter.writeUInt64(this.#fabricId);
        const operationalId = await this.#crypto.createHkdfKey(
            Bytes.of(this.#rootPublicKey).slice(1),
            saltWriter.toByteArray(),
            COMPRESSED_FABRIC_ID_INFO,
            8,
        );

        return new Fabric(this.#crypto, {
            fabricIndex: this.#fabricIndex,
            fabricId: this.#fabricId,
            nodeId: this.#nodeId,
            rootNodeId: this.#rootNodeId,
            operationalId: operationalId,
            rootPublicKey: this.#rootPublicKey,
            keyPair: this.#keyPair,
            rootVendorId: this.#rootVendorId,
            rootCert: this.#rootCert,
            identityProtectionKey: this.#identityProtectionKey, // Epoch Key
            operationalIdentityProtectionKey: await this.#crypto.createHkdfKey(
                this.#identityProtectionKey,
                operationalId,
                GROUP_SECURITY_INFO,
            ),
            intermediateCACert: this.#intermediateCACert,
            operationalCert: this.#operationalCert,
            label: this.#label,
        });
    }
}

export namespace Fabric {
    export type Config = {
        fabricIndex: FabricIndex;
        fabricId: FabricId;
        nodeId: NodeId;
        rootNodeId: NodeId;
        operationalId: Bytes;
        rootPublicKey: Bytes;
        keyPair: BinaryKeyPair;
        rootVendorId: VendorId;
        rootCert: Bytes;
        identityProtectionKey: Bytes;
        operationalIdentityProtectionKey: Bytes;
        intermediateCACert: Bytes | undefined;
        operationalCert: Bytes;
        label: string;
    };
}
