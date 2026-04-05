# Device Attestation Certificate Checks - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the full Device Attestation Procedure per Matter spec v1.4.2 so controllers validate device certificates, signatures, revocation status, and Certification Declarations during commissioning.

**Architecture:** A `DeviceAttestationValidator` namespace with a single `validate()` function that throws typed errors on failure. `DclCertificateService` is extended with revocation support. A configurable `onAttestationFailure` policy callback in commissioning options controls whether failures abort or allow commissioning.

**Tech Stack:** TypeScript, Mocha/Chai tests, `@noble/curves` for ECDSA, ASN.1/DER parsing, PKCS#7/CMS parsing, DCL REST API.

**References:**
- Design doc: `docs/plans/2026-02-17-attestation-certificate-checks-design.md`
- Matter Spec HTML: `/Users/ingof/DevOHF/matter-spec-html/1.4.2/index.html` (Sections 5.5, 6.2.3, 6.2.3.1, 6.2.4, 11.23.9)

**Build & Test Commands:**
- Build: `npm run build` (from repo root)
- Test protocol package: `cd packages/protocol && npm run test`
- Test node package: `cd packages/node && npm run test`

---

## Task 1: DeviceAttestationValidator - Error Types and Skeleton

Create the error types and empty `validate()` function. This is the foundation everything else builds on.

**Files:**
- Create: `packages/protocol/src/certificate/DeviceAttestationValidator.ts`
- Modify: `packages/protocol/src/certificate/index.ts` (add export)

**Step 1: Create the validator file with enum, error class, and empty validate**

Create `packages/protocol/src/certificate/DeviceAttestationValidator.ts`:

```typescript
/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, MaybePromise } from "#general";
import { VendorId } from "#types";
import { DclCertificateService } from "../dcl/DclCertificateService.js";
import { CommissioningError } from "../peer/CommissioningError.js";

/** Reasons a device attestation validation can fail. */
export enum DeviceAttestationFailure {
    PaaNotTrusted = "PaaNotTrusted",
    CertificateChainInvalid = "CertificateChainInvalid",
    CertificateExpired = "CertificateExpired",
    VendorIdMismatch = "VendorIdMismatch",
    ProductIdMismatch = "ProductIdMismatch",
    AttestationSignatureInvalid = "AttestationSignatureInvalid",
    AttestationNonceMismatch = "AttestationNonceMismatch",
    CertificationDeclarationSignatureInvalid = "CertificationDeclarationSignatureInvalid",
    CertificationDeclarationFieldMismatch = "CertificationDeclarationFieldMismatch",
    CertificateRevoked = "CertificateRevoked",
    FirmwareInfoMismatch = "FirmwareInfoMismatch",
}

/** Error thrown when device attestation validation fails. */
export class DeviceAttestationError extends CommissioningError {
    constructor(
        readonly failure: DeviceAttestationFailure,
        message: string,
    ) {
        super(message);
    }
}

export namespace DeviceAttestationValidator {
    export interface Context {
        crypto: Crypto;
        dclCertificateService: DclCertificateService;
        attestationChallenge: Bytes;
    }

    export interface DeviceAttestationData {
        dac: Bytes;
        pai: Bytes;
        attestationElements: Bytes;
        attestationSignature: Bytes;
        attestationNonce: Bytes;
        vendorId: VendorId;
        productId: number;
    }

    export type OnAttestationFailure =
        | boolean
        | ((failure: DeviceAttestationFailure, reason: string) => MaybePromise<boolean>);

    export async function validate(_context: Context, _data: DeviceAttestationData): Promise<void> {
        // Will be implemented step by step in subsequent tasks
    }
}
```

**Step 2: Add export to barrel file**

In `packages/protocol/src/certificate/index.ts`, add:

```typescript
export * from "./DeviceAttestationValidator.js";
```

**Step 3: Build and verify**

Run: `npm run build` from repo root.
Expected: Successful build with no errors.

**Step 4: Commit**

```
feat: add DeviceAttestationValidator skeleton with error types
```

---

## Task 2: onAttestationFailure Option in Commissioning Flow

Add the policy option to the commissioning options type and wire up the switch/case resolution in `#deviceAttestation()`.

**Files:**
- Modify: `packages/protocol/src/peer/ControllerCommissioningFlow.ts`
- Modify: `packages/node/src/behavior/system/commissioning/CommissioningClient.ts`

