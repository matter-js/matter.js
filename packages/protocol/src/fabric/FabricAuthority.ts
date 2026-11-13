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
    #nocRenewals = new Map<FabricIndex, Promise<void>>();
    #warnedMismatches = new Set<string>();

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
     * NOC, this is logged and the fabric keeps its NOC; the CA is not asked again in this run.  A call that arrives
     * while the renewal runs waits for it and returns the renewed fabric.  When installing the renewed NOC fails, the
     * error reaches every waiting call and the next call renews again.
     *
     * The node ID, fabric ID and CASE Authenticated Tags of `config` apply only when the fabric is created; the label
     * is updated on every call.  For an existing fabric, a configured node ID, fabric ID or list of CASE Authenticated
     * Tags that differs from the stored fabric logs a warning, once per compared value per run.
     */
    async defaultFabric(config: FabricAuthorityConfiguration, rotateNoc = true) {
        // First search for a fabric associated with the CA's root certificate
        const caRootCert = this.#ca.rootCert;
        let fabric = this.fabrics.find(fabric => Bytes.areEqual(fabric.rootCert, caRootCert));
        if (fabric !== undefined) {
            this.#warnOnFabricMismatch(fabric, config);
            if (rotateNoc && this.#ca.renewsNocAtStart) {
                fabric = await this.#renewNoc(fabric);
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

    async #renewNoc(fabric: Fabric) {
        const { fabricIndex } = fabric;
        let renewal = this.#nocRenewals.get(fabricIndex);
        if (renewal === undefined) {
            renewal = this.#issueRenewedNoc(fabric);
            this.#nocRenewals.set(fabricIndex, renewal);
        }
        try {
            await renewal;
        } catch (error) {
            if (this.#nocRenewals.get(fabricIndex) === renewal) {
                this.#nocRenewals.delete(fabricIndex);
            }
            throw error;
        }
        return this.#fabrics.for(fabricIndex);
    }

    async #issueRenewedNoc(fabric: Fabric) {
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
            return;
        }
        await builder.updateOperationalCert(fabric, issued.noc, issued.icac);
        const newFabric = await builder.build(fabric.fabricIndex);
        logger.notice(`Renewed NOC for fabric ${fabric.fabricIndex}`);

        await this.#fabrics.replaceFabric(newFabric);
    }

    /**
     * Warn when a stored fabric differs from what the external issuer serves or from the configuration.  Each field
     * and compared value is logged once per run; the stored values stay in use.
     *
     * A fabric ID or IPK other than the issuer's means no CASE sessions to devices that other controllers of that
     * fabric commissioned.  The configured identity only applies when the fabric is created; afterwards our NOC defines
     * our node ID and CATs, and a NOC renewal keeps them.  Only configured values are compared.
     */
    #warnOnFabricMismatch(fabric: Fabric, config: FabricAuthorityConfiguration) {
        const issuerFabric = this.#ca.fabric;
        if (issuerFabric !== undefined) {
            if (issuerFabric.fabricId !== fabric.fabricId) {
                this.#warnOnce(
                    `issuer fabric ID ${issuerFabric.fabricId}`,
                    `Fabric ${fabric.fabricIndex} has fabric ID ${fabric.fabricId}, but the external issuer serves fabric ID ${issuerFabric.fabricId}`,
                );
            }
            if (!Bytes.areEqual(issuerFabric.identityProtectionKey, fabric.identityProtectionKey)) {
                this.#warnOnce(
                    "issuer IPK",
                    `Fabric ${fabric.fabricIndex} has another IPK than the external issuer provides`,
                );
            }
        }
        if (config.adminFabricId !== undefined && config.adminFabricId !== fabric.fabricId) {
            this.#warnOnce(
                `configured fabric ID ${config.adminFabricId}`,
                `Fabric ${fabric.fabricIndex} has fabric ID ${fabric.fabricId}, not the configured ${config.adminFabricId}; the stored fabric stays in use`,
            );
        }

        if (config.adminNodeId !== undefined && config.adminNodeId !== fabric.nodeId) {
            this.#warnOnce(
                `configured node ID ${config.adminNodeId}`,
                `Our NOC on fabric ${fabric.fabricIndex} has node ID ${NodeId.strOf(fabric.nodeId)}, not the configured ${NodeId.strOf(config.adminNodeId)}; the NOC stays in use`,
            );
        }
        const { caseAuthenticatedTags } = config;
        if (
            caseAuthenticatedTags !== undefined &&
            !CaseAuthenticatedTag.areEqual(caseAuthenticatedTags, fabric.caseAuthenticatedTags)
        ) {
            this.#warnOnce(
                `configured CATs ${CaseAuthenticatedTag.strOfList(caseAuthenticatedTags)}`,
                `Our NOC on fabric ${fabric.fabricIndex} has CASE Authenticated Tags ${CaseAuthenticatedTag.strOfList(fabric.caseAuthenticatedTags)}, not the configured ${CaseAuthenticatedTag.strOfList(caseAuthenticatedTags)}; the NOC stays in use`,
            );
        }
    }

    #warnOnce(mismatch: string, message: string) {
        if (this.#warnedMismatches.has(mismatch)) {
            return;
        }
        this.#warnedMismatches.add(mismatch);
        logger.warn(message);
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
