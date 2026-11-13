/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Certificate } from "#certificate/kinds/Certificate.js";
import { NocsrCheck, NocsrError, NocsrValidator } from "#certificate/NocsrValidator.js";
import { TlvCertSigningRequest } from "#common/OperationalCredentialsTypes.js";
import { Bytes, InternalError, PublicKey, StandardCrypto } from "@matter/general";

const crypto = new StandardCrypto();

/** Prefix of the P-256 public key in a CSR: BIT STRING of 66 bytes, no unused bits, uncompressed point. */
const CSR_PUBLIC_KEY_PREFIX = "03420004";

describe("NocsrValidator", () => {
    async function scenario() {
        const dacKey = await crypto.createKeyPair();
        const operationalKey = await crypto.createKeyPair();
        const attestationChallenge = crypto.randomBytes(16);
        const csrNonce = crypto.randomBytes(32);
        const certSigningRequest = await Certificate.createCertificateSigningRequest(crypto, operationalKey);

        /** The CSRResponse for {@link nocsrElements}, signed with the DAC key. */
        async function respondRaw(nocsrElements: Bytes) {
            return {
                nocsrElements,
                attestationSignature: (await crypto.signEcdsa(dacKey, [nocsrElements, attestationChallenge])).bytes,
            };
        }

        /** The CSRResponse of a device, with the given NOCSR Information fields replaced. */
        function respond(fields: { csrNonce?: Bytes; certSigningRequest?: Bytes; vendorReserved1?: Bytes } = {}) {
            return respondRaw(TlvCertSigningRequest.encode({ certSigningRequest, csrNonce, ...fields }));
        }

        /** A valid CSRResponse whose NOCSRElements are {@link length} bytes long, filled up with vendorReserved1. */
        function respondWithLength(length: number) {
            const encode = (fill: number) =>
                TlvCertSigningRequest.encode({ certSigningRequest, csrNonce, vendorReserved1: new Uint8Array(fill) });
            let fill = length - encode(0).byteLength;
            while (fill >= 0 && encode(fill).byteLength > length) {
                fill--;
            }
            const nocsrElements = encode(fill);
            if (nocsrElements.byteLength !== length) {
                throw new InternalError(`No fill gives NOCSRElements of ${length} bytes`);
            }
            return respondRaw(nocsrElements);
        }

        const context: NocsrValidator.Context = {
            crypto,
            attestationChallenge,
            csrNonce,
            dacPublicKey: PublicKey(dacKey.publicKey),
        };

        return { context, respond, respondRaw, respondWithLength, operationalKey, certSigningRequest };
    }

    async function expectFailure(promise: Promise<unknown>, check: NocsrCheck) {
        await expect(promise).rejectedWith(NocsrError).and.eventually.property("failure", check);
    }

    it("returns the operational public key of a valid response", async () => {
        const { context, respond, operationalKey } = await scenario();

        const publicKey = await NocsrValidator.validate(context, await respond());

        expect(Bytes.toHex(publicKey)).equal(Bytes.toHex(operationalKey.publicKey));
    });

    it("refuses an empty response", async () => {
        const { context, respond } = await scenario();
        const response = await respond();

        await expectFailure(
            NocsrValidator.validate(context, { ...response, nocsrElements: new Uint8Array(0) }),
            NocsrCheck.ResponseEmpty,
        );
        await expectFailure(
            NocsrValidator.validate(context, { ...response, attestationSignature: new Uint8Array(0) }),
            NocsrCheck.ResponseEmpty,
        );
    });

    it("refuses a response without NOCSRElements or AttestationSignature", async () => {
        const { context, respond } = await scenario();
        const { nocsrElements, attestationSignature } = await respond();

        await expectFailure(NocsrValidator.validate(context, { attestationSignature }), NocsrCheck.FieldMissing);
        await expectFailure(NocsrValidator.validate(context, { nocsrElements }), NocsrCheck.FieldMissing);
    });

    it("accepts NOCSRElements of 900 bytes and refuses 901 bytes", async () => {
        const { context, respondWithLength } = await scenario();

        await NocsrValidator.validate(context, await respondWithLength(900));
        await expectFailure(NocsrValidator.validate(context, await respondWithLength(901)), NocsrCheck.ElementsTooLong);
    });

    it("refuses an attestation signature of another key", async () => {
        const { context, respond } = await scenario();
        const other = PublicKey((await crypto.createKeyPair()).publicKey);

        await expectFailure(
            NocsrValidator.validate({ ...context, dacPublicKey: other }, await respond()),
            NocsrCheck.AttestationSignatureInvalid,
        );
    });

    it("refuses an attestation signature over another challenge", async () => {
        const { context, respond } = await scenario();

        await expectFailure(
            NocsrValidator.validate({ ...context, attestationChallenge: crypto.randomBytes(16) }, await respond()),
            NocsrCheck.AttestationSignatureInvalid,
        );
    });

    it("refuses an attestation signature that is not 64 bytes", async () => {
        const { context, respond } = await scenario();
        const response = await respond();

        await expectFailure(
            NocsrValidator.validate(context, { ...response, attestationSignature: Bytes.fromHex("0102") }),
            NocsrCheck.AttestationSignatureInvalid,
        );
    });

    it("refuses NOCSR elements that are not a NOCSR Information structure", async () => {
        const { context, respondRaw } = await scenario();

        await expectFailure(
            NocsrValidator.validate(context, await respondRaw(Bytes.fromHex("0102"))),
            NocsrCheck.ElementsUnparseable,
        );
    });

    it("refuses another CSRNonce", async () => {
        const { context, respond } = await scenario();

        await expectFailure(
            NocsrValidator.validate(context, await respond({ csrNonce: crypto.randomBytes(32) })),
            NocsrCheck.CsrNonceMismatch,
        );
    });

    it("refuses a CSR with an invalid structure", async () => {
        const { context, respond } = await scenario();

        await expectFailure(
            NocsrValidator.validate(context, await respond({ certSigningRequest: Bytes.fromHex("3000") })),
            NocsrCheck.CsrInvalid,
        );
    });

    it("refuses a CSR that is not DER", async () => {
        const { context, respond } = await scenario();

        await expectFailure(
            NocsrValidator.validate(context, await respond({ certSigningRequest: Bytes.fromHex("30ff") })),
            NocsrCheck.CsrInvalid,
        );
    });

    it("refuses a CSR whose own signature does not verify", async () => {
        const { context, respond, certSigningRequest } = await scenario();
        const otherKey = await crypto.createKeyPair();
        const otherCsr = Bytes.toHex(await Certificate.createCertificateSigningRequest(crypto, otherKey));
        const ownKey = Bytes.toHex(Bytes.of(certSigningRequest)).split(CSR_PUBLIC_KEY_PREFIX)[1].slice(0, 128);
        const otherPublicKey = otherCsr.split(CSR_PUBLIC_KEY_PREFIX)[1].slice(0, 128);

        await expectFailure(
            NocsrValidator.validate(
                context,
                await respond({ certSigningRequest: Bytes.fromHex(otherCsr.replace(otherPublicKey, ownKey)) }),
            ),
            NocsrCheck.CsrInvalid,
        );
    });

    it("refuses a CSR whose public key is not an uncompressed point", async () => {
        const { context, respond, certSigningRequest } = await scenario();
        const csr = Bytes.toHex(Bytes.of(certSigningRequest)).replace(CSR_PUBLIC_KEY_PREFIX, "03420005");

        await expectFailure(
            NocsrValidator.validate(context, await respond({ certSigningRequest: Bytes.fromHex(csr) })),
            NocsrCheck.CsrInvalid,
        );
    });

    it("passes a defect of its own crypto through unchanged", async () => {
        const { context, respond } = await scenario();
        class DefectiveCrypto extends StandardCrypto {
            override verifyEcdsa(): never {
                throw new InternalError("Simulated crypto defect (test)");
            }
        }

        await expect(
            NocsrValidator.validate({ ...context, crypto: new DefectiveCrypto() }, await respond()),
        ).rejectedWith(InternalError);
    });
});