**Step 1: Add the option to ControllerCommissioningFlowOptions**

In `packages/protocol/src/peer/ControllerCommissioningFlow.ts`, add import and option.

Add to imports:

```typescript
import {
    DeviceAttestationError,
    DeviceAttestationFailure,
    DeviceAttestationValidator,
} from "../certificate/DeviceAttestationValidator.js";
```

Add to `ControllerCommissioningFlowOptions` type (after `otaUpdateProviderLocation`):

```typescript
    /**
     * Controls behavior when device attestation validation fails.
     * - false: always reject
     * - true: always accept with info logging
     * - callback: custom decision logic, return true to proceed, false to reject
     * - undefined: accept with warning logging (backward compatibility)
     *
     * TODO: Make required in next breaking version and remove undefined backward-compatible accept
     */
    onAttestationFailure?: DeviceAttestationValidator.OnAttestationFailure;
```

**Step 2: Wire up the handler resolution in #deviceAttestation()**

In the `#deviceAttestation()` method (currently around line 950), after the existing code that fetches DAC, PAI, attestation elements and signature, replace the TODO validation placeholder (lines 995-1004) with:

```typescript
        // Resolve attestation failure policy
        let resolveFailure: (failure: DeviceAttestationFailure, reason: string) => MaybePromise<boolean>;

        switch (this.commissioningOptions.onAttestationFailure) {
            case undefined:
                // TODO: Remove backward-compatible accept in next breaking version
                resolveFailure = (failure, reason) => {
                    logger.warn("Attestation failed but accepted for backward compatibility:", failure, reason);
                    return true;
                };
                break;

            case true:
                resolveFailure = (failure, reason) => {
                    logger.info("Attestation failed but accepted by policy:", failure, reason);
                    return true;
                };
                break;

            case false:
                resolveFailure = (failure, reason) => {
                    logger.info("Attestation failed, rejecting:", failure, reason);
                    return false;
                };
                break;

            default:
                resolveFailure = this.commissioningOptions.onAttestationFailure;
                break;
        }

        try {
            // TODO: pass real context once DclCertificateService is available here
            await DeviceAttestationValidator.validate(
                {
                    crypto: this.fabric.crypto,
                    dclCertificateService: undefined as any, // TODO: wire up in Task 8
                    attestationChallenge: this.interaction.session.attestationChallengeKey,
                },
                {
                    dac: deviceAttestation,
                    pai: productAttestation,
                    attestationElements,
                    attestationSignature,
                    attestationNonce,
                    vendorId: this.collectedCommissioningData.vendorId!,
                    productId: this.collectedCommissioningData.productId!,
                },
            );
        } catch (error) {
            if (error instanceof DeviceAttestationError) {
                const proceed = await resolveFailure(error.failure, error.message);
                if (!proceed) {
                    throw error;
                }
            } else {
                throw error;
            }
        }
```

Note: The `attestationNonce` needs to be stored before sending. Change the nonce generation line to capture it:

```typescript
        const attestationNonce = this.fabric.crypto.randomBytes(32);
        const { attestationElements, attestationSignature } = await this.#invokeCommand(
            {
                endpoint: RootEndpointNumber,
                cluster: OperationalCredentials.Complete,
                command: "attestationRequest",
                fields: {
                    attestationNonce,
                },
            },
            ...
        );
```

**Step 3: Forward option from CommissioningClient**

In `packages/node/src/behavior/system/commissioning/CommissioningClient.ts`, add `onAttestationFailure` to `BaseCommissioningOptions`:

```typescript
    export interface BaseCommissioningOptions {
        // ... existing fields ...

        /**
         * Controls behavior when device attestation validation fails.
         * See ControllerCommissioningFlowOptions.onAttestationFailure for details.
         */
        onAttestationFailure?: DeviceAttestationValidator.OnAttestationFailure;
    }
```

Add the import and forward it into `commissioningOptions` in the `commission()` method:

```typescript
        const commissioningOptions: LocatedNodeCommissioningOptions = {
            // ... existing fields ...
            onAttestationFailure: options.onAttestationFailure,
        };
```

**Step 4: Build and verify**

Run: `npm run build` from repo root.
Expected: Successful build. The validate() is still empty so commissioning works unchanged.

