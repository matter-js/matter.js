/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, CertificateError, InternalError, UnexpectedDataError, X509, X520 } from "@matter/general";
import {
    CaseAuthenticatedTag,
    FabricId,
    NodeId,
    ObjectSchema,
    TlvAny,
    TlvEncodingOptions,
    TlvFields,
    TlvReader,
    TlvSchema,
    TlvTag,
    TlvTaggedListPreservingOrder,
    TlvType,
    TlvTypeLength,
    TlvWriter,
    TypeFromFields,
    ValidationDatatypeMismatchError,
    VendorId,
} from "@matter/types";
import {
    FabricId_Matter,
    FirmwareSigningId_Matter,
    IcacId_Matter,
    NocCat_Matter,
    NodeId_Matter,
    ProductId_Matter,
    RcacId_Matter,
    VendorId_Matter,
    VvsId_Matter,
} from "./definitions/asn.js";

/**
 * Thrown when a DER certificate, such as a DAC, PAI, PAA or VVSC, is well-formed but violates its X.509 profile, including a VendorID or ProductID in
 * the distinguished name that is malformed or repeated.
 *
 * @see {@link MatterSpecification.v161.Core} § 6.2.2.2
 * @see {@link MatterSpecification.v161.Core} § 6.2.2.3
 * @see {@link MatterSpecification.v161.Core} § 6.2.2.4
 */
export class CertificateProfileError extends CertificateError {}

/**
 * Extract a VendorID or ProductID encoded via the "fallback method" (Matter spec 6.2.2.2): the
 * prefix `Mvid:`/`Mpid:` followed by 4 uppercase hexadecimal characters, anywhere within a
 * `commonName`. Returns the leftmost correctly-encoded value, or `undefined` if the prefix is
 * absent. Throws if the prefix appears but no correctly-encoded value exists (spec 6.2.2.2.1).
 */
export function parseMatterFallbackVidPid(commonName: string, prefix: "Mvid:" | "Mpid:"): number | undefined {
    const match = commonName.match(new RegExp(`${prefix}([0-9A-F]{4})`));
    if (match !== null) {
        return parseInt(match[1], 16);
    }
    if (commonName.includes(prefix)) {
        throw new CertificateError(`commonName contains ${prefix} not followed by 4 uppercase hex digits`);
    }
    return undefined;
}

/**
 * A certificate subject or issuer as the ordered list of its relative distinguished names (RDNs).
 *
 * A decoded certificate offers two views of each DN:
 *
 * | View                                    | Holds                                                   | Used for     |
 * |-----------------------------------------|---------------------------------------------------------|--------------|
 * | object (`cert.subject`, `cert.issuer`)  | one property per attribute, the first value of a        | reading      |
 * |                                         | repeated standard attribute, all CATs in an array       |              |
 * | RDN list (`rdns` of a decoded DN)       | every RDN in encoded order, repeats included            | re-encoding  |
 *
 * Standard attributes such as commonName or organizationalUnitName may repeat, as the `Name` structure of X.509 allows.
 * Only the RDN list keeps all of them, and only the RDN list keeps each CAT at its position between other attributes,
 * so a re-encoded certificate matches the bytes its issuer signed, in TLV and in DER.
 *
 * A DER DN can re-encode differently.  The list is not complete.  Known cases are:
 *
 * - an attribute of a type the decoder does not know, which the decoder leaves out of the RDN list
 * - a VendorID or ProductID that was malformed and accepted as a profile violation, which is left out too
 * - an RDN of more than one attribute (a Matter certificate "SHALL be always a single DN attribute", § 6.5.6.1), which
 *   the decoder splits into one RDN per attribute
 * - a string type other than the one the encoder writes, such as a PrintableString VendorID or a domainComponent that
 *   is not an IA5String
 *
 * Signature verification of a DER certificate uses its original bytes, so only conversion to TLV is affected.
 *
 * A DN built in code has no RDN list and encodes from its properties in property order.
 *
 * A decoded DN is frozen, so changing one of its properties throws a `TypeError` instead of encoding a list that no
 * longer matches the properties.  To change a decoded DN, build a new object, for example `{ ...cert.subject, nodeId }`.
 * `rdns` is not enumerable, so such a copy has no RDN list and encodes from its properties.
 *
 * @see {@link MatterSpecification.v161.Core} § 6.5.6
 */
