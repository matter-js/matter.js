/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatatypeOverride, DerObject, DerType } from "#codec/DerCodec.js";
import { InternalError } from "#MatterError.js";
import { hex } from "#util/String.js";

export namespace X520 {
    export const NON_WELL_DEFINED_DATE = new Date("9999-12-31 23:59:59Z");

    /**
     * Reverse lookup map from OID hex to field name for X.520 attributes
     */
    export const OID_TO_FIELD_MAP: { [oidHex: string]: string } = {
        // All others are registered dynamically during function creation
        "06092a864886f70d010901": "domainComponent",
    };

    /**
     * Generator function to create a specific ASN string field for a DN with the OID base 2.5.4.*.
     * The returned function takes the value of the string and returns the ASN.1 DER object. Optionally the string
     * can be encoded as a Printable String which adjusts the OID accordingly.
     * Also registers the OID in the reverse lookup map immediately.
     */
    const GenericString_X520 = (id: number, fieldName: string) => {
        const oidHex = `5504${hex.byte(id)}`;
        // Register in reverse lookup map immediately at function creation time
        if (OID_TO_FIELD_MAP[oidHex] !== undefined && OID_TO_FIELD_MAP[oidHex] !== fieldName) {
            throw new InternalError(
                `X520 GenericString_X520 mapping for OID ${id} already exists with a different field name: "${OID_TO_FIELD_MAP[oidHex]}" vs "${fieldName}"`,
            );
        }
        OID_TO_FIELD_MAP[oidHex] = fieldName;
        return (data: string, asPrintedString = false) => {
            let value: any = data;
            if (asPrintedString) {
                value = DatatypeOverride(DerType.PrintableString, value);
            }
            return [DerObject(oidHex, { value })];
        };
    };

    /** commonName = ASN.1 OID 2.5.4.3 */
    export const CommonName = GenericString_X520(3, "commonName");
    /** surName = ASN.1 OID 2.5.4.4 */
    export const SurName = GenericString_X520(4, "surName");
    /** serialNumber = ASN.1 OID 2.5.4.5 */
    export const SerialNumber = GenericString_X520(5, "serialNum");
    /** countryName = ASN.1 OID 2.5.4.6 */
    export const CountryName = GenericString_X520(6, "countryName");
    /** localityName = ASN.1 OID 2.5.4.7 */
    export const LocalityName = GenericString_X520(7, "localityName");
    /** stateOrProvinceName = ASN.1 OID 2.5.4.8 */
    export const StateOrProvinceName = GenericString_X520(8, "stateOrProvinceName");
    /** organizationName = ASN.1 OID 2.5.4.10 */
    export const OrganisationName = GenericString_X520(10, "orgName");
    /** organizationalUnitName = ASN.1 OID 2.5.4.11 */
    export const OrganizationalUnitName = GenericString_X520(11, "orgUnitName");
    /** title = ASN.1 OID 2.5.4.12 */
    export const Title = GenericString_X520(12, "title");
    /** name = ASN.1 OID 2.5.4.41 */
    export const Name = GenericString_X520(41, "name");
    /** givenName = ASN.1 OID 2.5.4.42 */
    export const GivenName = GenericString_X520(42, "givenName");
    /** initials = ASN.1 OID 2.5.4.43 */
    export const Initials = GenericString_X520(43, "initials");
    /** generationQualifier = ASN.1 OID 2.5.4.44 */
    export const GenerationQualifier = GenericString_X520(44, "genQualifier");
    /** dnQualifier = ASN.1 OID 2.5.4.46 */
    export const DnQualifier = GenericString_X520(46, "dnQualifier");
    /** pseudonym = ASN.1 OID 2.5.4.65 */
    export const Pseudonym = GenericString_X520(65, "pseudonym");
    /** domain-component = ASN.1 OID 0.9.2342.19200300.100.1.25, IA5String */
    export const DomainComponent = (value: string) => [
        DerObject("06092A864886F70D010901", { value: DatatypeOverride(DerType.IA5String, value) }),
    ];
}