**Step 5: Commit**

```
feat: add onAttestationFailure policy option to commissioning flow
```

---

## Task 3: Certificate Chain Validation (PAA Lookup, Chain Verify, VendorID)

Implement validation steps 1-4: parse certificates, PAA trust store lookup, chain signature verification, and VendorID matching.

**Files:**
- Modify: `packages/protocol/src/certificate/DeviceAttestationValidator.ts`
- Modify: `packages/protocol/src/certificate/kinds/AttestationCertificates.ts` (add `fromAsn1` to Pai and Dac)
- Create: `packages/protocol/test/certificate/DeviceAttestationValidatorTest.ts`

**Step 1: Add fromAsn1 to Pai and Dac classes**

In `packages/protocol/src/certificate/kinds/AttestationCertificates.ts`, the `Pai` and `Dac` classes are empty. Add `fromAsn1` static methods (same pattern as `Paa`):

```typescript
export class Pai extends AttestationBaseCertificate<AttestationCertificate.Pai> {
    static fromAsn1(asn1: Bytes): Pai {
        const cert = Certificate.parseAsn1Certificate(asn1, Certificate.REQUIRED_EXTENSIONS);
        return new Pai(cert as AttestationCertificate.Pai);
    }
}

export class Dac extends AttestationBaseCertificate<AttestationCertificate.Dac> {
    static fromAsn1(asn1: Bytes): Dac {
        const cert = Certificate.parseAsn1Certificate(asn1, Certificate.REQUIRED_EXTENSIONS);
        return new Dac(cert as AttestationCertificate.Dac);
    }
}
```

**Step 2: Write the failing test for PAA trust store lookup**

Create `packages/protocol/test/certificate/DeviceAttestationValidatorTest.ts`. Use test certificates from `AttestationCertificateManager` to generate a DAC/PAI/PAA chain in `before()`, then test that validate throws `PaaNotTrusted` when the PAA is not in the trust store.

Reference patterns:
- `packages/protocol/test/certificate/CertificatesTest.ts` for test setup
- `packages/protocol/test/dcl/DclCertificateServiceTest.ts` for MockFetch and DclCertificateService setup
- `AttestationCertificateManager.create(crypto, vendorId)` generates a test PAA+PAI+DAC chain

**Step 3: Run test to verify it fails**

Run: `cd packages/protocol && npm run test`
Expected: Test fails because `validate()` is still empty.

**Step 4: Implement certificate parsing and PAA trust store check**

In `DeviceAttestationValidator.ts`, implement the first part of `validate()`:

```typescript
import { Dac } from "./kinds/AttestationCertificates.js";
import { Pai } from "./kinds/AttestationCertificates.js";
import { PublicKey } from "#general";

export async function validate(context: Context, data: DeviceAttestationData): Promise<void> {
    const { crypto, dclCertificateService } = context;

    // 1. Parse DAC and PAI from DER
    const dac = Dac.fromAsn1(data.dac);
    const pai = Pai.fromAsn1(data.pai);

    // 2. PAA Trust Store - look up PAI's authority key identifier
    const paiAkid = pai.cert.extensions.authorityKeyIdentifier;
    const paaMetadata = dclCertificateService.getCertificate(paiAkid);
    if (paaMetadata === undefined) {
        throw new DeviceAttestationError(
            DeviceAttestationFailure.PaaNotTrusted,
            `PAA not found in trust store for authority key identifier ${Bytes.toHex(paiAkid)}`,
        );
    }

    // 3. Certificate chain verification - PAI signed by PAA, DAC signed by PAI
    // Get PAA certificate DER from storage to verify PAI signature
    // ... verify PAI signature against PAA public key
    // ... verify DAC signature against PAI public key

    // 4. VendorID matching
    const dacVendorId = dac.cert.subject.vendorId;
    const paiVendorId = pai.cert.subject.vendorId;
    if (dacVendorId !== paiVendorId) {
        throw new DeviceAttestationError(
            DeviceAttestationFailure.VendorIdMismatch,
            `DAC VendorID ${dacVendorId} does not match PAI VendorID ${paiVendorId}`,
        );
    }
    // If PAA has a VendorID, it must match PAI
    // (PAA VendorID check requires parsing the PAA cert from storage)
}
```

