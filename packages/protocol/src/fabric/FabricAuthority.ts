/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CertificateAuthority } from "#certificate/CertificateAuthority.js";
import {
    AsyncObservable,
    Bytes,
    Construction,
    CRYPTO_SYMMETRIC_KEY_LENGTH,
    Environment,
    Environmental,
    ImplementationError,
    Logger,
} from "#general";
import { CaseAuthenticatedTag, FabricId, FabricIndex, NodeId, VendorId } from "#types";
import { Fabric, FabricBuilder } from "./Fabric.js";
import { FabricManager } from "./FabricManager.js";

const logger = Logger.get("FabricAuthority");

/**
 * Configuration for fabrics controlled by a FabricAuthority.
 */
export interface FabricAuthorityConfiguration {
    readonly adminFabricLabel: string;
    readonly adminVendorId?: VendorId;
    readonly adminNodeId?: NodeId;

    /** @deprecated Fabric index is assigned automatically, please do not specify this. */
    readonly adminFabricIndex?: FabricIndex;
    readonly adminFabricId?: FabricId;
    readonly caseAuthenticatedTags?: CaseAuthenticatedTag[];
}

/**
 * Interfaces FabricAuthority with other components.
 */
export interface FabricAuthorityContext {
    ca: CertificateAuthority;
    fabrics: FabricManager;
}

export const DEFAULT_ADMIN_VENDOR_ID = VendorId(0xfff1);

/**
 * Manages fabrics controlled locally associated with a specific CA.
 */
export class FabricAuthority {
    #construction: Construction<FabricAuthority>;
    #ca: CertificateAuthority;
    #fabrics: FabricManager;
    #fabricAdded = new AsyncObservable<[Fabric]>();

    constructor({ ca, fabrics }: FabricAuthorityContext) {
        this.#ca = ca;
        this.#fabrics = fabrics;

        this.#construction = Construction(this, async () => {
            await this.#ca.construction;
            await this.#fabrics.construction;
        });
    }

    get construction() {
        return this.#construction;
    }

    /**
     * Access the certificate authority.
     */
    get ca() {
        return this.#ca;
    }

    /**
     * Obtain the default fabric for this authority.
     */
    async defaultFabric(config: FabricAuthorityConfiguration) {
        // First search for a fabric associated with the CA's root certificate
        const caRootCert = this.#ca.rootCert;
        const fabric = this.fabrics.find(fabric => Bytes.areEqual(fabric.rootCert, caRootCert));
        if (fabric !== undefined) {
            if (fabric.label !== config.adminFabricLabel) {
                await fabric.setLabel(config.adminFabricLabel);
            }
            return fabric;
        }

        // TODO somehow verify when we have not found a valid fabric but have commissioned nodes and at least log this
        // "Fabric certificate changed, but commissioned nodes are still present. Please clear the storage."

        // Create a new fabric
        return await this.createFabric(config);
    }

    /**
     * List all controlled fabrics.
     */
    get fabrics() {
        return Array.from(this.#fabrics).filter(this.hasControlOf.bind(this));
    }

    /**
     * Emits after creating a new fabric.
     */
    get fabricAdded() {
        return this.#fabricAdded;
    }

    /**
     * Determine whether a fabric belongs to this authority.
     */
    hasControlOf(fabric: Fabric) {
        return Bytes.areEqual(fabric.rootCert, this.#ca.rootCert);
    }

    /**
     * Create a new fabric under our control.
     */
    async createFabric(config: FabricAuthorityConfiguration) {
        const rootNodeId = config.adminNodeId ?? NodeId.randomOperationalNodeId(this.#fabrics.crypto);
        const ipkValue = this.#fabrics.crypto.randomBytes(CRYPTO_SYMMETRIC_KEY_LENGTH);

        let vendorId = config.adminVendorId;
        if (vendorId === undefined) {
            vendorId = DEFAULT_ADMIN_VENDOR_ID;
            logger.warn(`Using test vendor ID 0x${vendorId.toString(16)} for controller fabric`);
        }

        const fabricBuilder = await FabricBuilder.create(this.#fabrics.crypto);
        await fabricBuilder.setRootCert(this.#ca.rootCert);
        fabricBuilder
            .setRootNodeId(rootNodeId)
            .setIdentityProtectionKey(ipkValue)
            .setRootVendorId(vendorId)
            .setLabel(config.adminFabricLabel);

        const fabricId = config.adminFabricId ?? FabricId(this.#fabrics.crypto.randomBigInt(8));
        await fabricBuilder.setOperationalCert(
            await this.#ca.generateNoc(fabricBuilder.publicKey, fabricId, rootNodeId, config.caseAuthenticatedTags),
            this.#ca.icacCert,
        );

        let index = config.adminFabricIndex;
        if (index === undefined) {
            index = this.#fabrics.allocateFabricIndex();
        } else if (this.#fabrics.maybeFor(index) !== undefined) {
            throw new ImplementationError(`Cannot allocate controller fabric ${index} because index is in use`);
        }

        const fabric = await fabricBuilder.build(index);
        this.#fabrics.addFabric(fabric);

        fabric.persist();

        logger.debug(`Created new controller fabric ${index}`);
        await this.#fabricAdded.emit(fabric);

        return fabric;
    }

    static [Environmental.create](env: Environment) {
        const instance = new FabricAuthority({
            ca: env.get(CertificateAuthority),
            fabrics: env.get(FabricManager),
        });
        env.set(FabricAuthority, instance);
        return instance;
    }
}
