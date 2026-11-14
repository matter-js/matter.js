/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Abort,
    BinaryKeyPair,
    Bytes,
    CertificateError,
    Construction,
    CRYPTO_SYMMETRIC_KEY_LENGTH,
    Crypto,
    Environment,
    Environmental,
    ImplementationError,
    Logger,
    MatterAggregateError,
    StorageContext,
    StorageManager,
    asyncNew,
} from "@matter/general";
import { CaseAuthenticatedTag, FabricId, NodeId } from "@matter/types";
import { Icac } from "./kinds/Icac.js";
import { Noc } from "./kinds/Noc.js";
import { Rcac } from "./kinds/Rcac.js";
import { LocalIssuer } from "./LocalIssuer.js";

const logger = Logger.get("CertificateAuthority");

const CERTIFICATES_CONTEXT = "certificates";

/**
 * Issues the operational certificates (NOCs) of the fabrics a local node controls.
 *
 * Every NOC comes from an {@link CertificateAuthority.Issuer}.  The built-in issuer holds the key pair of the signing
 * certificate, the root or the ICAC when there is one, and signs NOCs locally; it is the default.  An external issuer, for example a remote CA
 * service, receives each NOC request instead, and the authority then holds no private key.
 */
export class CertificateAuthority {
    #crypto: Crypto;
    #construction: Construction<CertificateAuthority>;
    #local?: LocalIssuer;
    #issuer?: CertificateAuthority.Issuer;
    #rootCert?: Bytes;

    get crypto() {
        return this.#crypto;
    }

    get construction() {
        return this.#construction;
    }

    close() {
        return this.#construction.close();
    }

    /**
     * Discard the key material this authority holds, persisted and in memory.
     *
     * The authority is unusable afterwards, so a holder that starts a new operation fails loudly rather than issuing
     * certificates no fabric can validate.  A NOC request already in flight completes with the root certificate it
     * started with.
     */
    async erase() {
        await MatterAggregateError.settleSeries(
            [
                // Settles construction first: credentials it generates would otherwise land after the wipe
                () => this.#construction.close(),

                () => {
                    this.#issuer = undefined;
                    this.#rootCert = undefined;
                },

                () => this.#local?.erase(),
            ],
            "Error erasing certificate authority",
        );
    }

    /**
     * Discard the persisted key material of the authority for {@link env} without instantiating one.
     */
    static eraseFor(env: Environment) {
        return env.get(StorageManager).createContext(CERTIFICATES_CONTEXT).clearAll();
    }

    /**
     * Creates a new CertificateAuthority instance and use the provided storage to store and retrieve the values.
     * A new certificate is only created when the storage does not contain any credentials.
     * Use the generateIntermediateCert parameter to specify if an ICAC should be created too. The parameter, when set,
     * must match to the storage content if a certificate is stored!
     */
    static create(
        crypto: Crypto,
        storage: StorageContext,
        generateIntermediateCert?: boolean,
    ): Promise<CertificateAuthority>;

    /**
     * Creates a new CertificateAuthority instance with the provided configuration. The used certificate is loaded from
     * the configuration object.
     */
    static create(crypto: Crypto, options: CertificateAuthority.Configuration): Promise<CertificateAuthority>;

    /**
     * Creates a new CertificateAuthority instance with the provided configuration. The configuration is not stored.
     * Use the generateIntermediateCert parameter to specify if an ICAC should be created too.
     */
    static create(crypto: Crypto, generateIntermediateCert?: boolean): Promise<CertificateAuthority>;

    /**
     * Creates a new CertificateAuthority instance that obtains every NOC from {@link issuer}, for example a remote CA
     * service.  The authority holds no private key and stores nothing; {@link config} is not available.
     *
     * Install it with `env.set(CertificateAuthority, ...)` before the controller node starts, on the environment the
     * node is created with or on the node's own environment (`node.env`).  A factory reset of the node removes an
     * authority set on `node.env`; set it again before the next start, else the node creates a built-in authority with
     * a new root.
     *
     * Throws {@link ImplementationError} when the root certificate does not verify or the issuer's fabric values are
     * invalid.
     */
    static create(crypto: Crypto, issuer: CertificateAuthority.Issuer): Promise<CertificateAuthority>;

    static async create(
        crypto: Crypto,
        options?: StorageContext | CertificateAuthority.Configuration | CertificateAuthority.Issuer | boolean,
        generateIntermediateCert?: boolean,
    ) {
        return asyncNew(CertificateAuthority, crypto, options, generateIntermediateCert);
    }