Note: The exact certificate field names (`subject.vendorId`, `extensions.authorityKeyIdentifier`, etc.) should be confirmed by reading the `AttestationCertificate` type definitions in `packages/protocol/src/certificate/kinds/definitions/attestation.ts` and `packages/protocol/src/certificate/kinds/definitions/base.ts`.

The chain signature verification uses the same pattern as `Rcac.verify()` (see `packages/protocol/src/certificate/kinds/Rcac.ts:139`):

```typescript
await crypto.verifyEcdsa(PublicKey(issuerPublicKey), certToVerify.asUnsignedDer(), certToVerify.signature);
```

**Step 5: Run tests to verify they pass**

Run: `cd packages/protocol && npm run test`
Expected: PAA trust store test passes, VendorID mismatch test passes.

**Step 6: Write and run tests for chain signature verification and VendorID matching**

Add tests:
- Valid chain passes
- Tampered DAC fails with `CertificateChainInvalid`
- DAC with different VendorID from PAI fails with `VendorIdMismatch`

**Step 7: Commit**

```
feat: implement certificate chain validation in DeviceAttestationValidator
```

---

## Task 4: Attestation Nonce and Signature Verification

Implement validation steps 6-7: nonce matching and attestation signature verification.

**Files:**
- Modify: `packages/protocol/src/certificate/DeviceAttestationValidator.ts`
- Modify: `packages/protocol/test/certificate/DeviceAttestationValidatorTest.ts`

**Step 1: Write failing tests**

Tests needed:
- Valid attestation nonce passes
- Wrong nonce throws `AttestationNonceMismatch`
- Valid attestation signature passes
- Invalid signature throws `AttestationSignatureInvalid`

For these tests you need to generate real attestation data. Use `DeviceCertification.sign()` pattern to create valid attestation elements+signature, then tamper with them for failure cases.

Reference: `TlvAttestation` from `packages/protocol/src/common/OperationalCredentialsTypes.ts` for encoding/decoding attestation elements.

The attestation TBS is `[attestationElements, attestationChallenge]` concatenated (see `DeviceCertification.ts:87`).

**Step 2: Run tests to verify they fail**

Run: `cd packages/protocol && npm run test`
Expected: Tests fail.

**Step 3: Implement nonce check and signature verification**

Add to `validate()` after the chain checks:

```typescript
    // 6. AttestationNonce match
    const attestationInfo = TlvAttestation.decode(data.attestationElements);
    if (!Bytes.areEqual(attestationInfo.attestationNonce, data.attestationNonce)) {
        throw new DeviceAttestationError(
            DeviceAttestationFailure.AttestationNonceMismatch,
            "AttestationNonce in response does not match the nonce sent",
        );
    }

    // 7. Attestation Signature - verify over [attestationElements, attestationChallenge]
    const dacPublicKey = PublicKey(dac.cert.ellipticCurvePublicKey);
    try {
        await crypto.verifyEcdsa(
            dacPublicKey,
            Bytes.concat(data.attestationElements, context.attestationChallenge),
            EcdsaSignature.fromDer(data.attestationSignature),
        );
    } catch {
        throw new DeviceAttestationError(
            DeviceAttestationFailure.AttestationSignatureInvalid,
            "Attestation signature verification failed",
        );
    }
```

Note: Check exact signature format - the attestation signature from the device may be raw bytes or DER-encoded. Look at how `EcdsaSignature` works in `packages/general/src/crypto/EcdsaSignature.ts`.

**Step 4: Run tests to verify they pass**

Run: `cd packages/protocol && npm run test`
Expected: All attestation nonce and signature tests pass.

**Step 5: Commit**

```
feat: implement attestation nonce and signature verification
```

---

## Task 5: CertificationDeclaration Parsing

Add the `parse()` function to extract CD content, signer info, and signature from a CMS/PKCS#7 SignedData structure.

**Files:**
- Modify: `packages/protocol/src/certificate/kinds/CertificationDeclaration.ts`
- Create or extend: `packages/protocol/test/certificate/CertificationDeclarationTest.ts`

**Step 1: Write failing test for CD parsing**

Generate a test CD using the existing `CertificationDeclaration.generate()`, then parse it back and verify the extracted fields match.

**Step 2: Run test to verify it fails**

Expected: `parse` function doesn't exist yet.

**Step 3: Implement parse()**