export namespace DistinguishedName {
    /** Attributes with a string value, named as in the object view.  The `Ps` variants are PrintableString. */
    export type StringAttribute =
        | "commonName"
        | "surName"
        | "serialNum"
        | "countryName"
        | "localityName"
        | "stateOrProvinceName"
        | "orgName"
        | "orgUnitName"
        | "title"
        | "name"
        | "givenName"
        | "initials"
        | "genQualifier"
        | "dnQualifier"
        | "pseudonym"
        | "domainComponent"
        | "commonNamePs"
        | "surNamePs"
        | "serialNumPs"
        | "countryNamePs"
        | "localityNamePs"
        | "stateOrProvinceNamePs"
        | "orgNamePs"
        | "orgUnitNamePs"
        | "titlePs"
        | "namePs"
        | "givenNamePs"
        | "initialsPs"
        | "genQualifierPs"
        | "dnQualifierPs"
        | "pseudonymPs";

    /** Matter-specific attributes with a 64-bit identifier value. */
    export type IdentifierAttribute = "firmwareSigningId" | "icacId" | "rcacId" | "vvsId";

    /**
     * One RDN.  `type` is the name of the attribute in the object view, except that each matter-noc-cat is its own
     * `caseAuthenticatedTag` entry.  `vendorId` and `productId` have no Matter-TLV encoding.
     */
    export type Rdn =
        | { type: StringAttribute; value: string }
        | { type: "nodeId"; value: NodeId }
        | { type: "fabricId"; value: FabricId }
        | { type: IdentifierAttribute; value: number | bigint }
        | { type: "caseAuthenticatedTag"; value: CaseAuthenticatedTag }
        | { type: "vendorId"; value: VendorId }
        | { type: "productId"; value: number };

    /** The RDN list a decoder sets on the DN it returns.  It is not enumerable. */
    export interface Decoded {
        readonly rdns?: readonly Rdn[];
    }

    /** The object view of a DN.  A decoded DN is frozen, so its properties are read-only. */
    export type View = { readonly [K in StringAttribute]?: string } & {
        readonly [K in IdentifierAttribute]?: number | bigint;
    } & {
        readonly nodeId?: NodeId;
        readonly fabricId?: FabricId;
        readonly caseAuthenticatedTags?: readonly CaseAuthenticatedTag[];
        readonly vendorId?: VendorId;
        readonly productId?: number;
    } & Decoded;

    /** The type of a decoded DN whose attributes are the fields of a TLV schema: read-only, arrays included. */
    export type Frozen<T> = {
        readonly [K in keyof T]: T[K] extends (infer U)[] | undefined
            ? undefined extends T[K]
                ? readonly U[] | undefined
                : readonly U[]
            : T[K];
    };

    /**
     * The RDN list of a DN that a decoder returned, or undefined for a DN built in code.  Use this
     * for a DN whose type does not declare {@link Decoded.rdns}, such as the subject of an attestation certificate.
     */
    export function rdnsOf(dn: Decoded): readonly Rdn[] | undefined {
        return dn.rdns;
    }

    /**
     * The number of RDNs in a DN: the length of its RDN list, or for a DN built in code one per property and one per
     * CAT.
     *
     * @see {@link MatterSpecification.v161.Core} § 6.5.6.3
     */
    export function rdnCount(dn: View) {
        const rdns = rdnsOf(dn);
        if (rdns !== undefined) {
            return rdns.length;
        }
        let count = 0;
        for (const value of Object.values(dn)) {
            if (value !== undefined) {
                count += Array.isArray(value) ? value.length : 1;
            }
        }
        return count;
    }
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] extends readonly (infer U)[] | undefined ? U[] | undefined : T[K] };

type VidPidAttribute = "vendorId" | "productId";