    constructor(
        crypto: Crypto,
        options?: StorageContext | CertificateAuthority.Configuration | CertificateAuthority.Issuer | boolean,
        generateIntermediateCert?: boolean,
    ) {
        this.#crypto = crypto;

        if (isIssuer(options)) {
            const issuer = options;
            this.#construction = Construction(this, () => this.#installExternal(issuer));
            return;
        }

        // Created here, not in the initializer below: erase() must find the storage even mid-construction
        const local = new LocalIssuer(crypto, options instanceof StorageContext ? options : undefined);
        this.#local = local;
        const config = typeof options === "object" && !(options instanceof StorageContext) ? options : undefined;
        const requireIcac = typeof options === "boolean" ? options : generateIntermediateCert;

        this.#construction = Construction(this, async () => {
            await local.initialize(config, requireIcac);
            this.#rootCert = local.rootCert;
            this.#issuer = local;
        });
    }

    static [Environmental.create](env: Environment) {
        const storage = env.get(StorageManager).createContext(CERTIFICATES_CONTEXT);
        const instance = new CertificateAuthority(env.get(Crypto), storage);
        env.set(CertificateAuthority, instance);
        return instance;
    }

    get rootCert(): Bytes {
        return this.#construction.assert("root cert", this.#rootCert);
    }

    /**
     * The ICAC the built-in issuer signs NOCs with.  Undefined without an ICAC and with an external issuer; a NOC from
     * {@link issueNoc} comes with the ICAC that signed it.
     */
    get icacCert(): Bytes | undefined {
        const icac = this.#local?.icacCert;
        if (icac === undefined) {
            return undefined;
        }
        return this.#construction.assert("icac cert", icac);
    }

    /**
     * The fabric the external issuer serves, or undefined.
     */
    get fabric(): CertificateAuthority.Issuer.Fabric | undefined {
        return this.#issuer?.fabric;
    }

    /** Whether this authority signs NOCs itself with the built-in issuer, without asking an external one. */
    get isBuiltIn() {
        return this.#local !== undefined;
    }

    /**
     * Whether the controller replaces the key pair of its own NOC once per run, at the first use of its fabric.  True
     * for the built-in issuer; for an external issuer as {@link CertificateAuthority.Issuer.renewNocAtStart} says.
     */
    get renewsNocAtStart() {
        if (this.#local !== undefined) {
            return true;
        }
        return this.#issuer?.renewNocAtStart ?? false;
    }

    /**
     * The key material and state of the built-in issuer, for storing it elsewhere.
     *
     * Throws {@link ImplementationError} for an authority with an external issuer, which holds no key material.
     */
    get config(): CertificateAuthority.Configuration {
        const local = this.#local;
        if (local === undefined) {
            throw new ImplementationError("A certificate authority with an external issuer holds no key material");
        }
        this.#construction.assert("config");
        return local.config;
    }

    /**
     * Issue a NOC for {@link CertificateAuthority.Issuer.NocRequest.publicKey}.
     *
     * The built-in issuer signs it locally.  A NOC from an external issuer is verified against {@link rootCert}, the
     * requested subject and the requested public key before it is returned.  The ICAC returned with the NOC is the one
     * to install with it.
     *
     * Throws:
     * - `ValidationOutOfBoundsError` for an invalid CAT list, before the issuer is asked
     * - {@link CertificateError} when the NOC of an external issuer does not verify
     * - an `AbortedError` when {@link CertificateAuthority.Issuer.NocRequest.abort} aborts first (a native signal
     *   throws its reason instead)
     * - whatever the issuer throws, unchanged
     *
     * @see {@link MatterSpecification.v161.Core} § 6.5.6
     */
    async issueNoc(request: CertificateAuthority.Issuer.NocRequest): Promise<CertificateAuthority.Issuer.IssuedNoc> {
        const issuer = this.#construction.assert("issuer", this.#issuer);
        const rootCert = this.rootCert;
        request.abort?.throwIfAborted();
        const { caseAuthenticatedTags } = request;
        if (caseAuthenticatedTags !== undefined) {
            CaseAuthenticatedTag.validateNocTagList(caseAuthenticatedTags);
        }

        if (issuer === this.#local) {
            return await issuer.issueNoc(request);
        }

        const issued = await Abort.attempt(request.abort, issuer.issueNoc(request));
        try {
            await this.#verifyIssued(rootCert, request, issued);
        } catch (error) {
            if (error instanceof CertificateError) {
                throw error;
            }
            throw new CertificateError(
                `NOC from the external issuer for node ${NodeId.strOf(request.nodeId)} is invalid`,
                { cause: error },
            );
        }
        return issued;
    }

    /**
     * Issue a NOC.
     *
     * @deprecated Use {@link issueNoc}.  This method returns only the NOC and drops the ICAC an external issuer
     * returns with it.
     */
    async generateNoc(
        publicKey: Bytes,
        fabricId: FabricId,
        nodeId: NodeId,
        caseAuthenticatedTags?: readonly CaseAuthenticatedTag[],
    ) {
        return (await this.issueNoc({ publicKey, fabricId, nodeId, caseAuthenticatedTags })).noc;
    }

    async #installExternal(issuer: CertificateAuthority.Issuer) {
        let root: Rcac;
        try {
            root = Rcac.fromTlv(issuer.rootCert);
            await root.verify(this.#crypto);
        } catch (error) {
            throw new ImplementationError("Root certificate of the external issuer is invalid", { cause: error });
        }

        const { fabric } = issuer;
        if (fabric !== undefined) {
            const { fabricId, identityProtectionKey } = fabric;
            if (identityProtectionKey.byteLength !== CRYPTO_SYMMETRIC_KEY_LENGTH) {
                throw new ImplementationError(
                    `External issuer IPK has ${identityProtectionKey.byteLength} bytes instead of ${CRYPTO_SYMMETRIC_KEY_LENGTH}`,
                );
            }
            const rootFabricId = root.cert.subject.fabricId;
            if (rootFabricId !== undefined && FabricId(rootFabricId) !== fabricId) {
                throw new ImplementationError(
                    `External issuer serves fabric ID ${fabricId}, but its root certificate is for fabric ID ${rootFabricId}`,
                );
            }
        }

        this.#rootCert = issuer.rootCert;
        this.#issuer = issuer;
        logger.info(`Using external issuer with root certificate ID ${root.cert.subject.rcacId ?? "(none)"}`);
    }

    async #verifyIssued(
        rootCert: Bytes,
        request: CertificateAuthority.Issuer.NocRequest,
        { noc, icac }: CertificateAuthority.Issuer.IssuedNoc,
    ) {
        const { noc: nocCert, signer } = await Noc.verifyChain(this.#crypto, rootCert, noc, icac);
        const {
            subject: { nodeId, fabricId, caseAuthenticatedTags },
            ellipticCurvePublicKey,
        } = nocCert.cert;

        if (icac !== undefined && icac.byteLength > 0 && !(signer instanceof Icac)) {
            throw new CertificateError(
                `External issuer returned an ICAC with a NOC for node ${NodeId.strOf(nodeId)} that this ICAC did not sign`,
            );
        }

        if (
            nodeId !== request.nodeId ||
            fabricId !== request.fabricId ||
            !CaseAuthenticatedTag.areEqual(caseAuthenticatedTags, request.caseAuthenticatedTags)
        ) {
            throw new CertificateError(
                `External issuer returned a NOC for node ${NodeId.strOf(nodeId)} in fabric ${fabricId} with CATs ${CaseAuthenticatedTag.strOfList(caseAuthenticatedTags)}, requested was node ${NodeId.strOf(request.nodeId)} in fabric ${request.fabricId} with CATs ${CaseAuthenticatedTag.strOfList(request.caseAuthenticatedTags)}`,
            );
        }
        if (!Bytes.areEqual(ellipticCurvePublicKey, request.publicKey)) {
            throw new CertificateError(
                `External issuer returned a NOC for node ${NodeId.strOf(nodeId)} with another public key than requested`,
            );
        }
    }
}