The CD is CMS/PKCS#7 SignedData. Use `DerCodec.decode()` to parse the ASN.1 structure. The structure matches what `asSignedAsn1()` creates:

```
SEQUENCE {
  OID (signedData)
  [0] SEQUENCE {
    INTEGER (version = 3)
    SET { SEQUENCE { OID (sha256) } }  -- digestAlgorithms
    SEQUENCE {                          -- encapContentInfo
      OID (data)
      [0] OCTET STRING (eContent)      -- the TLV-encoded CD
    }
    SET {                               -- signerInfos
      SEQUENCE {
        INTEGER (version = 3)
        [0] OCTET STRING               -- subjectKeyIdentifier
        SEQUENCE { OID (sha256) }       -- digestAlgorithm
        SEQUENCE { OID (ecdsaWithSHA256) } -- signatureAlgorithm
        OCTET STRING                    -- signature
      }
    }
  }
}
```

The `parse()` function decodes this structure, extracts the `eContent` and decodes it via `CertificationDeclarationDef.TlvDc.decode()`, and extracts the `subjectKeyIdentifier` and `signature` from the `SignerInfo`.

Reference: The encoding side is in `CertificationDeclaration.asSignedAsn1()` and `Pkcs7` namespace in `packages/general/src/crypto/Pkcs7.ts`. Reverse engineer the parsing from the encoding structure.

Also reference `DerCodec` in `packages/general/src/codec/DerCodec.ts` for how ASN.1 parsing works in this codebase.

**Step 4: Run tests to verify round-trip works**

Run: `cd packages/protocol && npm run test`
Expected: Generate CD, parse it, fields match.

**Step 5: Commit**

```
feat: add CertificationDeclaration.parse() for CD verification
```

---

## Task 6: Certification Declaration Validation

Implement validation steps 8-9: CD signature verification and CD field validation against BasicInformation and DAC/PAI.

**Files:**
- Modify: `packages/protocol/src/certificate/DeviceAttestationValidator.ts`
- Modify: `packages/protocol/test/certificate/DeviceAttestationValidatorTest.ts`

**Step 1: Write failing tests**

Tests needed:
- Valid CD signature passes
- Tampered CD throws `CertificationDeclarationSignatureInvalid`
- CD vendorId matches BasicInformation passes
- CD vendorId mismatch throws `CertificationDeclarationFieldMismatch`
- CD productIdArray not containing device productId throws `CertificationDeclarationFieldMismatch`
- CD with `dacOriginVendorId`/`dacOriginProductId` - cross-validation with DAC/PAI
- CD with `authorizedPaaList` - PAA SKI must be in list

**Step 2: Run tests, verify they fail**

**Step 3: Implement CD signature and field validation**

Add to `validate()`:

```typescript
    // 8. CD Signature validation
    const cd = CertificationDeclaration.parse(attestationInfo.declaration);

    // Fetch CSA CD signer certificate from DCL by subject key identifier
    // Verify signature: crypto.verifyEcdsa(cdSignerPublicKey, cd.signedData, cd.signature)

    // 9. CD Field validation
    if (cd.content.vendorId !== data.vendorId) {
        throw new DeviceAttestationError(
            DeviceAttestationFailure.CertificationDeclarationFieldMismatch,
            `CD vendor_id ${cd.content.vendorId} does not match BasicInformation VendorID ${data.vendorId}`,
        );
    }
    if (!cd.content.produceIdArray.includes(data.productId)) {
        throw new DeviceAttestationError(
            DeviceAttestationFailure.CertificationDeclarationFieldMismatch,
            `CD product_id_array does not contain BasicInformation ProductID ${data.productId}`,
        );
    }

    // dacOrigin cross-validation
    if (cd.content.dacOriginVendorId !== undefined && cd.content.dacOriginProductId !== undefined) {
        // Both present: validate against dacOrigin fields
        // DAC vendorId must match dacOriginVendorId
        // PAI vendorId must match dacOriginVendorId
        // DAC productId must match dacOriginProductId
    } else if (cd.content.dacOriginVendorId === undefined && cd.content.dacOriginProductId === undefined) {
        // Neither present: validate against vendor_id/product_id_array
        // DAC vendorId must match cd.vendorId
        // PAI vendorId must match cd.vendorId
        // DAC productId must be in cd.produceIdArray
    } else {
        // One present without the other - invalid
        throw new DeviceAttestationError(
            DeviceAttestationFailure.CertificationDeclarationFieldMismatch,
            "CD has only one of dac_origin_vendor_id and dac_origin_product_id",
        );
    }

    // authorizedPaaList check
    if (cd.content.authorizedPaaList !== undefined) {
        const paaSki = /* PAA's subject key identifier */;
        if (!cd.content.authorizedPaaList.some(entry => Bytes.areEqual(entry, paaSki))) {
            throw new DeviceAttestationError(
                DeviceAttestationFailure.CertificationDeclarationFieldMismatch,
                "PAA subject key identifier not found in CD authorized_paa_list",
            );
        }
    }
```

