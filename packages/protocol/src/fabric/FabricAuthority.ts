/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CertificateAuthority } from "#certificate/CertificateAuthority.js";
import { Noc } from "#certificate/kinds/Noc.js";
import { Rcac } from "#certificate/kinds/Rcac.js";
import {
    asError,
    AsyncObservable,
    Bytes,
    Construction,
    CRYPTO_SYMMETRIC_KEY_LENGTH,
    Diagnostic,
    Environment,
    Environmental,
    ImplementationError,
    Logger,
} from "@matter/general";
import { CaseAuthenticatedTag, FabricId, FabricIndex, NodeId, VendorId } from "@matter/types";
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
    #rotatedFabricIndices = new Set<FabricIndex>(); // Remember which we already rotated in this run
    #checkedFabricIndices = new Set<FabricIndex>();

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

    close() {
        return this.#construction.close();
    }

    /**
     * Access the certificate authority.
     */
    get ca() {
        return this.#ca;
    }

    /**
     * Get the default fabric for this authority.
     *
     * When rotateNoc is true (the default) and the CA renews NOCs at start ({@link CertificateAuthority.renewsNocAtStart}),
     * the NOC key pair is rotated once per runtime when the fabric already exists.  When the CA cannot issue the new
     * NOC, this is logged and the fabric keeps its NOC.
     */
    async defaultFabric(config: FabricAuthorityConfiguration, rotateNoc = true) {
        // First search for a fabric associated with the CA's root certificate
        const caRootCert = this.#ca.rootCert;
        let fabric = this.fabrics.find(fabric => Bytes.areEqual(fabric.rootCert, caRootCert));
        if (fabric !== undefined) {
            this.#warnOnIssuerMismatch(fabric);
            if (rotateNoc && this.#ca.renewsNocAtStart) {
                fabric = await this.#rotateFabricNocKey(fabric);
            }
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
     * Create new fabric under our control.
     *
     * The fabric ID comes from the external issuer's fabric, else from the root certificate, else from
     * {@link FabricAuthorityConfiguration.adminFabricId}, else at random.  The IPK comes from the external issuer's
     * fabric, else at random.  Throws {@link ImplementationError} when a configured fabric ID differs from the one the
     * issuer or the root certificate prescribes.
     *
     * When persisting fails, this rejects and the fabric stays in memory; it is not rolled back.
     */
    async createFabric(config: FabricAuthorityConfiguration) {
        const issuerFabric = this.#ca.fabric;
        const rootFabricId = Rcac.fromTlv(this.#ca.rootCert).cert.subject.fabricId;
        const prescribedFabricId =
            issuerFabric?.fabricId ?? (rootFabricId === undefined ? undefined : FabricId(rootFabricId));
        if (
            prescribedFabricId !== undefined &&
            config.adminFabricId !== undefined &&
            config.adminFabricId !== prescribedFabricId
        ) {
            throw new ImplementationError(
                `Configured fabric ID ${config.adminFabricId} differs from fabric ID ${prescribedFabricId} of the certificate authority`,
            );
        }

        const rootNodeId = config.adminNodeId ?? NodeId.randomOperationalNodeId(this.#fabrics.crypto);
        const ipkValue =
            issuerFabric?.identityProtectionKey ?? this.#fabrics.crypto.randomBytes(CRYPTO_SYMMETRIC_KEY_LENGTH);

        let vendorId = config.adminVendorId;
        if (vendorId === undefined) {
            vendorId = DEFAULT_ADMIN_VENDOR_ID;
            logger.warn(`Using test vendor ID 0x${vendorId.toString(16)} for controller fabric`);
        } else if (!VendorId.isOperational(vendorId)) {
            throw new ImplementationError(
                `Admin vendor ID 0x${vendorId.toString(16)} is reserved (0x0000 or above 0xFFF4); devices refuse it in AddNOC`,
            );
        }

        const fabricBuilder = await FabricBuilder.create(this.#fabrics.crypto);
        await fabricBuilder.setRootCert(this.#ca.rootCert);
        fabricBuilder
            .setRootNodeId(rootNodeId)
            .setIdentityProtectionKey(ipkValue)
            .setRootVendorId(vendorId)
            .setLabel(config.adminFabricLabel);

        const fabricId = prescribedFabricId ?? config.adminFabricId ?? FabricId(this.#fabrics.crypto.randomBigInt(8));
        const { noc, icac } = await this.#ca.issueNoc({
            publicKey: fabricBuilder.publicKey,
            fabricId,
            nodeId: rootNodeId,
            caseAuthenticatedTags: config.caseAuthenticatedTags,
        });
        await fabricBuilder.setOperationalCert(noc, icac);

        let index = config.adminFabricIndex;
        if (index === undefined) {
            index = this.#fabrics.allocateFabricIndex();
        } else if (this.#fabrics.maybeFor(index) !== undefined) {
            throw new ImplementationError(`Cannot allocate controller fabric ${index} because index is in use`);
        }

        const fabric = await fabricBuilder.build(index);
        this.#fabrics.addFabric(fabric);

        await fabric.persist(false);

        logger.debug(`Created new controller fabric ${index}`);
        await this.#fabricAdded.emit(fabric);

        return fabric;
    }

    async #rotateFabricNocKey(fabric: Fabric) {
        if (this.#rotatedFabricIndices.has(fabric.fabricIndex)) {
            // We only rotate once per runtime
            return fabric;
        }

        const builder = await FabricBuilder.create(this.#fabrics.crypto);
        const {
            subject: { nodeId, fabricId, caseAuthenticatedTags },
        } = Noc.fromTlv(fabric.operationalCert).cert;
        if (nodeId !== fabric.nodeId) {
            throw new ImplementationError(`Cannot rotate NOC for fabric ${fabric.fabricIndex} because node ID changed`);
        }
        let issued: CertificateAuthority.Issuer.IssuedNoc;
        try {
            issued = await this.#ca.issueNoc({ publicKey: builder.publicKey, fabricId, nodeId, caseAuthenticatedTags });
        } catch (error) {
            logger.warn(
                `Could not renew the NOC of fabric ${fabric.fabricIndex}, keeping the current one:`,
                Diagnostic.errorMessage(asError(error)),
            );
            return fabric;
        }
        await builder.updateOperationalCert(fabric, issued.noc, issued.icac);
        const newFabric = await builder.build(fabric.fabricIndex);
        logger.notice(`Rotated NOC for fabric ${fabric.fabricIndex}`);

        await this.#fabrics.replaceFabric(newFabric);

        this.#rotatedFabricIndices.add(fabric.fabricIndex);
        return newFabric;
    }

    /**
     * A stored fabric whose fabric ID or IPK differs from the external issuer's fabric cannot open CASE sessions to
     * devices that other controllers of that fabric commissioned.  Warns once per fabric and run; the stored values
     * stay in use.
     */
    #warnOnIssuerMismatch(fabric: Fabric) {
        const issuerFabric = this.#ca.fabric;
        if (issuerFabric === undefined || this.#checkedFabricIndices.has(fabric.fabricIndex)) {
            return;
        }
        this.#checkedFabricIndices.add(fabric.fabricIndex);

        if (issuerFabric.fabricId !== fabric.fabricId) {
            logger.warn(
                `Fabric ${fabric.fabricIndex} has fabric ID ${fabric.fabricId}, but the external issuer serves fabric ID ${issuerFabric.fabricId}`,
            );
        }
        if (!Bytes.areEqual(issuerFabric.identityProtectionKey, fabric.identityProtectionKey)) {
            logger.warn(`Fabric ${fabric.fabricIndex} has another IPK than the external issuer provides`);
        }
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
