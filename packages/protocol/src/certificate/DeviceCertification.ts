/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CertificationDeclaration } from "#certificate/kinds/CertificationDeclaration.js";
import { Bytes, Construction, Crypto, ImplementationError, InternalError, PrivateKey } from "#general";
import { NodeSession } from "#session/NodeSession.js";
import { ProductDescription } from "#types";
import { AttestationCertificateManager } from "./AttestationCertificateManager.js";
import { Dac, Pai } from "./kinds/AttestationCertificates.js";

/**
 * Device certification used by the OperationalCredentials cluster.
 */
export class DeviceCertification {
    #crypto: Crypto;
    #privateKey?: PrivateKey;
    #certificate?: Bytes;
    #intermediateCertificate?: Bytes;
    #declaration?: Bytes;
    readonly #construction: Construction<DeviceCertification>;

    get construction() {
        return this.#construction;
    }

    get certificate() {
        return this.#assertInitialized().certificate;
    }

    get intermediateCertificate() {
        return this.#assertInitialized().intermediateCertificate;
    }

    get declaration() {
        return this.#assertInitialized().declaration;
    }

    constructor(crypto: Crypto, config?: DeviceCertification.Definition, product?: ProductDescription) {
        this.#crypto = crypto;
        let configProvider;
        if (typeof config === "function") {
            configProvider = config;
        } else if (config) {
            configProvider = () => config;
        } else {
            configProvider = async () => {
                if (product === undefined) {
                    throw new ImplementationError(`Cannot generate device certification without product information`);
                }

                const paa = await AttestationCertificateManager.create(crypto, product.vendorId);
                const { keyPair: dacKeyPair, dac } = await paa.getDACert(product.productId);

                return {
                    privateKey: PrivateKey(dacKeyPair.privateKey),
                    certificate: dac,
                    intermediateCertificate: await paa.getPAICert(),
                    declaration: await CertificationDeclaration.generate(crypto, product.vendorId, product.productId),
                };
            };
        }

        this.#construction = Construction(this, async () => {
            const config = await configProvider();

            this.#privateKey = Bytes.isBytes(config.privateKey) ? PrivateKey(config.privateKey) : config.privateKey;
            this.#certificate = config.certificate;
            this.#intermediateCertificate = config.intermediateCertificate;
            this.#declaration = config.declaration;

            if (product !== undefined) {
                this.#validateCertification(product);
            }
        });
    }

    #validateCertification(product: ProductDescription) {
        // Access private fields directly since this is called during construction
        // (before construction completes, so #assertInitialized() would fail)
        const certificate = this.#certificate;
        const intermediateCertificate = this.#intermediateCertificate;
        if (certificate === undefined || intermediateCertificate === undefined) {
            return;
        }

        // Parse DAC and PAI
        const dac = Dac.fromAsn1(certificate);
        const pai = Pai.fromAsn1(intermediateCertificate);

        // Validate vendorId from DAC matches product
        const dacVendorId = dac.cert.subject.vendorId;
        if (dacVendorId !== undefined && dacVendorId !== product.vendorId) {
            throw new ImplementationError(
                `DAC VendorID ${dacVendorId} does not match product VendorID ${product.vendorId}`,
            );
        }

        // Validate productId from DAC matches product
        const dacProductId = dac.cert.subject.productId;
        if (dacProductId !== undefined && dacProductId !== product.productId) {
            throw new ImplementationError(
                `DAC ProductID ${dacProductId} does not match product ProductID ${product.productId}`,
            );
        }

        // Validate vendorId from PAI matches product
        const paiVendorId = pai.cert.subject.vendorId;
        if (paiVendorId !== undefined && paiVendorId !== product.vendorId) {
            throw new ImplementationError(
                `PAI VendorID ${paiVendorId} does not match product VendorID ${product.vendorId}`,
            );
        }
    }

    async sign(session: NodeSession, data: Bytes) {
        const { privateKey } = this.#assertInitialized();
        return this.#crypto.signEcdsa(privateKey, [data, session.attestationChallengeKey]);
    }

    /**
     * Makes sure that the device certification is initialized and construction is completed and returns "Non-undefined"
     * values
     */
    #assertInitialized() {
        this.#construction.assert();
        if (
            this.#certificate === undefined ||
            this.#intermediateCertificate === undefined ||
            this.#declaration === undefined ||
            this.#privateKey === undefined
        ) {
            throw new InternalError(
                `Device certification not initialized while trying to access it. This should never happen.`,
            );
        }
        return {
            certificate: this.#certificate,
            intermediateCertificate: this.#intermediateCertificate,
            declaration: this.#declaration,
            privateKey: this.#privateKey,
        };
    }
}

export namespace DeviceCertification {
    export interface Configuration {
        privateKey: PrivateKey | Bytes;
        certificate: Bytes;
        intermediateCertificate: Bytes;
        declaration: Bytes;
    }

    export type Definition = Configuration | (() => Promise<Configuration>);
}