**Step 4: Run tests, verify they pass**

**Step 5: Commit**

```
feat: implement Certification Declaration validation
```

---

## Task 7: DclClient Revocation Endpoints

Add the DCL REST API methods for fetching revocation distribution points.

**Files:**
- Modify: `packages/protocol/src/dcl/DclClient.ts`
- Modify: `packages/protocol/src/dcl/DclRestApiTypes.ts`
- Modify: `packages/types/src/dcl/device-attestation-revocation.ts` (if response types needed)
- Extend: `packages/protocol/test/dcl/DclCertificateServiceTest.ts`

**Step 1: Add response types**

In `packages/protocol/src/dcl/DclRestApiTypes.ts`, add:

```typescript
/** Response for /dcl/pki/revocation-points */
export interface DclPkiRevocationPointsResponse {
    PkiRevocationDistributionPoint: DeviceAttestationPkiRevocationDclSchema[];
    // May have pagination
}

/** Response for /dcl/pki/revocation-points/{issuerSubjectKeyId} */
export interface DclPkiRevocationPointsByIssuerResponse {
    PkiRevocationDistributionPointsByIssuerSubjectKeyID: {
        issuerSubjectKeyId: string;
        points: DeviceAttestationPkiRevocationDclSchema[];
    };
}
```

Note: Verify the exact DCL API response shape. The DCL Swagger docs are at `https://zigbee-alliance.github.io/distributed-compliance-ledger/#/`. The type `DeviceAttestationPkiRevocationDclSchema` already exists in `packages/types/src/dcl/device-attestation-revocation.ts`.

**Step 2: Add DclClient methods**

In `packages/protocol/src/dcl/DclClient.ts`:

```typescript
    async fetchRevocationDistributionPoints(options?: DclClient.Options) {
        return this.#fetchPaginatedJson<DeviceAttestationPkiRevocationDclSchema>(
            "/dcl/pki/revocation-points",
            "PkiRevocationDistributionPoint",
            options,
        );
    }

    async fetchRevocationDistributionPointsByIssuer(
        issuerSubjectKeyId: string,
        options?: DclClient.Options,
    ) {
        const path = `/dcl/pki/revocation-points/${encodeURIComponent(issuerSubjectKeyId)}`;
        // Fetch and return
    }
```

**Step 3: Write tests with mocked fetch**

Add tests to `DclCertificateServiceTest.ts` (or a new `DclClientTest.ts`) that mock the revocation endpoints and verify the client methods parse responses correctly.

**Step 4: Run tests, verify they pass**

**Step 5: Commit**

```
feat: add DCL revocation distribution point API methods
```

---

## Task 8: DclCertificateService Revocation Support

Extend `DclCertificateService` to fetch revocation data, build the revocation set, cache it in storage, and provide the `isRevoked()` lookup.

**Files:**
- Modify: `packages/protocol/src/dcl/DclCertificateService.ts`
- Extend: `packages/protocol/test/dcl/DclCertificateServiceTest.ts`

**Step 1: Write failing tests**

Tests:
- After `update()` with mocked revocation endpoints, `isRevoked()` returns true for a revoked serial number
- `isRevoked()` returns false for a non-revoked serial number
- Revocation data persists to storage and loads on restart
- CRL with invalid signature is skipped (logged warning)
- Missing revocation data returns false (not revoked) + logger warning

**Step 2: Run tests, verify they fail**

**Step 3: Add revocation storage and index**

Add to `DclCertificateService`:

```typescript
    #revocationStorage?: StorageContext;
    #revocationIndex = new Map<string, Set<string>>(); // key: "akid:issuerName", value: set of serial numbers
```

