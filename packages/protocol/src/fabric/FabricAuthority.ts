/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CertificateAuthority } from "#certificate/CertificateAuthority.js";
import {
    Bytes,
    Construction,
    CRYPTO_SYMMETRIC_KEY_LENGTH,
    Environment,
    Environmental,
    ImplementationError,
    Logger,
    Observable,
} from "#general";
import { CaseAuthenticatedTag, FabricId, FabricIndex, NodeId, VendorId } from "#types";
import { Fabric, FabricBuilder } from "./Fabric.js";
import { FabricManager } from "./FabricManager.js";

const logger = Logger.get("FabricAuthority");

/**
 * Configuration for fabrics controlled by a FabricAuthority.
 */
interface FabricAuthorityConfiguration {
    adminFabricLabel: string;
    adminVendorId?: VendorId;
    nodeId?: NodeId;

    /** @deprecated Fabric index is assigned automatically, please do not specif this. */
    fabricIndex?: FabricIndex;
    fabricId?: FabricId;
    caseAuthenticatedTags?: CaseAuthenticatedTag[];
}

/**
 * Concrete {@link FabricAuthorityConfiguration} for environmental configuration.
 */
export class FabricAuthorityConfigurationProvider {
    #config: Partial<FabricAuthorityConfiguration>;

    constructor(config: Partial<FabricAuthorityConfiguration> = {}) {
        this.#config = config;
    }

    get adminFabricLabel(): string {
        if (this.#config.adminFabricLabel !== undefined) {
            return this.#config.adminFabricLabel;
        }
        throw new ImplementationError("Admin Fabric Label must be set for FabricAuthorityConfigurationProvider.");
    }

    get adminVendorId(): VendorId | undefined {
        return this.#config.adminVendorId;
    }

    get nodeId(): NodeId | undefined {
        return this.#config.nodeId;
    }

    get fabricIndex(): FabricIndex | undefined {
        return this.#config.fabricIndex;
    }

    get fabricId(): FabricId | undefined {
        return this.#config.fabricId;
    }

    get caseAuthenticatedTags(): CaseAuthenticatedTag[] | undefined {
        return this.#config.caseAuthenticatedTags;
    }
}

/**
 * Interfaces FabricAuthority with other components.
 */
export interface FabricAuthorityContext {
    ca: CertificateAuthority;
    fabrics: FabricManager;
    config: FabricAuthorityConfiguration;
}

export const DEFAULT_ADMIN_VENDOR_ID = VendorId(0xfff1);

/**
 * Manages fabrics controlled locally associated with a specific CA.
 */
export class FabricAuthority {
    #construction: Construction<FabricAuthority>;
    #ca: CertificateAuthority;
    #fabrics: FabricManager;
    #config: FabricAuthorityConfiguration;
    #fabricAdded = new Observable<[Fabric]>();

    constructor({ ca, fabrics, config }: FabricAuthorityContext) {
        this.#ca = ca;
        this.#fabrics = fabrics;
        this.#config = config;

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
    async defaultFabric() {
        // First search for a fabric associated with the CA's root certificate
        const caRootCert = this.#ca.rootCert;
        const fabric = this.fabrics.find(fabric => Bytes.areEqual(fabric.rootCert, caRootCert));
        if (fabric !== undefined) {
            if (fabric.label !== this.#config.adminFabricLabel) {
                await fabric.setLabel(this.#config.adminFabricLabel);
            }
            return fabric;
        }

        // Create a new fabric
        return await this.createFabric();
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
    async createFabric() {
        const rootNodeId = this.#config.nodeId ?? NodeId.randomOperationalNodeId(this.#fabrics.crypto);
        const ipkValue = this.#fabrics.crypto.randomBytes(CRYPTO_SYMMETRIC_KEY_LENGTH);

        let vendorId = this.#config.adminVendorId;
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
            .setLabel(this.#config.adminFabricLabel);

        const fabricId = this.#config.fabricId ?? FabricId(this.#fabrics.crypto.randomBigInt(8));
        await fabricBuilder.setOperationalCert(
            await this.#ca.generateNoc(
                fabricBuilder.publicKey,
                fabricId,
                rootNodeId,
                this.#config.caseAuthenticatedTags,
            ),
        );

        let index = this.#config.fabricIndex;
        if (index === undefined) {
            index = this.#fabrics.allocateFabricIndex();
        } else if (this.#fabrics.findByIndex(index) !== undefined) {
            throw new ImplementationError(`Cannot allocate controller fabric ${index} because index is in use`);
        }

        const fabric = await fabricBuilder.build(index);
        this.#fabrics.addFabric(fabric);

        logger.debug(`Created new controller fabric ${index}`);
        this.#fabricAdded.emit(fabric);

        return fabric;
    }

    static [Environmental.create](env: Environment) {
        const instance = new FabricAuthority({
            ca: env.get(CertificateAuthority),
            fabrics: env.get(FabricManager),
            config: env.get(FabricAuthorityConfigurationProvider),
        });
        env.set(FabricAuthority, instance);
        return instance;
    }
}