function isIssuer(options: unknown): options is CertificateAuthority.Issuer {
    return (
        typeof options === "object" &&
        options !== null &&
        "issueNoc" in options &&
        typeof options.issueNoc === "function"
    );
}

export namespace CertificateAuthority {
    /** Base configuration fields shared by both 2-tier and 3-tier PKI */
    type ConfigurationBase = {
        rootCertId: bigint;
        rootKeyIdentifier: Bytes;
        rootCertBytes: Bytes;
        nextCertificateId: bigint;
    };

    /**
     * Configuration for 2-tier PKI (RCAC -> NOC).
     * rootKeyPair is REQUIRED since RCAC signs NOCs directly.
     */
    export type ConfigurationWithoutIcac = ConfigurationBase & {
        rootKeyPair: BinaryKeyPair;
    };

    /**
     * Configuration for 3-tier PKI (RCAC -> ICAC -> NOC).
     * rootKeyPair is OPTIONAL since ICAC signs NOCs, not RCAC.
     * This allows controllers to operate without access to the RCAC private key.
     */
    export type ConfigurationWithIcac = ConfigurationBase & {
        rootKeyPair?: BinaryKeyPair;
        icacCertId: bigint;
        icacKeyPair: BinaryKeyPair;
        icacKeyIdentifier: Bytes;
        icacCertBytes: Bytes;
    };

    /**
     * Configuration for CertificateAuthority with external certificates.
     *
     * When using ICAC (3-tier PKI), the rootKeyPair can be omitted since NOCs are signed
     * by the ICAC, not the RCAC. This allows controllers to operate without access to
     * the RCAC private key.
     */
    export type Configuration = ConfigurationWithoutIcac | ConfigurationWithIcac;