In the constructor's construction function, after the existing storage init:

```typescript
    this.#revocationStorage = this.#storageManager.createContext("revocations");
    await this.#loadRevocationIndex(this.#revocationStorage);
```

**Step 4: Implement revocation fetching in update()**

During `update()`, after fetching PAA certificates, fetch revocation distribution points and build the revocation set following the Section 6.2.4.1 algorithm:

1. Fetch all revocation distribution points from DCL
2. For each entry with `revocationType === 1` (CRL):
   - Validate `CRLSignerCertificate` chain
   - Download CRL from `dataUrl`
   - Validate CRL authority key identifier matches signer
   - Extract revoked serial numbers
   - Store in revocation index

CRL parsing: RFC 5280 CRLs are DER-encoded ASN.1. Use `DerCodec.decode()` to parse them. The structure is:
```
CertificateList ::= SEQUENCE {
    tbsCertList TBSCertList,
    signatureAlgorithm,
    signatureValue BIT STRING
}
TBSCertList ::= SEQUENCE {
    version INTEGER OPTIONAL,
    signature AlgorithmIdentifier,
    issuer Name,
    thisUpdate Time,
    nextUpdate Time OPTIONAL,
    revokedCertificates SEQUENCE OF SEQUENCE {
        userCertificate CertificateSerialNumber,
        revocationDate Time,
        crlEntryExtensions Extensions OPTIONAL
    } OPTIONAL,
    crlExtensions [0] EXPLICIT Extensions OPTIONAL
}
```

**Step 5: Implement isRevoked()**

```typescript
    isRevoked(authorityKeyIdentifier: Bytes | string, issuer: Bytes, serialNumber: Bytes | string): boolean {
        this.construction.assert();
        const akid = this.#normalizeSubjectKeyId(authorityKeyIdentifier);
        // Build lookup key from akid
        // Check revocation set for matching serial number
        // Follow 6.2.4.2 algorithm
    }
```

**Step 6: Implement storage persistence**

Save and load the revocation index to/from `#revocationStorage`, similar to the certificate index pattern.

**Step 7: Run tests, verify they pass**

**Step 8: Commit**

```
feat: add revocation support to DclCertificateService
```

---

## Task 9: Wire Up Revocation in DeviceAttestationValidator

Connect the revocation check to the validator.

**Files:**
- Modify: `packages/protocol/src/certificate/DeviceAttestationValidator.ts`
- Modify: `packages/protocol/test/certificate/DeviceAttestationValidatorTest.ts`

**Step 1: Write failing tests**

Tests:
- Revoked DAC throws `CertificateRevoked`
- Revoked PAI throws `CertificateRevoked`
- Non-revoked certificates pass
- Unavailable revocation data logs warning and passes (does not throw)

**Step 2: Run tests, verify they fail**

**Step 3: Implement revocation check in validate()**

Add after VendorID matching:

```typescript
    // 5. Revocation check
    const dacRevoked = dclCertificateService.isRevoked(
        dac.cert.extensions.authorityKeyIdentifier,
        /* DAC issuer name */,
        dac.cert.serialNumber,
    );
    if (dacRevoked) {
        throw new DeviceAttestationError(
            DeviceAttestationFailure.CertificateRevoked,
            "Device Attestation Certificate has been revoked",
        );
    }

    const paiRevoked = dclCertificateService.isRevoked(
        pai.cert.extensions.authorityKeyIdentifier,
        /* PAI issuer name */,
        pai.cert.serialNumber,
    );
    if (paiRevoked) {
        throw new DeviceAttestationError(
            DeviceAttestationFailure.CertificateRevoked,
            "Product Attestation Intermediate certificate has been revoked",
        );
    }
```

**Step 4: Run tests, verify they pass**

**Step 5: Commit**

```
feat: wire up revocation checks in attestation validation
```

---

## Task 10: Wire Up DclCertificateService in Commissioning Flow

Connect the `DclCertificateService` from the environment to the commissioning flow so `validate()` gets a real context.

**Files:**
- Modify: `packages/protocol/src/peer/ControllerCommissioningFlow.ts`
- Modify: `packages/protocol/src/peer/ControllerCommissioner.ts` (pass DclCertificateService)

**Step 1: Find how the environment is accessible**