export interface DnDecodeOptions {
    /** Leave a malformed or repeated VendorID or ProductID undefined instead of throwing {@link CertificateProfileError}. */
    acceptMalformedVidPid?: boolean;

    /**
     * Read VendorID and ProductID from commonName values ("fallback method").  The DER decoder sets this when the DN
     * has no matter-oid-vid or matter-oid-pid attribute, counting a malformed one too.
     */
    vidPidFallback?: boolean;

    /**
     * VendorID or ProductID attributes that were malformed, accepted as a profile violation and left out of the RDN
     * list.  They read as undefined even if another attribute of the same type is well-formed.
     */
    malformed?: ReadonlySet<VidPidAttribute>;
}

/**
 * Build the frozen object view of a DN from its RDN list, with the list as `rdns`.  The TLV and the DER decoder both use
 * this, so these rules hold for either encoding:
 *
 * - A Matter-specific attribute other than matter-noc-cat occurs at most once (§ 6.5.6.3 for node, fabric, icac, rcac,
 *   vvs and noc-cat; § 6.2.2.3 and § 6.2.2.4 for VendorID and ProductID).  A repeated VendorID or ProductID throws
 *   {@link CertificateProfileError} unless `acceptMalformedVidPid` is set, any other repeat {@link CertificateError}.
 * - A standard attribute may repeat.  The object view holds its first value.
 * - With {@link DnDecodeOptions.vidPidFallback}, VendorID and ProductID come from the first commonName that carries
 *   a VendorID or ProductID; see {@link fallbackVidPid}.
 *
 * @see {@link MatterSpecification.v161.Core} § 6.2.2.2
 */
export function decodeDistinguishedName(
    rdns: readonly DistinguishedName.Rdn[],
    options: DnDecodeOptions = {},
): DistinguishedName.View {
    const { acceptMalformedVidPid = false, vidPidFallback = false } = options;
    const view: Mutable<DistinguishedName.View> = {};
    const unusable = new Set<VidPidAttribute>(options.malformed);
    const matterAttributes = new Set<DistinguishedName.Rdn["type"]>();

    const repeated = (type: DistinguishedName.Rdn["type"]) => {
        const message = `Distinguished name contains ${type} more than once`;
        if (type !== "vendorId" && type !== "productId") {
            throw new CertificateError(message);
        }
        if (!acceptMalformedVidPid) {
            throw new CertificateProfileError(message);
        }
        unusable.add(type);
    };

    for (const rdn of rdns) {
        if (rdn.type === "caseAuthenticatedTag") {
            (view.caseAuthenticatedTags ??= []).push(rdn.value);
            continue;
        }
        if (isMatterAttribute(rdn.type)) {
            if (matterAttributes.has(rdn.type)) {
                repeated(rdn.type);
                continue;
            }
            matterAttributes.add(rdn.type);
        }
        switch (rdn.type) {
            case "nodeId":
                view.nodeId = rdn.value;
                break;
            case "fabricId":
                view.fabricId = rdn.value;
                break;
            case "firmwareSigningId":
            case "icacId":
            case "rcacId":
            case "vvsId":
                view[rdn.type] = rdn.value;
                break;
            case "vendorId":
                view.vendorId = rdn.value;
                break;
            case "productId":
                view.productId = rdn.value;
                break;
            default:
                view[rdn.type] ??= rdn.value;
        }
    }

    if (vidPidFallback) {
        const { vendorId, productId } = fallbackVidPid(commonNamesOf(rdns));
        if (vendorId !== undefined) {
            view.vendorId = VendorId(vendorId, false);
        }
        if (productId !== undefined) {
            view.productId = productId;
        }
    }

    for (const type of unusable) {
        delete view[type];
    }

    // Not enumerable, so a copy made with spread is a DN built in code and encodes from its properties
    Object.defineProperty(view, "rdns", { value: Object.freeze([...rdns]) });
    if (view.caseAuthenticatedTags !== undefined) {
        Object.freeze(view.caseAuthenticatedTags);
    }
    return Object.freeze(view);
}

