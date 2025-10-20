/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CertificationDeclaration } from "#certificate/kinds/CertificationDeclaration.js";
import { Bytes, Construction, Crypto, ImplementationError, InternalError, PrivateKey } from "#general";
import { NodeSession } from "#session/NodeSession.js";
import { ProductDescription } from "#types";
import { AttestationCertificateManager } from "./AttestationCertificateManager.js";

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

    #validateCertification(_product: ProductDescription) {
        //const { privateKey, certificate, intermediateCertificate, declaration } = this.#assertInitialized();
        // TODO extract and validate vendorIds from certificate and intermediateCertificate and compare to product.vendorId
        // TODO extract and validate productId from certificate and compare to product.productId
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