    /**
     * Issues NOCs for a {@link CertificateAuthority}, for example by forwarding the request to a remote CA service.
     * Certificates are in Matter TLV form, except the X.509 DER certificates in {@link Issuer.CommissioningEvidence}.
     *
     * Several controllers in one fabric need the same root certificate, fabric ID and IPK.  An issuer that serves them
     * provides {@link fabric}, so each controller creates its fabric with these values.  Each running controller needs
     * its own node ID, and the node IDs the controllers assign to devices must not overlap; matter.js does not check
     * this.
     *
     * @see {@link MatterSpecification.v161.Core} § 6.5
     */
    export interface Issuer {
        /** The RCAC every issued NOC chains to. */
        readonly rootCert: Bytes;

        /**
         * The fabric this issuer serves.  When set, a new controller fabric uses its fabric ID and IPK.  A configured
         * fabric ID that differs fails with {@link ImplementationError}.
         */
        readonly fabric?: Issuer.Fabric;

        /**
         * Whether the controller replaces the key pair of its own NOC once per run, at the first use of its fabric, as
         * it does with the built-in issuer.  Default false: an external issuer is asked only for new NOCs.
         */
        readonly renewNocAtStart?: boolean;

        /**
         * Issue a NOC for the request's public key with the requested subject.
         *
         * The controller calls this for its own NOC when it creates its fabric or renews its key pair, and once per
         * device during commissioning while the device's fail-safe timer runs.  For a device NOC,
         * {@link Issuer.NocRequest.abort} aborts when the time the commissioner allows for issuing ends.  When this
         * throws during commissioning, commissioning stops and the commissioner tries to end the device's fail-safe.
         */
        issueNoc(request: Issuer.NocRequest): Promise<Issuer.IssuedNoc>;
    }

    export namespace Issuer {
        /** The fabric values an external CA owns, shared by all controllers of the fabric. */
        export interface Fabric {
            /** Must match the fabric ID of the root certificate when that has one. */
            fabricId: FabricId;

            /**
             * The IPK, 16 bytes.  Controllers of one fabric need the same IPK to open CASE sessions to its devices.
             *
             * @see {@link MatterSpecification.v161.Core} § 4.14.2.6.1
             */
            identityProtectionKey: Bytes;
        }

        /** The subject and public key of a NOC to issue. */
        export interface NocRequest {
            publicKey: Bytes;
            fabricId: FabricId;
            nodeId: NodeId;
            caseAuthenticatedTags?: readonly CaseAuthenticatedTag[];

            /**
             * What the device returned during commissioning, when the NOC is for a device being commissioned.
             * Undefined for the controller's own NOC.  A remote CA can use it to verify the device's attestation and
             * the binding of {@link publicKey} to the DAC itself, instead of trusting the controller's check.
             */
            evidence?: CommissioningEvidence;

            /**
             * Aborts when the result is no longer needed.  For a device NOC it aborts when the time the commissioner
             * allows for issuing ends; the commissioner extends the device's fail-safe to cover that time.
             */
            abort?: AbortSignal;
        }

        /** An issued NOC and the ICAC that signed it. */
        export interface IssuedNoc {
            noc: Bytes;

            /** The ICAC that signed {@link noc}.  Undefined, or empty, when the root signed it directly. */
            icac?: Bytes;
        }

        /**
         * The device's attestation and operational CSR responses, as received.
         *
         * @see {@link MatterSpecification.v161.Core} § 6.2.3, § 11.18.6.2, § 11.18.6.3, § 11.18.6.5 and § 11.18.6.6
         */
        export interface CommissioningEvidence {
            /** The DAC, X.509 DER, from CertificateChainRequest. */
            dac: Bytes;

            /** The PAI, X.509 DER, from CertificateChainRequest. */
            pai: Bytes;

            /** AttestationResponse.attestationElements, which carry the certification declaration. */
            attestationElements: Bytes;

            /** AttestationResponse.attestationSignature, over the elements and {@link attestationChallenge}. */
            attestationSignature: Bytes;

            /** The nonce sent in AttestationRequest. */
            attestationNonce: Bytes;

            /** The attestation challenge of the PASE session the device is commissioned over. */
            attestationChallenge: Bytes;

            /** CSRResponse.nocsrElements, which carry the PKCS#10 request for {@link NocRequest.publicKey}. */
            nocsrElements: Bytes;

            /** CSRResponse.attestationSignature, over the elements and {@link attestationChallenge}. */
            nocsrSignature: Bytes;

            /** The nonce sent in CSRRequest. */
            csrNonce: Bytes;
        }
    }
}