function isMatterAttribute(type: DistinguishedName.Rdn["type"]) {
    switch (type) {
        case "nodeId":
        case "fabricId":
        case "firmwareSigningId":
        case "icacId":
        case "rcacId":
        case "vvsId":
        case "vendorId":
        case "productId":
            return true;
    }
    return false;
}

/** Maximum number of bytes of a commonName that CHIP searches for `Mvid:` and `Mpid:` (`kMax_CommonNameAttr_Length`). */
const MAX_FALLBACK_COMMON_NAME_BYTES = 64;

function commonNamesOf(rdns: readonly { type: string; value: unknown }[]) {
    return rdns.flatMap(({ type, value }) => (type === "commonName" || type === "commonNamePs" ? [String(value)] : []));
}

/**
 * VendorID and ProductID from the first commonName that carries a VendorID or ProductID ("fallback method",
 * § 6.2.2.2).  Later commonNames are not read, and the first 64 bytes of a commonName are searched.
 *
 * The specification does not say how to read more than one commonName.  This follows the CHIP SDK,
 * `ExtractVIDPIDFromAttributeString` in `src/crypto/CHIPCryptoPAL.cpp`, which stops at the first commonName with a
 * value, so a VendorID and a ProductID in different commonNames do not combine.
 *
 * @throws CertificateError if a commonName read has a prefix without a correctly encoded value
 */
function fallbackVidPid(commonNames: readonly string[]): { vendorId?: number; productId?: number } {
    for (const commonName of commonNames) {
        const searched = Bytes.toString(
            Bytes.of(Bytes.fromString(commonName)).subarray(0, MAX_FALLBACK_COMMON_NAME_BYTES),
        );
        const vendorId = parseMatterFallbackVidPid(searched, "Mvid:");
        const productId = parseMatterFallbackVidPid(searched, "Mpid:");
        if (vendorId !== undefined || productId !== undefined) {
            return { vendorId, productId };
        }
    }
    return {};
}

/**
 * The RDN for an attribute named as in the object view, or undefined for a name that is not a DN attribute.  The value
 * is not checked: it comes from a TLV schema, from the DER decoder or from a DN the caller built.
 */
export function rdnOf(type: string, value: any): DistinguishedName.Rdn | undefined {
    switch (type) {
        case "commonName":
        case "surName":
        case "serialNum":
        case "countryName":
        case "localityName":
        case "stateOrProvinceName":
        case "orgName":
        case "orgUnitName":
        case "title":
        case "name":
        case "givenName":
        case "initials":
        case "genQualifier":
        case "dnQualifier":
        case "pseudonym":
        case "domainComponent":
        case "commonNamePs":
        case "surNamePs":
        case "serialNumPs":
        case "countryNamePs":
        case "localityNamePs":
        case "stateOrProvinceNamePs":
        case "orgNamePs":
        case "orgUnitNamePs":
        case "titlePs":
        case "namePs":
        case "givenNamePs":
        case "initialsPs":
        case "genQualifierPs":
        case "dnQualifierPs":
        case "pseudonymPs":
            return { type, value };
        case "firmwareSigningId":
        case "icacId":
        case "rcacId":
        case "vvsId":
            return { type, value };
        case "nodeId":
            return { type, value };
        case "fabricId":
            return { type, value };
        case "caseAuthenticatedTag":
            return { type, value };
        case "vendorId":
            return { type, value };
        case "productId":
            return { type, value };
    }
    return undefined;
}

/**
 * The RDN list a DN built in code encodes to: one RDN per property in property order and one per CAT.  A VendorID or
 * ProductID property is left out when a commonName carries a VendorID or ProductID ("fallback method", § 6.2.2.2), found by {@link fallbackVidPid}.
 */
function rdnsOfProperties(dn: DistinguishedName.View) {
    const { vendorId, productId } = fallbackVidPid(
        commonNamesOf(Object.entries(dn).map(([type, value]) => ({ type, value }))),
    );
    const usesFallbackVidPid = vendorId !== undefined || productId !== undefined;

    const rdns = new Array<DistinguishedName.Rdn>();
    for (const [name, value] of Object.entries(dn)) {
        if (value === undefined || (usesFallbackVidPid && (name === "vendorId" || name === "productId"))) {
            continue;
        }
        if (name === "caseAuthenticatedTags") {
            CaseAuthenticatedTag.validateNocTagList(value);
            for (const tag of value) {
                rdns.push({ type: "caseAuthenticatedTag", value: tag });
            }
            continue;
        }
        const rdn = rdnOf(name, value);
        if (rdn !== undefined) {
            rdns.push(rdn);
        }
    }
    return rdns;
}