The `ControllerCommissioner` has access to the `Environment` (check how it's constructed). The `DclCertificateService` is registered as a singleton in the environment via `environment.set(DclCertificateService, this)`.

Pass the `DclCertificateService` through to `ControllerCommissioningFlow`, either as a new constructor parameter or by accessing it from the environment through the existing objects.

**Step 2: Replace the TODO placeholder**

In `#deviceAttestation()`, replace `dclCertificateService: undefined as any` with the real service instance.

**Step 3: Add CSR signature verification in #certificates()**

Add a field to store the DAC public key:

```typescript
    #dacPublicKey?: JsonWebKey;
```

Set it at the end of `#deviceAttestation()`:

```typescript
    const dac = Dac.fromAsn1(deviceAttestation);
    this.#dacPublicKey = PublicKey(dac.cert.ellipticCurvePublicKey);
```

In `#certificates()`, after the existing CSR decode, add:

```typescript
    // Verify CSR signature using DAC public key
    if (this.#dacPublicKey !== undefined) {
        try {
            await this.fabric.crypto.verifyEcdsa(
                this.#dacPublicKey,
                Bytes.concat(nocsrElements, this.interaction.session.attestationChallengeKey),
                EcdsaSignature.fromDer(csrSignature),
            );
        } catch {
            throw new CommissioningError("CSR signature verification failed");
        }
    }
```

**Step 4: Build and run full test suite**

Run: `npm run build && cd packages/protocol && npm run test && cd ../node && npm run test`
Expected: All tests pass.

**Step 5: Commit**

```
feat: wire up DclCertificateService and CSR verification in commissioning
```

---

## Task 11: Server-Side DeviceCertification Validation

Implement the `#validateCertification()` stub for server-side vendorId/productId checks.

**Files:**
- Modify: `packages/protocol/src/certificate/DeviceCertification.ts`

**Step 1: Implement #validateCertification()**

Replace the stub at line 79:

```typescript
    #validateCertification(product: ProductDescription) {
        const { certificate, intermediateCertificate } = this.#assertInitialized();

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
```

**Step 2: Build and verify**

**Step 3: Commit**

```
feat: implement server-side certificate vendorId/productId validation
```

---

## Task 12: Integration Testing with ClientNode

Test the full commissioning flow with attestation validation using the existing ClientNode test infrastructure.

**Files:**
- Extend: `packages/node/test/node/ClientNodeTest.ts` (or create a focused test file)

**Step 1: Write integration test for successful attestation**

Test that commissioning a matter.js test device succeeds when `onAttestationFailure` is set to `true` (test devices use test certificates that won't be in a production trust store).

**Step 2: Write integration test for attestation rejection**

Test that commissioning fails when `onAttestationFailure` is set to `false` and the device has an untrusted PAA.

**Step 3: Write integration test for custom callback**

Test that the callback receives the correct `DeviceAttestationFailure` enum and reason, and that returning `true` allows commissioning to proceed.

**Step 4: Run tests**

Run: `cd packages/node && npm run test`
Expected: All integration tests pass.

**Step 5: Commit**

```
test: add integration tests for device attestation during commissioning
```

---

## Task 13: Final Cleanup and Build Verification

**Step 1: Full build**

Run: `npm run build` from repo root.
Expected: Clean build with no errors.

**Step 2: Full test suite**

Run tests in both affected packages:

```bash
cd packages/protocol && npm run test
cd ../node && npm run test
```

Expected: All tests pass.

**Step 3: Review all TODO comments**

Search for remaining TODOs that were addressed and remove them. Search for any new TODOs that should be tracked.

**Step 4: Final commit**

```
chore: cleanup TODOs and verify attestation certificate checks
```

---

## Dependency Order

```
Task 1 (skeleton)
  → Task 2 (policy option)
  → Task 3 (chain validation) → Task 4 (nonce + sig) → Task 6 (CD validation)
  → Task 5 (CD parsing) → Task 6 (CD validation)
  → Task 7 (DCL revocation API) → Task 8 (revocation service) → Task 9 (revocation in validator)
  → Task 10 (wire up in commissioning) → Task 12 (integration tests)
  → Task 11 (server-side) -- independent
  → Task 13 (cleanup) -- last
```

Parallelizable groups:
- Tasks 3, 5, 7 can start in parallel after Task 2
- Task 11 is independent of everything except Task 3 (for fromAsn1)
