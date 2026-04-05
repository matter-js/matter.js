# Device Attestation Certificate Checks

## Problem

The commissioning flow in `ControllerCommissioningFlow.ts` fetches the Device Attestation Certificate (DAC), Product Attestation Intermediate (PAI), attestation elements, and attestation signature from the Commissionee but performs no validation. Six TODO comments mark where validation should occur. Without these checks, matter.js controllers accept any device regardless of certification status, revocation, or authenticity.

## Goal

Implement the full Device Attestation Procedure per Matter specification v1.4.2 Section 6.2.3, including certificate chain validation, signature verification, Certification Declaration validation, and revocation checks (Section 6.2.4). Provide a configurable policy for handling attestation failures per Section 5.5 step 10.

## Design

### DeviceAttestationValidator Namespace

A new namespace in `packages/protocol/src/certificate/DeviceAttestationValidator.ts` with a single `validate()` method. The validation is a stateless procedure: it takes all inputs and either succeeds silently or throws `DeviceAttestationError`.

#### Failure Enum

```typescript
enum DeviceAttestationFailure {
    PaaNotTrusted,
    CertificateChainInvalid,
    CertificateExpired,
    VendorIdMismatch,
    ProductIdMismatch,
    AttestationSignatureInvalid,
    AttestationNonceMismatch,
    CertificationDeclarationSignatureInvalid,
    CertificationDeclarationFieldMismatch,
    CertificateRevoked,
    FirmwareInfoMismatch,
}
```

#### Error Class

```typescript
class DeviceAttestationError extends CommissioningError {
    constructor(
        readonly failure: DeviceAttestationFailure,
        message: string,
    ) { ... }
}
```

#### validate() Signature

```typescript
namespace DeviceAttestationValidator {
    interface Context {
        crypto: Crypto;
        dclCertificateService: DclCertificateService;
        attestationChallenge: Bytes;
    }

    interface DeviceAttestationData {
        dac: Bytes;                  // DER from CertificateChainRequest
        pai: Bytes;                  // DER from CertificateChainRequest
        attestationElements: Bytes;  // from AttestationResponse
        attestationSignature: Bytes; // from AttestationResponse
        attestationNonce: Bytes;     // the nonce we sent
        vendorId: VendorId;          // from BasicInformation
        productId: number;           // from BasicInformation
    }

    async function validate(context: Context, data: DeviceAttestationData): Promise<void>;
}
```

#### Validation Order

Optimized to fail fast on cheap checks:

1. Parse DAC and PAI from DER.
2. **PAA Trust Store** -- look up PAI's authority key identifier in `DclCertificateService`. Throw `PaaNotTrusted`.
3. **Certificate Chain** -- verify DAC signed by PAI, PAI signed by PAA. Chain length must be exactly 3. Validate with respect to DAC's `notBefore` timestamp. Throw `CertificateChainInvalid` or `CertificateExpired`.
4. **VendorID match** -- DAC vs PAI must match. If PAA has a VendorID, it must match PAI. Throw `VendorIdMismatch`.
5. **Revocation** -- check DAC and PAI serial numbers against `DclCertificateService.isRevoked()`. Throw `CertificateRevoked`. If revocation data is unavailable, log a warning and continue (per spec Section 6.2.4.2).
6. **AttestationNonce match** -- decode attestation elements via `TlvAttestation`, compare nonce. Throw `AttestationNonceMismatch`.
7. **Attestation Signature** -- verify signature over `attestationElements || attestationChallenge` using DAC public key. Throw `AttestationSignatureInvalid`.
8. **CD Signature** -- parse Certification Declaration from attestation elements, verify against CSA CD signing certificate (fetched from DCL, matched by subject key identifier). Throw `CertificationDeclarationSignatureInvalid`.
9. **CD Field validation** -- validate `vendor_id` and `product_id_array` against BasicInformation. Cross-validate `dac_origin_vendor_id`/`dac_origin_product_id` with DAC/PAI subject DNs if present. Validate `authorized_paa_list` if present. Throw `CertificationDeclarationFieldMismatch`.
10. **Firmware info** -- if present in attestation elements, validate against DCL. Log warning if validation not supported.

### Policy Callback (onAttestationFailure)

Added to `ControllerCommissioningFlowOptions`:

```typescript
type ControllerCommissioningFlowOptions = {
    // ... existing fields ...

    /**
     * Controls behavior when device attestation validation fails.
     * - false: always reject
     * - true: always accept with info logging
     * - callback: custom decision logic, return true to proceed, false to reject
     * - undefined: accept with warning logging (backward compatibility)
     *
     * TODO: Make required in next breaking version (remove undefined default)
     */
    onAttestationFailure?:
        | boolean
        | ((failure: DeviceAttestationFailure, reason: string) => MaybePromise<boolean>);
};
```

Resolution in commissioning flow:

```typescript
let resolve: (failure: DeviceAttestationFailure, reason: string) => MaybePromise<boolean>;

switch (this.commissioningOptions.onAttestationFailure) {
    case undefined:
        // TODO: Remove backward-compatible accept in next breaking version
        resolve = (failure, reason) => {
            logger.warn("Attestation failed but accepted for backward compatibility:", failure, reason);
            return true;
        };
        break;

    case true:
        resolve = (failure, reason) => {
            logger.info("Attestation failed but accepted by policy:", failure, reason);
            return true;
        };
        break;

    case false:
        resolve = (failure, reason) => {
            logger.info("Attestation failed, rejecting:", failure, reason);
            return false;
        };
        break;

    default:
        resolve = this.commissioningOptions.onAttestationFailure;
        break;
}
```

#### Option Propagation

Both entry points expose the option:

- **CommissioningClient** (`packages/node/src/behavior/system/commissioning/CommissioningClient.ts`): Add `onAttestationFailure` to `BaseCommissioningOptions`, forward into `commissioningOptions` in the `commission()` method.
- **CommissioningController** (legacy, `packages/matter.js/src/CommissioningController.ts`): Already passes through `CommissioningOptions` which extends `Partial<ControllerCommissioningFlowOptions>`, so it inherits the field automatically.

### DclCertificateService Extensions

#### Revocation Support

Revocation data is managed within `DclCertificateService` alongside PAA certificates, using a separate storage sub-context:

- New `#revocationStorage` sub-context (key: `"revocations"`)
- `#revocationIndex` map: indexed by `(authorityKeyIdentifier, issuerName)` tuple, holding sets of revoked serial numbers plus CRL signer certificate info
- Synchronous `isRevoked(authorityKeyIdentifier, issuer, serialNumber): boolean` for fast lookup against cached data
- Revocation distribution points fetched during `update()` alongside PAA certificates
- CRLs downloaded from `DataUrl`, validated per Section 6.2.4.1 algorithm, serial numbers extracted into revocation set
- Persisted to storage so data is available immediately on startup without network access

#### New DclClient Methods

```typescript
// Fetch all revocation distribution point entries
async fetchRevocationDistributionPoints(options?: DclClient.Options)
    // GET /dcl/pki/revocation-points

// Fetch entries for a specific issuer
async fetchRevocationDistributionPointsByIssuer(
    issuerSubjectKeyId: string, options?: DclClient.Options)
    // GET /dcl/pki/revocation-points/{issuerSubjectKeyId}
```

#### CD Signing Certificate Fetching

CSA Certification Declaration signing certificates are fetched from DCL rather than hardcoded, matched by the subject key identifier found in the CD's SignerInfo.

### CertificationDeclaration Parsing

Add a `parse()` function to the existing `CertificationDeclaration` class:

```typescript
namespace CertificationDeclaration {
    function parse(cdBytes: Bytes): {
        content: TypeFromBitmapSchema<typeof CertificationDeclarationDef.TlvDc>;
        signerSubjectKeyId: Bytes;
        signature: EcdsaSignature;
        signedData: Bytes;
    }
}
```

Parses CMS/PKCS#7 SignedData, extracts the TLV-encoded CD content, signer subject key identifier, and signature for verification.

### Commissioning Flow Changes

#### Step 10 (#deviceAttestation)

1. Fetch DAC and PAI via `certificateChainRequest` (existing).
2. Fetch attestation elements and signature via `attestationRequest` (existing).
3. Read `vendorId` and `productId` from BasicInformation (already collected earlier).
4. Call `DeviceAttestationValidator.validate(context, data)`.
5. On `DeviceAttestationError`: call resolved `onAttestationFailure` handler, abort if it returns false.
6. Extract and store DAC public key for use in step 11.

#### Step 11 (#certificates)

7. Verify CSR signature: `crypto.verifyEcdsa(dacPublicKey, nocsrElements || attestationChallenge, csrSignature)`.

The DAC public key is stored as a field on the `ControllerCommissioningFlow` instance, passed from step 10 to step 11.

### Server-Side Validation

The existing `DeviceCertification.#validateCertification()` stub (line 79) gets implemented to validate that vendorId and productId extracted from the certificate and intermediate certificate match the product description. This is a separate, simpler check on the device side.

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `packages/protocol/src/certificate/DeviceAttestationValidator.ts` | Namespace with `validate()`, error class, failure enum |

### Modified Files

| File | Changes |
|------|---------|
| `packages/protocol/src/peer/ControllerCommissioningFlow.ts` | Wire up validation in `#deviceAttestation()`, CSR sig check in `#certificates()`, store DAC public key, add `onAttestationFailure` option |
| `packages/protocol/src/dcl/DclCertificateService.ts` | Add revocation fetching, revocation storage sub-context, `isRevoked()`, CD signer cert support |
| `packages/protocol/src/dcl/DclClient.ts` | Add revocation distribution point and CD signer cert endpoints |
| `packages/protocol/src/dcl/DclRestApiTypes.ts` | Add response types for new DCL endpoints |
| `packages/protocol/src/certificate/kinds/CertificationDeclaration.ts` | Add `parse()` function |
| `packages/protocol/src/certificate/DeviceCertification.ts` | Implement `#validateCertification()` for server-side vendorId/productId checks |
| `packages/node/src/behavior/system/commissioning/CommissioningClient.ts` | Forward `onAttestationFailure` option |

### Test Files

| File | Changes |
|------|---------|
| `packages/protocol/test/certificate/DeviceAttestationValidatorTest.ts` | New: unit tests for each validation step, failure cases with invalid certs |
| `packages/protocol/test/dcl/DclCertificateServiceTest.ts` | Extended: revocation set construction and lookup tests with mocked fetch |

## Follow-up Tasks

- **Lazy-load and auto-evict indices**: Both PAA certificate and revocation indices should load lazily on first access and evict from memory after ~10 minutes of inactivity. Investigate existing Cache class for reuse. (Task #6)

## References

- Matter Specification v1.4.2, Section 5.5 step 10 (Commissioning Flow - Device Attestation)
- Matter Specification v1.4.2, Section 6.2.3 (Device Attestation Procedure)
- Matter Specification v1.4.2, Section 6.2.3.1 (Attestation Information Validation)
- Matter Specification v1.4.2, Section 6.2.4 (Device Attestation Revocation)
- Matter Specification v1.4.2, Section 6.2.4.1 (Revocation Set Construction Algorithm)
- Matter Specification v1.4.2, Section 6.2.4.2 (Determining Revocation Status)
- Matter Specification v1.4.2, Section 11.23.9 (Revocation Distribution Points Schema)