/**
 * Convert a subject or issuer to the DER AST of an X.509 Name, one SET per RDN.  A decoded DN encodes from its RDN
 * list, a DN built in code from its properties.
 */
export function distinguishedNameToAsn1(dn: DistinguishedName.View): X509.DistinguishedName {
    const asn: X509.DistinguishedName = {};
    (dn.rdns ?? rdnsOfProperties(dn)).forEach((rdn, index) => {
        asn[`rdn${index}`] = rdnToAsn1(rdn);
    });
    return asn;
}

function rdnToAsn1(rdn: DistinguishedName.Rdn) {
    switch (rdn.type) {
        case "commonName":
            return X520.CommonName(rdn.value);
        case "surName":
            return X520.SurName(rdn.value);
        case "serialNum":
            return X520.SerialNumber(rdn.value);
        case "countryName":
            return X520.CountryName(rdn.value);
        case "localityName":
            return X520.LocalityName(rdn.value);
        case "stateOrProvinceName":
            return X520.StateOrProvinceName(rdn.value);
        case "orgName":
            return X520.OrganisationName(rdn.value);
        case "orgUnitName":
            return X520.OrganizationalUnitName(rdn.value);
        case "title":
            return X520.Title(rdn.value);
        case "name":
            return X520.Name(rdn.value);
        case "givenName":
            return X520.GivenName(rdn.value);
        case "initials":
            return X520.Initials(rdn.value);
        case "genQualifier":
            return X520.GenerationQualifier(rdn.value);
        case "dnQualifier":
            return X520.DnQualifier(rdn.value);
        case "pseudonym":
            return X520.Pseudonym(rdn.value);
        case "domainComponent":
            return X520.DomainComponent(rdn.value);
        case "commonNamePs":
            return X520.CommonName(rdn.value, true);
        case "surNamePs":
            return X520.SurName(rdn.value, true);
        case "serialNumPs":
            return X520.SerialNumber(rdn.value, true);
        case "countryNamePs":
            return X520.CountryName(rdn.value, true);
        case "localityNamePs":
            return X520.LocalityName(rdn.value, true);
        case "stateOrProvinceNamePs":
            return X520.StateOrProvinceName(rdn.value, true);
        case "orgNamePs":
            return X520.OrganisationName(rdn.value, true);
        case "orgUnitNamePs":
            return X520.OrganizationalUnitName(rdn.value, true);
        case "titlePs":
            return X520.Title(rdn.value, true);
        case "namePs":
            return X520.Name(rdn.value, true);
        case "givenNamePs":
            return X520.GivenName(rdn.value, true);
        case "initialsPs":
            return X520.Initials(rdn.value, true);
        case "genQualifierPs":
            return X520.GenerationQualifier(rdn.value, true);
        case "dnQualifierPs":
            return X520.DnQualifier(rdn.value, true);
        case "pseudonymPs":
            return X520.Pseudonym(rdn.value, true);
        case "nodeId":
            return NodeId_Matter(rdn.value);
        case "fabricId":
            return FabricId_Matter(rdn.value);
        case "firmwareSigningId":
            return FirmwareSigningId_Matter(rdn.value);
        case "icacId":
            return IcacId_Matter(rdn.value);
        case "rcacId":
            return RcacId_Matter(rdn.value);
        case "vvsId":
            return VvsId_Matter(rdn.value);
        case "caseAuthenticatedTag":
            return NocCat_Matter(rdn.value);
        case "vendorId":
            return VendorId_Matter(rdn.value);
        case "productId":
            return ProductId_Matter(rdn.value);
    }
}

/**
 * TLV schema of a certificate subject or issuer, a TLV list of DN attributes (§ 6.5.6).
 *
 * The decoded value is the frozen object view with the RDN list as `rdns`.  Encoding
 * writes the RDN list when there is one and otherwise the properties in property order.  Validation checks the object
 * view against `fields`, so mandatory attributes and the maximum number of CATs are enforced as for a tagged list.
 */
export class DistinguishedNameSchema<F extends TlvFields> extends TlvSchema<
    DistinguishedName.Frozen<TypeFromFields<F>> & DistinguishedName.Decoded
> {
    readonly #fields: F;
    readonly #properties: ObjectSchema<TlvFields>;
    readonly #nameById = new Map<number, string>();

    constructor(fields: F) {
        super();
        this.#fields = fields;
        this.#properties = TlvTaggedListPreservingOrder(fields);
        for (const name in fields) {
            this.#nameById.set(fields[name].id, name);
        }
    }

    override validate(value: DistinguishedName.Frozen<TypeFromFields<F>> & DistinguishedName.Decoded) {
        this.#properties.validate(value);
    }

    override encodeTlvInternal(
        writer: TlvWriter,
        value: DistinguishedName.Frozen<TypeFromFields<F>> & DistinguishedName.Decoded,
        tag?: TlvTag,
        options?: TlvEncodingOptions,
    ) {
        const rdns = value.rdns;
        if (rdns === undefined) {
            this.#properties.encodeTlvInternal(writer, value, tag, options);
            return;
        }
        writer.writeTag({ type: TlvType.List }, tag);
        for (const { type, value } of rdns) {
            const name = type === "caseAuthenticatedTag" ? "caseAuthenticatedTags" : type;
            if (!Object.hasOwn(this.#fields, name)) {
                throw new ValidationDatatypeMismatchError(`Field "${name}" is not defined in the TLV DN schema.`, name);
            }
            const { id, schema } = this.#fields[name];
            schema.encodeTlvInternal(writer, value, { id }, options);
        }
        writer.writeTag({ type: TlvType.EndOfContainer });
    }

    override decodeTlvInternalValue(
        reader: TlvReader,
        typeLength: TlvTypeLength,
    ): DistinguishedName.Frozen<TypeFromFields<F>> & DistinguishedName.Decoded {
        if (typeLength.type !== TlvType.List) {
            throw new UnexpectedDataError(`Unexpected type ${typeLength.type} (expected ${TlvType.List}).`);
        }
        const rdns = new Array<DistinguishedName.Rdn>();
        while (true) {
            const { tag: { profile, id } = {}, typeLength: elementTypeLength } = reader.readTagType();
            if (elementTypeLength.type === TlvType.EndOfContainer) {
                break;
            }
            if (profile !== undefined) {
                throw new UnexpectedDataError("Distinguished name element tags should be context-specific.");
            }
            if (id === undefined) {
                throw new UnexpectedDataError("Distinguished name element tags should have an id.");
            }
            const name = this.#nameById.get(id);
            if (name === undefined) {
                TlvAny.decodeTlvInternalValue(reader, elementTypeLength);
                continue;
            }
            const value = this.#fields[name].schema.decodeTlvInternalValue(reader, elementTypeLength);
            const rdn = rdnOf(name === "caseAuthenticatedTags" ? "caseAuthenticatedTag" : name, value);
            if (rdn === undefined) {
                throw new InternalError(`TLV DN field ${name} is not a DN attribute`);
            }
            rdns.push(rdn);
        }
        const view = decodeDistinguishedName(rdns);
        this.#assertFields(view);
        return view;
    }

    /** Validates during decode too, even with `decode(bytes, false)`, because the view is built without the field types. */
    #assertFields(
        view: DistinguishedName.View,
    ): asserts view is DistinguishedName.View & DistinguishedName.Frozen<TypeFromFields<F>> {
        this.#properties.validate(view);
    }
}

/** TLV schema of a certificate subject or issuer, see {@link DistinguishedNameSchema}. */
export const TlvDistinguishedName = <F extends TlvFields>(fields: F) => new DistinguishedNameSchema(fields);
