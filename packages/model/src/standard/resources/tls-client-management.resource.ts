/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "TlsClientManagement", pics: "TLSCLIENT", xref: "core§14.5",

        details: "This Cluster is used to provision TLS Endpoints with enough information to facilitate subsequent " +
            "connection." +
            "\n" +
            "Commands in this cluster uniformly use the Large Message qualifier, even when the command doesn’t " +
            "require it, to reduce the testing matrix." +
            "\n" +
            "This cluster shall be present on the root node endpoint when required by a device type, may be " +
            "present on that endpoint otherwise, and shall NOT be present on any other Endpoint of any Node.",

        children: [
            {
                tag: "attribute", name: "MaxProvisioned", xref: "core§14.5.6.1",
                details: "Indicates the maximum number of per fabric TLSEndpoints that can be installed on this Node."
            },
            {
                tag: "attribute", name: "ProvisionedEndpoints", xref: "core§14.5.6.2",
                details: "Indicates a list of currently provisioned TLS Endpoints on this Node. The maximum length of this " +
                    "list when read will be the value of MaxProvisioned."
            },

            {
                tag: "command", name: "ProvisionEndpoint", xref: "core§14.5.7.1",
                details: "This command is used to provision a TLS Endpoint for the provided Hostname / Port combination.",

                children: [
                    {
                        tag: "field", name: "Hostname", xref: "core§14.5.7.1.1",
                        details: "This field shall represent a TLS Hostname."
                    },
                    {
                        tag: "field", name: "Port", xref: "core§14.5.7.1.2",
                        details: "This field shall represent a TLS Port Number."
                    },
                    {
                        tag: "field", name: "Caid", xref: "core§14.5.7.1.3",
                        details: "This field shall be the TLSCAID used to associate the TLSRCAC with this endpoint."
                    },
                    {
                        tag: "field", name: "Ccdid", xref: "core§14.5.7.1.4",
                        details: "This field shall be the TLSCCDID used to associate the Client Certificate Details with this " +
                            "endpoint. A NULL value means no client certificate is associated."
                    },

                    {
                        tag: "field", name: "EndpointId", xref: "core§14.5.7.1.5",

                        details: "This field shall represent the unique TLS Endpoint. A NULL value causes a new endpoint to be created " +
                            "and a non-NULL value allows for updating an existing endpoint." +
                            "\n" +
                            "### Effect on Receipt" +
                            "\n" +
                            "The following process shall be followed when the server receives this command:" +
                            "\n" +
                            "  - If the UTCTime attribute of the Time Synchronization cluster is null:" +
                            "\n" +
                            "    - Fail the command with the cluster-specific status code of InvalidTime, and end processing with " +
                            "no other side effects." +
                            "\n" +
                            "  - If there is no entry for the passed in CAID in the ProvisionedRootCertificates list:" +
                            "\n" +
                            "    - Fail the command with the cluster-specific status code of RootCertificateNotFound, and end " +
                            "processing with no other side effects." +
                            "\n" +
                            "  - If the associated fabric for that matching entry, does not equal the accessing fabric:" +
                            "\n" +
                            "    - Fail the command with the cluster-specific status code of RootCertificateNotFound, and end " +
                            "processing with no other side effects." +
                            "\n" +
                            "  - If the passed in CCDID is not NULL, and the associated fabric for the passed in CCDID entry in " +
                            "the ProvisionedClientCertificates list does not equal the accessing fabric:" +
                            "\n" +
                            "    - Fail the command with the cluster-specific status code of ClientCertificateNotFound, and end " +
                            "processing with no other side effects." +
                            "\n" +
                            "  - If the passed in EndpointID is NULL:" +
                            "\n" +
                            "    - If the length of ProvisionedEndpoints is equal to the MaxProvisioned value:" +
                            "\n" +
                            "      - Fail the command with the status code RESOURCE_EXHAUSTED, and end processing with no other " +
                            "side effects." +
                            "\n" +
                            "    - If there is an existing entry for the Hostname / Port combination in the ProvisionedEndpoints " +
                            "list, where the associated fabric equals the accessing fabric:" +
                            "\n" +
                            "      - Fail the command with the cluster-specific status code of EndpointAlreadyInstalled, and end " +
                            "processing with no other side effects." +
                            "\n" +
                            "    - Generate a new TLSEndpointID" +
                            "\n" +
                            "    - Create and populate a TLSEndpointStruct with the passed in values, associated with the " +
                            "accessing fabric" +
                            "\n" +
                            "    - Set the EndpointID field to the newly generated TLSEndpointID." +
                            "\n" +
                            "    - Set the ReferenceCount field to 0." +
                            "\n" +
                            "    - Add the resulting TLSEndpointStruct to the ProvisionedEndpoints list and store the results." +
                            "\n" +
                            "  - Else if the passed in EndpointID is not NULL:" +
                            "\n" +
                            "    - If there is no entry found for the passed in EndpointID in the ProvisionedEndpoints list:" +
                            "\n" +
                            "      - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                            "effects." +
                            "\n" +
                            "    - If the associated fabric for that matching entry does not equal the accessing fabric:" +
                            "\n" +
                            "      - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                            "effects." +
                            "\n" +
                            "    - Update the fields of that matching entry with the passed in values and store the results." +
                            "\n" +
                            "  - Return the TLSEndpointID as the EndpointID field in the corresponding ProvisionEndpointResponse " +
                            "command." +
                            "\n" +
                            "General Notes When the Node is making a TLS connection to this TLS Endpoint, the TLSRCAC represented " +
                            "by the CAID shall be used to authenticate the TLS Endpoint." +
                            "\n" +
                            "When the Node is making a TLS connection that has a non-NULL CCDID, the Client Certificate Details " +
                            "represented by the CCDID shall be used during client authentication in the TLS Handshake. In " +
                            "addition, a Node shall fail to connect to the TLS server, if that TLS Server did not require TLS " +
                            "Client Authentication for the connection, when a CCDID is provisioned on a TLS Endpoint."
                    }
                ]
            },

            {
                tag: "command", name: "ProvisionEndpointResponse", xref: "core§14.5.7.2",
                details: "This command is used to report the result of the ProvisionEndpoint command.",
                children: [{
                    tag: "field", name: "EndpointId", xref: "core§14.5.7.2.1",
                    details: "This field shall be the TLS Endpoint ID created or updated by the ProvisionEndpoint command."
                }]
            },

            {
                tag: "command", name: "FindEndpoint", xref: "core§14.5.7.3",
                details: "This command is used to find a TLS Endpoint by its ID." +
                    "\n" +
                    "This command shall return the TLSEndpointStruct for the passed in EndpointID.",

                children: [{
                    tag: "field", name: "EndpointId", xref: "core§14.5.7.3.1",

                    details: "This field shall be the TLS Endpoint ID being looked up." +
                        "\n" +
                        "### Effect on Receipt" +
                        "\n" +
                        "The following process shall be followed when the server receives this command:" +
                        "\n" +
                        "  - If the ProvisionedEndpoints list is empty:" +
                        "\n" +
                        "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "  - If there is no matching entry found for the passed in EndpointID in the ProvisionedEndpoints " +
                        "list:" +
                        "\n" +
                        "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "  - If the associated fabric for that matching entry, does not equal the accessing fabric:" +
                        "\n" +
                        "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                        "effects." +
                        "\n" +
                        "  - Return that entry as the Endpoint field in the corresponding FindEndpointResponse command."
                }]
            },

            {
                tag: "command", name: "FindEndpointResponse", xref: "core§14.5.7.4",
                details: "This command is used to report the result of the FindEndpoint command.",
                children: [{
                    tag: "field", name: "Endpoint", xref: "core§14.5.7.4.1",
                    details: "The field shall be a TLSEndpointStruct containing the requested entry."
                }]
            },

            {
                tag: "command", name: "RemoveEndpoint", xref: "core§14.5.7.5",
                details: "This command is used to remove a TLS Endpoint by its ID." +
                    "\n" +
                    "This command shall be generated to request the Node remove any TLS Endpoint.",

                children: [
                    {
                        tag: "field", name: "EndpointId", xref: "core§14.5.7.5.1",

                        details: "This field shall represent the unique TLSEndpointID of the TLS Endpoint to remove." +
                            "\n" +
                            "### Effect on Receipt" +
                            "\n" +
                            "The following process shall be followed when the server receives this command:" +
                            "\n" +
                            "  - If the ProvisionedEndpoints list is empty:" +
                            "\n" +
                            "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                            "effects." +
                            "\n" +
                            "  - If there is no matching entry found for the passed in EndpointID in the ProvisionedEndpoints " +
                            "list:" +
                            "\n" +
                            "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                            "effects." +
                            "\n" +
                            "  - If the associated fabric for that matching entry, does not equal the accessing fabric:" +
                            "\n" +
                            "    - Fail the command with the status code NOT_FOUND, and end processing with no other side " +
                            "effects." +
                            "\n" +
                            "  - If the ReferenceCount of that matching entry is greater than 0:" +
                            "\n" +
                            "    - Fail the command with the status code INVALID_IN_STATE, and end processing with no other side " +
                            "effects." +
                            "\n" +
                            "  - Remove that entry from the ProvisionedEndpoints list and store the results." +
                            "\n" +
                            "Appendix A: Tag-length-value (TLV) Encoding Format" +
                            "\n" +
                            "### A.1. Scope & Purpose" +
                            "\n" +
                            "The Matter TLV (Tag-Length-Value) format is a generalized encoding method for simple structured " +
                            "data, used throughout this specification." +
                            "\n" +
                            "Values in the Matter TLV format are encoded as TLV elements. Each TLV element has a type. Element " +
                            "types fall into two categories: primitive types and container types. Primitive types convey " +
                            "fundamental data values such as integers and strings. Container types convey collections of elements " +
                            "that themselves are either primitives or containers. The Matter TLV format supports three different " +
                            "container types: structures, arrays and lists." +
                            "\n" +
                            "All valid TLV encodings consist of a single top-level element. This value can be either a primitive " +
                            "type or a container type." +
                            "\n" +
                            "### A.2. Tags" +
                            "\n" +
                            "A TLV element includes an optional numeric tag that identifies its purpose. A TLV element without a " +
                            "tag is called an anonymous element. For elements with tags, two categories of tags are defined: " +
                            "profile-specific and context-specific." +
                            "\n" +
                            "### A.2.1. Profile-Specific Tags" +
                            "\n" +
                            "Profile-specific tags identify elements globally. A profile-specific tag is a 64-bit number composed " +
                            "of the following fields:" +
                            "\n" +
                            "  - 16-bit Vendor ID" +
                            "\n" +
                            "  - 16-bit profile number" +
                            "\n" +
                            "  - 32-bit tag number" +
                            "\n" +
                            "Profile-specific tags are defined either by Matter or by vendors. Additionally the Matter Common " +
                            "Profile includes a set of predefined profile-specific tags that can be used across organizations." +
                            "\n" +
                            "### A.2.2. Context-Specific Tags" +
                            "\n" +
                            "Context-specific tags identify elements within the context of a containing structure element. A " +
                            "context-specific tag consists of a single 8-bit tag number. The meaning of a context-specific tag " +
                            "derives from the structure it resides in, implying that the same tag number may have different " +
                            "meanings in the context of different structures. Effectively, the interpretation of a " +
                            "context-specific tag depends on the tag attached to the containing element. Because structures " +
                            "themselves can be assigned context-specific tags, the interpretation of a context-specific tag may " +
                            "ultimately depend on a nested chain of such tags." +
                            "\n" +
                            "Context-specific tags can only be assigned to elements that are immediately within a structure. This " +
                            "implies that an element with a context-specific tag cannot appear as the outermost element of a TLV " +
                            "encoding." +
                            "\n" +
                            "### A.2.3. Anonymous Tags" +
                            "\n" +
                            "A special \"anonymous tag\" is used to denote TLV elements that lack a tag value. Such a TLV element " +
                            "is referred to as an anonymous element." +
                            "\n" +
                            "### A.2.4. Canonical Ordering of Tags" +
                            "\n" +
                            "Where a distinguished ordering of tags is required (e.g. for the purposes of generating a hash or " +
                            "cryptographic signature of elements within a structure), the following ordering rules shall be used:" +
                            "\n" +
                            "  - Anonymous tags shall be ordered before all other tags." +
                            "\n" +
                            "  - Context-specific tags shall be ordered before profile-specific tags." +
                            "\n" +
                            "  - Context-specific tags with numerically lower tag values shall be ordered before those with " +
                            "higher tag values." +
                            "\n" +
                            "  - Profile-specific tags with numerically lower Vendor IDs shall be ordered before those with " +
                            "higher Vendor IDs." +
                            "\n" +
                            "  - Profile-specific tags with the same Vendor ID, but numerically lower profile numbers shall be " +
                            "ordered before those with higher profile numbers." +
                            "\n" +
                            "  - Profile-specific tags with the same Vendor ID and the same profile numbers but numerically lower " +
                            "tag numbers shall be ordered before those with higher tag numbers." +
                            "\n" +
                            "The ordering rules shall apply to elements at the same level within a container." +
                            "\n" +
                            "### A.3. Lengths" +
                            "\n" +
                            "Depending on its type, a TLV element may contain a length field that gives the length, in octets, of " +
                            "the element’s value field. A length field is only present for string types (character and octet " +
                            "strings). Other element types either have a predetermined length or are encoded with a marker that " +
                            "identifies their end." +
                            "\n" +
                            "### A.4. Primitive Types" +
                            "\n" +
                            "The Matter TLV format supports the following primitive types:" +
                            "\n" +
                            "  - Signed integers" +
                            "\n" +
                            "  - Unsigned integers" +
                            "\n" +
                            "  - UTF-8 Strings" +
                            "\n" +
                            "  - Octet Strings" +
                            "\n" +
                            "  - Single or double-precision floating point numbers (following IEEE 754-2019)" +
                            "\n" +
                            "  - Booleans" +
                            "\n" +
                            "  - Nulls" +
                            "\n" +
                            "Of the primitive types, integers, floating point numbers, booleans and nulls have a predetermined " +
                            "length specified by their type. Octet strings and UTF-8 strings include a length field that gives " +
                            "their lengths in octets." +
                            "\n" +
                            "### A.5. Container Types" +
                            "\n" +
                            "The Matter TLV format supports the following container types:" +
                            "\n" +
                            "  - Structures" +
                            "\n" +
                            "  - Arrays" +
                            "\n" +
                            "  - Lists" +
                            "\n" +
                            "Each of the container types is a form of element collection that can contain primitive types and/or " +
                            "other container types. The elements appearing immediately within a container type are called its " +
                            "members. A container type can contain any number of member elements, including none. Container types " +
                            "can be nested to any depth and in any combination. The end of a container type is denoted by a " +
                            "special element called the ‘end-of-container’ element. Although encoded as a member, conceptually " +
                            "the end-of-container element is not included in the members of the containing type." +
                            "\n" +
                            "### A.5.1. Structures" +
                            "\n" +
                            "A structure is a collection of member elements that each have a distinct meaning. All member " +
                            "elements within a structure shall have a unique tag as compared to the other members of the " +
                            "structure. Member elements without tags (anonymous elements) are not allowed in structures. The " +
                            "encoded ordering of members in a structure may or may not be important depending on the intent of " +
                            "the sender or the expectations of the receiver. For example, in some situations, senders and " +
                            "receivers may agree on a particular ordering of elements to make encoding and decoding easier." +
                            "\n" +
                            "Where a distinguished ordering of members is required (for example, for the purposes of generating a " +
                            "hash or cryptographic signature of the structure), the members of the structure shall be encoded as " +
                            "specified in Section A.2.4, “Canonical Ordering of Tags”." +
                            "\n" +
                            "### A.5.2. Arrays" +
                            "\n" +
                            "An array is an ordered collection of member elements that either do not have distinct meanings, or " +
                            "whose meanings are implied by their encoded positions in the array. An array can contain any type of " +
                            "element, including other arrays. All member elements of an array shall be anonymous elements – that " +
                            "is, they shall be encoded with an anonymous tag." +
                            "\n" +
                            "### A.5.3. Lists" +
                            "\n" +
                            "A list is an ordered collection of member elements, each of which may be encoded with a tag. The " +
                            "meanings of member elements in a list are denoted by their position within the list in conjunction " +
                            "with any associated tag value they may have." +
                            "\n" +
                            "A list can contain any type of element, including other lists. The members of a list may be encoded " +
                            "with any form of tag, including an anonymous tag. The tags within a list do not need to be unique " +
                            "with respect to other members of the list." +
                            "\n" +
                            "### A.6. Element Encoding" +
                            "\n" +
                            "A TLV element is encoded a single control octet, followed by a sequence of tag, length and value " +
                            "octets. Depending on the nature of the element, any of the tag, length or value fields may be " +
                            "omitted." +
                            "\n" +
                            "### A.7. Control Octet Encoding" +
                            "\n" +
                            "The control octet specifies the type of a TLV element and how its tag, length and value fields are " +
                            "encoded. The control octet consists of two subfields: an element type field which occupies the lower " +
                            "5 bits, and a tag control field which occupies the upper 3 bits." +
                            "\n" +
                            "### A.7.1. Element Type Field" +
                            "\n" +
                            "The element type field encodes the element’s type as well as how the corresponding length and value " +
                            "fields are encoded. In the case of Booleans and the Null value, the element type field also encodes " +
                            "the value itself." +
                            "\n" +
                            "For both signed and unsigned integer types the bottom two bits of the element type field signal the " +
                            "width of the corresponding field as follows:" +
                            "\n" +
                            "  - 00 — 1 octet" +
                            "\n" +
                            "  - 01 — 2 octets" +
                            "\n" +
                            "  - 10 — 4 octets" +
                            "\n" +
                            "  - 11 — 8 octets" +
                            "\n" +
                            "For UTF-8 and octet string types the bottom two bits of the element type field signal the width of " +
                            "the length field as follows:" +
                            "\n" +
                            "  - 00 — 1 octet" +
                            "\n" +
                            "  - 01 — 2 octets" +
                            "\n" +
                            "  - 10 — 4 octets" +
                            "\n" +
                            "  - 11 — 8 octets" +
                            "\n" +
                            "For end of container element type the tag control bits are set to 0. Any other combination of the " +
                            "tag control bits for this element type only is reserved. See Section A.10, “End of Container " +
                            "Encoding”." +
                            "\n" +
                            "### A.7.2. Tag Control Field" +
                            "\n" +
                            "The tag control field identifies the form of tag assigned to the element (including none) as well as " +
                            "the encoding of the tag octets." +
                            "\n" +
                            "### A.8. Tag Encoding" +
                            "\n" +
                            "Tags are encoded in 0, 1, 2, 4, 6 or 8 octet widths as specified by the tag control field. Tags " +
                            "consist of up to three numeric fields: a Vendor ID field, a profile number field, and a tag number " +
                            "field. All fields are encoded in little-endian order. The tag fields are ordered as follows:" +
                            "\n" +
                            "### A.8.1. Fully-Qualified Tag Form" +
                            "\n" +
                            "A profile-specific tag can be encoded in fully-qualified tag form, where the encoding includes all " +
                            "three tag components (Vendor ID, profile number and tag number). Two variants of this form are " +
                            "supported, one with a 16-bit tag number and one with a 32-bit tag number. The 16-bit variant shall " +
                            "be used with tag numbers < 65536, while the 32-bit variant shall be used with tag numbers >= 65536." +
                            "\n" +
                            "### A.8.2. Implicit Profile Tag Form" +
                            "\n" +
                            "A profile-specific tag can also be encoded in implicit profile tag form, where the encoding includes " +
                            "only the tag number, and the Vendor ID and profile number are inferred from the protocol context in " +
                            "which the TLV encoding is communicated. This form also has two variants based on the magnitude of " +
                            "the tag number." +
                            "\n" +
                            "### A.8.3. Common Profile Tag Form" +
                            "\n" +
                            "A special encoding exists for profile-specific tags that are defined by the Matter Common Profile. " +
                            "These are encoded in the same manner as implicit profile tags except that they are identified as " +
                            "common profile tags, rather than implicit profile tags in the tag control field." +
                            "\n" +
                            "### A.8.4. Context-Specific Tag Form" +
                            "\n" +
                            "Context-specific tags are encoded as a single octet conveying the tag number." +
                            "\n" +
                            "### A.8.5. Anonymous Tag Form" +
                            "\n" +
                            "Anonymous elements do not encode any tag octets." +
                            "\n" +
                            "### A.9. Length Encoding" +
                            "\n" +
                            "Length fields are encoded in 0, 1, 2, 4 or 8 octet widths, as specified by the element type field. " +
                            "Length fields of more than one octet are encoded in little-endian order. The choice of width for the " +
                            "length field is up to the discretion of the sender, implying that a sender can choose to send more " +
                            "length octets than strictly necessary to encode the value." +
                            "\n" +
                            "### A.10. End of Container Encoding" +
                            "\n" +
                            "The end of a container type is marked with a special element called the end-of-container element. " +
                            "The end-of-container element is encoded as a single control octet with the value 18h. The tag " +
                            "control bits within the control octet shall be set to zero, implying that end-of-container element " +
                            "can never have a tag." +
                            "\n" +
                            "### A.11. Value Encodings" +
                            "\n" +
                            "### A.11.1. Integers" +
                            "\n" +
                            "An integer element is encoded as follows:" +
                            "\n" +
                            "The number of octets in the value field is indicated by the element type field within the control " +
                            "octet. The choice of value octet count is at the sender’s discretion, implying that a sender is free " +
                            "to send more octets than strictly necessary to encode the value. Within the value octets, the " +
                            "integer value is encoded in little-endian format (two’s complement format for signed integers)." +
                            "\n" +
                            "### A.11.2. UTF-8 and Octet Strings" +
                            "\n" +
                            "UTF-8 and octet strings are encoded as follows:" +
                            "\n" +
                            "The length field of a UTF-8 or octet string encodes the number of octets (not characters) present in " +
                            "the value field. The number of octets in the length field is implied by the type specified in the " +
                            "element type field (within the control octet)." +
                            "\n" +
                            "For octet strings, the value can be any arbitrary sequence of octets. For UTF-8 strings, the value " +
                            "octets shall encode a valid UTF-8 character (code points) sequence. Senders shall NOT include a " +
                            "terminating null character to mark the end of a string." +
                            "\n" +
                            "### A.11.3. Booleans" +
                            "\n" +
                            "Boolean elements are encoded as follows:" +
                            "\n" +
                            "The value of a Boolean element (true or false) is implied by the type indicated in the element type " +
                            "field." +
                            "\n" +
                            "### A.11.4. Arrays, Structures and Lists" +
                            "\n" +
                            "Array, structure and list elements are encoded as follows:" +
                            "\n" +
                            "The value field of an array/structure/list element is a sequence of encoded TLV elements that " +
                            "constitute the members of the element, followed by an end-of-container element. The end-of-container " +
                            "element shall always be present, even in cases where the end of the array/structure/list element " +
                            "could be inferred by other means (e.g. the length of the packet containing the TLV encoding)." +
                            "\n" +
                            "### A.11.5. Floating Point Numbers" +
                            "\n" +
                            "A floating point number is encoded as follows:" +
                            "\n" +
                            "The value field of a floating point element contains an IEEE 754-2019 single or double precision " +
                            "floating point number encoded in little-endian format (specifically, the reverse of the order " +
                            "described in External Data Representation, RFC 4506). The choice of precision is implied by the type " +
                            "specified in the element type field (within the control octet). The sender is free to choose either " +
                            "precision at their discretion." +
                            "\n" +
                            "### A.11.6. Nulls" +
                            "\n" +
                            "A Null value is encoded as follows:" +
                            "\n" +
                            "### A.12. TLV Encoding Examples" +
                            "\n" +
                            "In order to better ground the TLV concepts, this subsection provides a set of sample encodings. In " +
                            "the tables below, type and values column uses a decimal representation for all number whereas the " +
                            "encoding is represented with hexadecimal numbers." +
                            "\n" +
                            "Table 125, “Sample encoding of primitive types” shows sample encodings for primitive types. All " +
                            "examples in the table below are encoded as anonymous elements." +
                            "\n" +
                            "Table 126, “Sample encoding of containers” shows sample encodings for container types. In each of " +
                            "the examples below, the outermost container is encoded as an anonymous element." +
                            "\n" +
                            "Table 127, “Sample encoding of different tag types” shows sample encoding of a value with different " +
                            "associated tags, using Vendor ID = : 65522 (0xFFF2), one of the Vendor IDs allocated for testing " +
                            "purposes." +
                            "\n" +
                            "Appendix B: Tag-length-value (TLV) Schema Definitions" +
                            "\n" +
                            "### B.1. Introduction" +
                            "\n" +
                            "A TLV Schema provides a simple textual description of the structure of data encoded in the Matter " +
                            "TLV format. A single TLV Schema may define the structure of multiple different TLV-encoded payloads. " +
                            "This section describes the syntax one can use to define a TLV Schema." +
                            "\n" +
                            "### B.1.1. Basic Structure" +
                            "\n" +
                            "A TLV Schema takes the form of a series of definitions. Each definition describes some construct, " +
                            "such as a data type. Each definition has an associated human readable name separated from the " +
                            "definition with a ⇒ symbol. As a mnemonic device, it is useful to read the ⇒ symbol as “is a”. For " +
                            "example, the following definition defines a data type that may be used to represent a sensor sample:" +
                            "\n" +
                            "This example would be read as \"sensor-sample is a structure containing a timestamp and value\"." +
                            "\n" +
                            "A TLV Schema may contain multiple definitions. The order of definitions within a TLV Schema is " +
                            "unimportant." +
                            "\n" +
                            "### B.1.2. Keywords" +
                            "\n" +
                            "TLV Schemas employ various keywords when describing a construct. These keywords (e.g. STRUCTURE, " +
                            "SIGNED INTEGER, and range) are an inherent part of the schema language. Keywords in TLV Schemas are " +
                            "always case-insensitive. However, by convention, keywords associated with types and other high-level " +
                            "constructs are capitalized for emphasis in text-only contexts." +
                            "\n" +
                            "### B.1.3. Naming" +
                            "\n" +
                            "Each definition in a TLV Schema assigns a human-readable name to the construct being defined. This " +
                            "name serves both as a descriptive title as well as a means to refer to the construct from elsewhere " +
                            "in the schema." +
                            "\n" +
                            "Names in TLV Schemas are limited to ASCII alphanumeric characters, plus dash (-) and underscore (_). " +
                            "Additionally, all names shall begin with either an alphabetic character or an underscore. In " +
                            "general, any name conforming to these rules may be used, as long as it does not collide with a " +
                            "keyword used by the schema language." +
                            "\n" +
                            "### B.1.4. Namespaces" +
                            "\n" +
                            "The name assigned to a schema construct shall be unique relative to all other named constructs in " +
                            "the same scope. To facilitate this, TLV Schemas support a namespacing mechanism similar to that " +
                            "provided in languages like C++." +
                            "\n" +
                            "The names of constructs defined within a namespace definition are only required to be unique within " +
                            "the given namespace. Namespaces themselves may be nested to any depth." +
                            "\n" +
                            "Constructs defined in other namespaces may be referenced using a name that gives the enclosing " +
                            "namespaces, plus the construct name, each separated by dots (.). Such a multi-part name is called a " +
                            "scoped name. For example:" +
                            "\n" +
                            "See namespace-def for further details." +
                            "\n" +
                            "### B.1.5. Qualifiers" +
                            "\n" +
                            "Constructs within a TLV Schema may be annotated with additional information using a qualifier. " +
                            "Qualifiers appear within square brackets ([…]) immediately following the construct they affect. In " +
                            "most cases the use of qualifiers is optional, but there are some situations where the schema syntax " +
                            "requires a qualifier." +
                            "\n" +
                            "Often qualifiers are used to place restrictions on the form or range of values that a construct can " +
                            "assume. For example a length qualifier may be used to constrain the length of a STRING type:" +
                            "\n" +
                            "international-standard-book-number => STRING [length 13]" +
                            "\n" +
                            "Multiple qualifiers may appear within the square brackets, and shall be separated by commas." +
                            "\n" +
                            "See Section B.5, “Qualifiers” for further details." +
                            "\n" +
                            "### B.1.6. Tagging" +
                            "\n" +
                            "In a TLV Schema, tag numbers appear as qualifiers attached to a particular named construct, such as " +
                            "a field within a structure. This association reflects the tag’s role as an alias for the textual " +
                            "name in the TLV encoding. The syntax for tag qualifiers is defined in tag. For example:" +
                            "\n" +
                            "### B.2. Definitions" +
                            "\n" +
                            "A Matter TLV Schema consists of a set of one or more definitions. The definitions that may appear " +
                            "within a schema are:" +
                            "\n" +
                            "  - type-def" +
                            "\n" +
                            "  - field-group-def" +
                            "\n" +
                            "  - namespace-def" +
                            "\n" +
                            "  - protocol-def" +
                            "\n" +
                            "  - vendor-def" +
                            "\n" +
                            "### B.2.1. Type Definition (type-def)" +
                            "\n" +
                            "type-name [ qualifier ] => type-or-ref type-or-ref: type type-ref type: ANY ARRAY ARRAY OF BOOLEAN " +
                            "CHOICE OF FLOAT32 FLOAT64 LIST LIST OF NULL OCTET STRING SIGNED INTEGER STRING STRUCTURE UNSIGNED " +
                            "INTEGER type-ref: type-name scoped-type-name qualifier: tag A type definition associates a name " +
                            "(type-name) with a schema construct representing a TLV type or pseudo-type. The given name serves as " +
                            "a descriptive title for the type, as well as a means to refer to the type from elsewhere in the " +
                            "schema." +
                            "\n" +
                            "Type definitions (type-def) are often used to describe TLV types that appear directly in some form " +
                            "of communication. For example, a type definition may define the structure of data carried within the " +
                            "payload of a message. Some type definitions may be used to define general purpose TLV constructs " +
                            "which are then employed in the definitions of other types." +
                            "\n" +
                            "The type (type-name) associated with a type definition may be any one of the available TLV types or " +
                            "pseudo-type. Alternatively, a type definition may contain a scoped type (scoped-type-name) referring " +
                            "to another type definition appearing elsewhere in the schema. This form is referred to as a type " +
                            "reference (type-ref). The ordering of type definitions and type references within a schema is " +
                            "unimportant, implying that a type reference may refer to a type that is defined later in the schema." +
                            "\n" +
                            "A tag qualifier may be applied to the name within a type definition to associate a default tag with " +
                            "that name. The default tag will be used in an encoding of the type whenever an explicit tag has not " +
                            "been given." +
                            "\n" +
                            "### B.2.2. FIELD GROUP Definition (field-group-def)" +
                            "\n" +
                            "FIELD GROUP declares a collection of fields that may be included in a TLV Structure. A FIELD GROUP " +
                            "is never directly encoded in a TLV encoding. A FIELD GROUP is used with includes statement to define " +
                            "common patterns of fields such that they may be reused across different STRUCTURE definitions." +
                            "\n" +
                            "A FIELD GROUP definition (field-group-def) contains a list of field definitions, each of which gives " +
                            "the type of the field, its tag, and an associated textual name. The field type may be either a " +
                            "fundamental type, a CHOICE OF pseudo-type, an ANY pseudo-type, or a reference to one of these types " +
                            "defined outside the FIELD GROUP definition." +
                            "\n" +
                            "A FIELD GROUP definition may also contain one or more includes statements. Each such statement " +
                            "identifies another FIELD GROUP whose fields are to be included within the referencing FIELD GROUP. " +
                            "Such nested inclusion may be specified to any depth." +
                            "\n" +
                            "The rules governing the names and tags associated with fields within a FIELD GROUP are the same as " +
                            "those defined for STRUCTURE." +
                            "\n" +
                            "### B.2.3. Namespace Definition (namespace-def)" +
                            "\n" +
                            "namespace introduces a new naming scope. Definitions that appear within the braces of a namespace " +
                            "definition are scoped to that namespace, such that their names need only be unique within the bounds " +
                            "of the enclosing scope. The namespace scoped definitions shall be separated by commas." +
                            "\n" +
                            "In general, four forms of definitions may appear within a namespace: type definitions (type-def), " +
                            "FIELD GROUP definitions (field-group-def), protocol definitions (protocol-def) and further namespace " +
                            "definitions (namespace-def). Namespace definitions may be nested to any level. Protocol definitions, " +
                            "however, are restricted such that they shall NOT be nested. Thus a namespace can only contain a " +
                            "protocol definition if the namespace itself is not located, at any level, within another protocol " +
                            "definition." +
                            "\n" +
                            "The name used in a namespace definition may be either a simple name, such as a, or a scoped-name, " +
                            "such as a.b.c. When a scoped-name is used, the effect is exactly as if multiple nested namespaces " +
                            "had been declared, each named after a part of the scoped name." +
                            "\n" +
                            "It is legal to have multiple namespace definitions, each with the same name, defined within the same " +
                            "scope. The effect is as if there were only a single namespace definition containing a union of the " +
                            "enclosed definitions. Thus, a namespace definition with the same name as a preceding definition may " +
                            "be seen as a kind of continuation of the earlier one." +
                            "\n" +
                            "### B.2.4. PROTOCOL Definition (protocol-def)" +
                            "\n" +
                            "PROTOCOL defines a Matter protocol. A Matter protocol is a group of logically related Matter TLV " +
                            "constructs that together serve a common purpose." +
                            "\n" +
                            "Similar to a namespace definition, a PROTOCOL definition introduces a new naming scope in which " +
                            "further definitions may appear. The names of definitions appearing within the braces of a PROTOCOL " +
                            "are scoped in exactly the same way as if they had appeared within a namespace definition. Likewise, " +
                            "constructs outside the PROTOCOL definition may refer to definitions within the protocol by using a " +
                            "scoped name that includes the protocol name. The PROTOCOL scoped definitions shall be separated by " +
                            "commas." +
                            "\n" +
                            "PROTOCOL definitions may appear at the global naming scope, or within a namespace definition. " +
                            "However, PROTOCOL definitions shall NOT be nested within other PROTOCOL definitions at any depth." +
                            "\n" +
                            "Every PROTOCOL definition shall include an id qualifier giving the id of the protocol, that uniquely " +
                            "identifies the protocol among all other protocols. The id given in a PROTOCOL definition shall be " +
                            "unique relative to all other PROTOCOL definitions in a schema. However, it is legal to have multiple " +
                            "PROTOCOL definitions with the same protocol id, provided that they also have the same name and " +
                            "appear within the same naming scope. The effect of this is as if there were only a single PROTOCOL " +
                            "definition containing a union of the enclosed definitions. This makes it possible to break up a " +
                            "PROTOCOL definition across multiple schema files." +
                            "\n" +
                            "### B.2.5. VENDOR Definition (vendor-def)" +
                            "\n" +
                            "name => VENDOR [ qualifier ] qualifier: id" +
                            "\n" +
                            "VENDOR associates a name with a Vendor ID. VENDOR definition shall include an id qualifier giving " +
                            "the id of the vendor." +
                            "\n" +
                            "In a TLV Schema that includes a VENDOR definition, the vendor name may be used elsewhere in the " +
                            "schema as a stand-in for the associated Vendor ID. One such place where a vendor name may appear is " +
                            "within the id qualifier of a PROTOCOL definition." +
                            "\n" +
                            "VENDOR definitions may only appear at the global name scope, implying they shall NOT be placed " +
                            "within the body of a namespace or PROTOCOL definition." +
                            "\n" +
                            "Both the name and id value used in a VENDOR definition shall be unique across all such definitions. " +
                            "However, for convenience, a VENDOR definition may be repeated provided that the name and id are the " +
                            "same." +
                            "\n" +
                            "The Matter vendor (0x00000) is implicitly defined in all schemas, although it may be explicitly " +
                            "defined as well:" +
                            "\n" +
                            "### Matter => VENDOR [ 0x0000 ]" +
                            "\n" +
                            "### B.3. Types" +
                            "\n" +
                            "The TLV format supports 10 fundamental types: integers (signed and unsigned), floats, booleans, " +
                            "UTF-8 strings, octet strings, structures, arrays, lists and nulls. Accordingly, a TLV Schema may use " +
                            "one of the following type constructs to constrain an encoding to be one of these fundamental types." +
                            "\n" +
                            "### B.3.1. ARRAY / ARRAY OF" +
                            "\n" +
                            "ARRAY and ARRAY OF declare an element that is encoded as a TLV Array." +
                            "\n" +
                            "ARRAY OF declares an array where all the items in the array are of the same fundamental type, or " +
                            "taken from the same set of possible types. This form of array is called a uniform array, and is " +
                            "generally used to represent ordered collections of values." +
                            "\n" +
                            "ARRAY declares an array where the types of the array items follow a particular pattern. In this " +
                            "form, known as a pattern array; the allowed type for an item depends on its position in the array. " +
                            "The overall pattern of types allowed in the array is declared using a schema construct called a " +
                            "linear type pattern, which is similar to a regular expression (see below). Pattern arrays are " +
                            "typically used to represent vectors, tuples or paths." +
                            "\n" +
                            "A length qualifier on an array may be used to constraint the minimum and maximum number of items in " +
                            "the array. For a pattern array, the given length constraint shall be consistent with (i.e. fall " +
                            "within) the minimum and maximum number of items implied by the type pattern. In cases where the " +
                            "length qualifier places a narrower constraint on the length of an array than that implied by the " +
                            "type pattern, the length qualifier constraint takes precedence." +
                            "\n" +
                            "A nullable qualifier may be used to indicate that a TLV Null may be encoded in place of the ARRAY or " +
                            "ARRAY OF. Note that an array that has been replaced by a Null is distinct in terms of its encoding " +
                            "from an array that has no items." +
                            "\n" +
                            "### B.3.1.1. Linear Type Patterns" +
                            "\n" +
                            "A linear type pattern describes the sequence of TLV types that may appear in a TLV Array or List " +
                            "element. In its simplest form, a linear type pattern is a list of type definitions, or references to " +
                            "defined types, where each item constrains the TLV type that appears at the corresponding position in " +
                            "the collection. The type pattern is always anchored at the start of the collection, with the first " +
                            "type constraining the first item in the collection. Any type or pseudo-type may appear within a " +
                            "linear type pattern." +
                            "\n" +
                            "More complex type patterns can be created by using a quantifier. Quantifiers appear after a type in " +
                            "a type pattern and specify the number of times the associated type may appear at that position in " +
                            "the collection. Quantifiers borrow common regular expression notation to denote repetition, with * " +
                            "meaning zero or more, + meaning one or more, and { } expressing specific counts. Using quantifiers, " +
                            "one can express complex sequences of types, including some that require arbitrary look-ahead to " +
                            "match." +
                            "\n" +
                            "### B.3.1.2. Item Names" +
                            "\n" +
                            "Items or groups of items in a pattern array may be given textual names. These names do not affect " +
                            "the encoding of the array, but serve as user documentation, or as input to code generation tools. " +
                            "Item names within a pattern array shall be unique." +
                            "\n" +
                            "Per the rules for encoding TLV arrays, array items shall NOT have tags. Thus the tag qualifier shall " +
                            "NOT be applied to an item name with a pattern array." +
                            "\n" +
                            "### B.3.2. BOOLEAN" +
                            "\n" +
                            "BOOLEAN [ qualifier ] qualifier (optional): nullable BOOLEAN declares an element that shall be " +
                            "encoded as a TLV Boolean." +
                            "\n" +
                            "If the nullable qualifier is given, a TLV Null may be encoded in its place." +
                            "\n" +
                            "pathlight-enabled => BOOLEAN" +
                            "\n" +
                            "### B.3.3. FLOAT32 / FLOAT64" +
                            "\n" +
                            "FLOAT32 [ qualifier ] FLOAT64 [ qualifier ] qualifier (optional): range nullable FLOAT32 declares an " +
                            "element that shall be encoded as a TLV floating point number with the element type indicating a " +
                            "4-octet IEEE 754-2019 single-precision value. Correspondingly, FLOAT64 declares a TLV element that " +
                            "shall be encoded as a TLV floating point number with the element type indicating an 8-octet IEEE " +
                            "754-2019 double-precision value." +
                            "\n" +
                            "If the nullable qualifier is given, a TLV Null may be encoded in place of the number." +
                            "\n" +
                            "The allowed range of values can be constrained using the range qualifier. If omitted, the value is " +
                            "constrained by what the relevant TLV type can represent." +
                            "\n" +
                            "set-value => FLOAT32 [ range 0..50 ]" +
                            "\n" +
                            "### B.3.4. SIGNED INTEGER / UNSIGNED INTEGER" +
                            "\n" +
                            "SIGNED INTEGER declares an element that shall be encoded as a TLV integer with the element type " +
                            "indicating the integer is signed. Correspondingly, UNSIGNED INTEGER declares a TLV element that " +
                            "shall be encoded as a TLV integer with the element type indicating the integer is unsigned." +
                            "\n" +
                            "If the nullable qualifier is given, a TLV Null may be encoded in place of the integer." +
                            "\n" +
                            "The allowed range of values may be constrained using the range qualifier. If omitted, the value is " +
                            "constrained by what the relevant TLV type can represent." +
                            "\n" +
                            "SIGNED INTEGER and UNSIGNED INTEGER definitions may include a set of enumerated values (enum), each " +
                            "of which associates a textual name (identifier) with a constant integer value (int-value). Each " +
                            "value shall conform to the allowed range of values for the SIGNED INTEGER definition as given by its " +
                            "sign and any range qualifier. The presence of enumerated values shall NOT restrict senders to only " +
                            "encoding those values. Rather, enumerations merely give symbolic names to particular noteworthy " +
                            "values." +
                            "\n" +
                            "sensor-value => SIGNED INTEGER [ range -100..100 ] counter => UNSIGNED INTEGER [ range 32-bits ]" +
                            "\n" +
                            "### B.3.5. LIST / LIST OF" +
                            "\n" +
                            "LIST and LIST OF declare an element that is encoded as a TLV List. LIST and LIST OF declare the same " +
                            "fundamental type, but differ based on how the allowed types of their items are expressed." +
                            "\n" +
                            "LIST OF declares a list where all the items in the list are of the same fundamental type, or taken " +
                            "from the same set of possible types. This form of list is called a uniform list. Uniform lists are " +
                            "generally used to represent ordered collections of values where the tags differentiate the semantic " +
                            "meaning of the value." +
                            "\n" +
                            "LIST declares a pattern list where the types of the items in the list follow a particular pattern. " +
                            "In this form, the allowed type(s) for an item depends on its position in the array. Pattern lists " +
                            "are typically used to represent path-like constructs." +
                            "\n" +
                            "The overall pattern of types allowed in a pattern list is declared using a schema construct called a " +
                            "linear type pattern. The syntax and interpretation of linear type patterns for pattern lists are the " +
                            "same as those for pattern arrays (see Section B.3.1.1, “Linear Type Patterns”)." +
                            "\n" +
                            "The length qualifier may be used to constraint the minimum and maximum number of items in the list. " +
                            "For a pattern list, the given length constraint shall be consistent with (i.e. fall within) the " +
                            "minimum and maximum number of items implied by the type pattern. In cases where the length qualifier " +
                            "places a narrower constraint on the length of a list than that implied by the type pattern, the " +
                            "length qualifier constraint takes precedence." +
                            "\n" +
                            "A nullable qualifier may be used to indicate that a TLV Null may be encoded in place of the LIST or " +
                            "LIST OF. Note that a list that has been replaced by a Null is distinct (in terms of its encoding) " +
                            "from a list that has no items." +
                            "\n" +
                            "### B.3.5.1. Item Names" +
                            "\n" +
                            "As with the ARRAY type, items or groups of items in a pattern list may be given textual names to " +
                            "distinguish their purposes. Item names within a pattern list shall be unique." +
                            "\n" +
                            "### B.3.5.2. Item Tags" +
                            "\n" +
                            "Items within a pattern list can have a tag qualifier that specifies a particular tag value that " +
                            "shall be encoded with the item. The specific tag can be protocol-specific or context-specific, or " +
                            "the anonymous tag. The assigned tag values are not required to be unique among the items in a " +
                            "pattern list." +
                            "\n" +
                            "When no explicit tag qualifier is given (which is always the case for uniform lists) the items in a " +
                            "list automatically assume the default tag of their underlying types, if such a tag is provided. This " +
                            "can occur in two situations: 1) when the underlying type is a reference to a type definition that " +
                            "declares a default tag, and 2) when the underlying type is a CHOICE OF whose alternates declare " +
                            "default tags. See default tag for further information." +
                            "\n" +
                            "If no tag qualifier is given, and no default tag is available, an encoder is allowed to encode list " +
                            "items with any tag of their choosing." +
                            "\n" +
                            "### B.3.6. OCTET STRING" +
                            "\n" +
                            "OCTET STRING [ qualifier ] qualifier (optional): length nullable OCTET STRING declares an element " +
                            "that is encoded as a TLV Octet String, and in particular with the element type indicating it’s an " +
                            "Octet String." +
                            "\n" +
                            "The minimum and maximum number of bytes can be constrained using the length qualifier." +
                            "\n" +
                            "address => OCTET STRING [ length 8 ]" +
                            "\n" +
                            "### B.3.7. NULL" +
                            "\n" +
                            "### NULL" +
                            "\n" +
                            "NULL declares an element that shall be encoded as a TLV Null. There are no qualifiers that can be " +
                            "associated with a NULL type." +
                            "\n" +
                            "### B.3.8. STRING" +
                            "\n" +
                            "STRING [ qualifier ] qualifier (optional): length nullable STRING declares an element that is " +
                            "encoded as a TLV UTF-8 String, and in particular with the element type indicating it’s a UTF-8 " +
                            "String." +
                            "\n" +
                            "If the nullable qualifier is given, a TLV Null may be encoded in place of the string." +
                            "\n" +
                            "The minimum and maximum length of the string can be constrained using the length qualifier." +
                            "\n" +
                            "name-field => STRING [ length 0..32 ]" +
                            "\n" +
                            "### B.3.9. STRUCTURE" +
                            "\n" +
                            "STRUCTURE declares an element that is encoded as a TLV Structure. The STRUCTURE fields shall be " +
                            "separated by commas." +
                            "\n" +
                            "A STRUCTURE definition declares the list of fields that may appear within the corresponding TLV " +
                            "Structure. Each field definition gives the type of the field, its tag, and an associated textual " +
                            "name. The field type may be either a fundamental type, a CHOICE OF pseudo-type, an ANY pseudo-type, " +
                            "or a reference to one of these types defined outside the STRUCTURE definition." +
                            "\n" +
                            "A STRUCTURE definition may also contain one or more includes statements. Each such statement " +
                            "identifies a FIELD GROUP definition whose fields are to be included within the TLV Structure as if " +
                            "they had been declared within the STRUCTURE definition itself (see Includes FIELD GROUP below)." +
                            "\n" +
                            "An extensible qualifier may be used to declare that a structure can be extended at encoding time by " +
                            "the inclusion of fields not listed in the STRUCTURE definition." +
                            "\n" +
                            "The order qualifiers (any-order, schema-order and tag-order) may be used to specify a particular " +
                            "order for the encoding of fields within a TLV Structure." +
                            "\n" +
                            "A nullable qualifier may be used to indicate that a TLV Null may be encoded in place of the " +
                            "STRUCTURE." +
                            "\n" +
                            "### B.3.9.1. Fields" +
                            "\n" +
                            "Fields within a STRUCTURE are assigned textual names to distinguish them from one another. Each such " +
                            "name shall be distinct from all other field names defined within the STRUCTURE or included via a " +
                            "includes statement. Fields names do not affect the encoding of the resultant TLV, but may serve as " +
                            "either user documentation or input to code generation tools." +
                            "\n" +
                            "Per the rules of TLV, all fields within a TLV Structure shall be encoded with a distinct TLV tag. " +
                            "Field tags are declared by placing a tag qualifier on the field name. Both protocol-specific and " +
                            "context-specific tags are allowed on the fields in a STRUCTURE definition." +
                            "\n" +
                            "For a given field if the tag qualifier is missing then the underlying type shall provide a default " +
                            "tag. This can occur in two situations:" +
                            "\n" +
                            "  1. the underlying type is a reference to a type definition that provides a default tag" +
                            "\n" +
                            "  2. the underlying type is a CHOICE OF pseudo-type whose alternates provide default tags." +
                            "\n" +
                            "The tags associated with includes fields are inherited from the target FIELD GROUP definition." +
                            "\n" +
                            "All tags associated with the fields of a TLV Structure shall be unique. This is true not only for " +
                            "tags declared directly within the STRUCTURE definition, but also for any tags associated with fields " +
                            "that are incorporated via an includes statement." +
                            "\n" +
                            "The anonymous tag shall NOT be used as the tag for a field within a STRUCTURE definition." +
                            "\n" +
                            "The optional qualifier may be used to declare a field which can be omitted from the structure " +
                            "encoding under some circumstances." +
                            "\n" +
                            "### B.3.9.2. CHOICE OF Fields" +
                            "\n" +
                            "A field within a STRUCTURE definition may be defined to be a CHOICE OF (either directly within the " +
                            "STRUCTURE definition or via a type reference). Over the wire, such a field is encoded as one of the " +
                            "alternate types given in the CHOICE OF definition. For example, the user-id field in the following " +
                            "STRUCTURE may be encoded as either a TLV UTF-8 String or an Unsigned Integer." +
                            "\n" +
                            "If a tag qualifier is given for a CHOICE OF field (e.g. [1] as shown above), that tag shall be used " +
                            "in the encoding of the field for all possible alternates. On the other hand, if a tag qualifier is " +
                            "not given, then the default tag associated with the selected CHOICE OF alternate shall be used in " +
                            "the encoding. For example, in the following structure, a context-tag of 1 will be encoded if the " +
                            "user-id field is an Unsigned Integer, or 2 if the field is a String." +
                            "\n" +
                            "Note that, in all cases, the tag or tags associated with a CHOICE OF field shall be unique within " +
                            "the context of the containing STRUCTURE." +
                            "\n" +
                            "### B.3.9.3. Includes FIELD GROUP" +
                            "\n" +
                            "A includes statement may be used within a STRUCTURE definition to incorporate the fields of a FIELD " +
                            "GROUP defined outside the STRUCTURE. The fields of the FIELD GROUP are included in the STRUCTURE as " +
                            "if they had been listed within the STRUCTURE definition itself." +
                            "\n" +
                            "A particular FIELD GROUP shall NOT be included more than once within a given STRUCTURE." +
                            "\n" +
                            "The names assigned to fields within an included FIELD GROUP shall be distinct with respect to all " +
                            "other fields contained within the enclosing STRUCTURE, whether defined directly within the STRUCTURE " +
                            "itself, or included from another FIELD GROUP." +
                            "\n" +
                            "Likewise, tags assigned to fields within an included FIELD GROUP shall be distinct with respect to " +
                            "all other fields within the enclosing STRUCTURE." +
                            "\n" +
                            "### B.4. Pseudo-Types" +
                            "\n" +
                            "Pseudo-types are type-like constructs that provide flexibility in schema definitions. Some " +
                            "pseudo-types, like CHOICE OF and ANY, allow for variance in the fundamental TLV types that may " +
                            "appear in an encoding. Others make it easier to reuse schema constructs in multiple contexts." +
                            "\n" +
                            "### B.4.1. ANY" +
                            "\n" +
                            "ANY ANY declares an element that can be encoded as any fundamental TLV type. Note that ANY is not a " +
                            "fundamental TLV type itself, but rather a pseudo-type that identifies a range of possible encodings. " +
                            "An ANY type serves a shorthand for (and is exactly equivalent to) a CHOICE OF all possible " +
                            "fundamental types." +
                            "\n" +
                            "There are no qualifiers that can be associated with an ANY type." +
                            "\n" +
                            "app-defined-metadata => ANY" +
                            "\n" +
                            "### B.4.2. CHOICE OF" +
                            "\n" +
                            "CHOICE OF declares an element that may be any of a set of TLV types. CHOICE OF is considered a " +
                            "pseudo-type, rather than a fundamental type, in that the CHOICE OF itself doesn’t have a " +
                            "representation in the final TLV encoding." +
                            "\n" +
                            "The allowed TLV types for a CHOICE OF, known as alternates, are given in the body of the definition. " +
                            "An alternate may be any of the fundamental TLV types, an ANY pseudo-type, or another CHOICE OF " +
                            "definition (more on this below). Additionally, an alternate may be a type reference (in the form of " +
                            "a scoped type name) referring to a type defined outside of the CHOICE OF definition." +
                            "\n" +
                            "A nullable qualifier may be used to indicate that a TLV Null can be encoded in place of the CHOICE " +
                            "OF. This is exactly the same as if NULL had been listed as one of the alternates." +
                            "\n" +
                            "### B.4.2.1. Alternate Names and Tags" +
                            "\n" +
                            "Alternates may be assigned textual names to distinguish them from one another. Each such name shall " +
                            "be unique within the particular CHOICE OF definition. Alternate names do not affect the encoding of " +
                            "the resultant TLV. Rather, alternate names serve as user documentation, or as input to code " +
                            "generation tools." +
                            "\n" +
                            "Named CHOICE OF alternates may include at tag qualifier assigning a particular tag value to the " +
                            "alternate. When qualified in this way, the given tag value serves as a default tag for the alternate " +
                            "whenever the CHOICE OF appears in a context that doesn’t otherwise specify a tag. The tags assigned " +
                            "within a CHOICE OF do not need to be unique, although see the discussion of Ambiguous Alternates " +
                            "below." +
                            "\n" +
                            "Both protocol-specific and context-specific tags are allowed on the alternates of a CHOICE OF " +
                            "definition." +
                            "\n" +
                            "### B.4.2.2. Nested CHOICE OF and CHOICE OF Merging" +
                            "\n" +
                            "It is legal for an alternate within a CHOICE OF to be another CHOICE OF definition, or a type " +
                            "reference to such. In this case, the effect is exactly as if the alternates of the inner CHOICE OF " +
                            "definition had been declared directly with the outer definition. This merging of CHOICE OF " +
                            "alternates occurs to any level of nesting, and may be used as a means of declaring multiple CHOICE " +
                            "OF that are supersets of other CHOICE OF." +
                            "\n" +
                            "When alternates are merged, their names are preserved. In cases where the same name appears in " +
                            "nested CHOICE OF definitions, the name of the outer alternate is prepended to that of the inner " +
                            "alternate, separated by a dot, to form a unique name for the merged alternate. In these cases, the " +
                            "outer alternate shall have a name in the schema, to ensure uniqueness." +
                            "\n" +
                            "An example of invalid CHOICE OF syntax, which results in a name conflict when alternates are merged:" +
                            "\n" +
                            "The example below shows how a valid schema should look to avoid conflict:" +
                            "\n" +
                            "### B.4.2.3. Ambiguous Alternates" +
                            "\n" +
                            "A CHOICE OF may contain multiple alternates having the same fundamental TLV type (e.g. two " +
                            "alternates that are both SIGNED INTEGER). If these alternates are also encoded using the same tag, " +
                            "their encoded forms are effectively indistinguishable from one another. Such alternates are referred " +
                            "to as ambiguous alternates." +
                            "\n" +
                            "Ambiguous alternates may occur due to the merging of nested CHOICE OF definitions (see above). They " +
                            "may also arise in cases where the tags associated with the alternates are overridden by a tag " +
                            "qualifier in an outer context; e.g. when a STRUCTURE incorporates a CHOICE OF field that has a " +
                            "specific tag qualifier assigned to the field." +
                            "\n" +
                            "Ambiguous alternates are legal in TLV Schemas. However, care shall be taken when introducing " +
                            "ambiguous alternates to ensure that a decoder can correctly interpret the resulting encoding. This " +
                            "can be achieved, for example, by signaling the appropriate interpretation via a data value (e.g. an " +
                            "enumerated integer) contained elsewhere in the encoding." +
                            "\n" +
                            "### B.5. Qualifiers" +
                            "\n" +
                            "Qualifiers are annotations that provide additional information regarding the use or interpretation " +
                            "of a schema construct. Often qualifiers are used to place restrictions on the form or range of " +
                            "values that the construct can assume." +
                            "\n" +
                            "B.5.1. any-order / schema-order / tag-order" +
                            "\n" +
                            "STRUCTURE [ any-order ] STRUCTURE [ schema-order ] STRUCTURE [ tag-order ] The any-order, " +
                            "schema-order and tag-order qualifiers may be used to specify a particular order for the encoding of " +
                            "fields within a STRUCTURE." +
                            "\n" +
                            "The any-order qualifier specifies that the encoder of a TLV structure is free to encode the fields " +
                            "of the structure in any desired order." +
                            "\n" +
                            "The schema-order qualifier specifies that the fields of a structure shall be encoded in the order " +
                            "given within the associated STRUCTURE definition. If the STRUCTURE definition contains one or more " +
                            "includes statements, the fields of the referenced FIELD GROUPs shall be encoded in the order given " +
                            "in the respective FIELD GROUP definition, and at the position of the includes statement relative to " +
                            "other fields within the STRUCTURE." +
                            "\n" +
                            "The tag-order qualifier specifies that the fields of a structure shall be encoded in the order " +
                            "specified by their tags, as defined in Section A.2.4, “Canonical Ordering of Tags”." +
                            "\n" +
                            "Only a single ordering qualifier may be applied to a given STRUCTURE type." +
                            "\n" +
                            "In the absence of an order qualifier, fields within TLV structure may generally be encoded in any " +
                            "order. However, the author of a STRUCTURE definition may choose to impose custom ordering " +
                            "constraints on some or all of the fields if so desired. Such constraints shall be clearly described " +
                            "in the prose documentation for the schema." +
                            "\n" +
                            "### B.5.2. extensible" +
                            "\n" +
                            "### STRUCTURE [ extensible ]" +
                            "\n" +
                            "The extensible qualifier is only allowed on STRUCTURE types, and declares that the structure may be " +
                            "extended by the inclusion of fields not listed in its definition. When a structure is extended in " +
                            "this way, any new fields that are included shall use tags that are distinct from any of those " +
                            "associated with defined or included fields." +
                            "\n" +
                            "Absent the extensible qualifier, a structure encoding shall NOT include fields beyond those given in " +
                            "the STRUCTURE definition." +
                            "\n" +
                            "### B.5.3. id" +
                            "\n" +
                            "vendor-name => VENDOR [ id uint-value ] protocol-name => PROTOCOL [ id uint-value ] protocol-name => " +
                            "PROTOCOL [ id uint-value:uint-value ] protocol-name => PROTOCOL [ id vendor-name:uint-value ]" +
                            "\n" +
                            "The id qualifier is used to specify an identifying number associated with a VENDOR or PROTOCOL " +
                            "definition." +
                            "\n" +
                            "When applied to a VENDOR definition, the id value is a 16-bit unsigned integer specifying the " +
                            "Protocol Vendor ID, which uniquely identify an organization or company. VENDOR ids are used to scope " +
                            "other identifiers (e.g. PROTOCOL ids) such that organizations can independently mint these " +
                            "identifiers without fear of collision." +
                            "\n" +
                            "When applied to a PROTOCOL definition, the id value may take three forms:" +
                            "\n" +
                            "  - 32-bit unsigned integer, which is composed of a Protocol Vendor ID in the high 16-bits and a " +
                            "protocol id in the low 16-bits" +
                            "\n" +
                            "  - two 16-bit unsigned integers (separated by a colon) specifying the Protocol Vendor ID and " +
                            "protocol id" +
                            "\n" +
                            "  - vendor-name and 16-bit protocol id (separated by a colon). The vendor-name definition shall " +
                            "exist elsewhere in the schema MATTER-VENDOR-AB => VENDOR [ 0x00AB ] // Equivalent definitions of " +
                            "the protocol introduced by MATTER-VENDOR-AB vendor-ab-prot8 => PROTOCOL [ 0x00AB0008 ] " +
                            "vendor-ab-prot8 => PROTOCOL [ 0x00AB:0x0008 ] vendor-ab-prot8 => PROTOCOL [ MATTER-VENDOR-AB:8 ]" +
                            "\n" +
                            "### B.5.4. length" +
                            "\n" +
                            "type [ length count ] // exactly count type [ length min..max ] // between min and max (inclusive) " +
                            "type [ length min.. ] // at least min" +
                            "\n" +
                            "The length qualifier may be used to constrain the number of elements in a collection type, such as " +
                            "an ARRAY or LIST, or the number of bytes in a STRING or OCTET STRING type." +
                            "\n" +
                            "### B.5.5. nullable" +
                            "\n" +
                            "type [ nullable ]" +
                            "\n" +
                            "The nullable qualifier is used with ARRAY, LIST, STRUCTURE, STRING, OCTET STRING, BOOLEAN, SIGNED " +
                            "INTEGER, UNSIGNED INTEGER, FLOAT32, FLOAT64 types. The nullable qualifier declares that a TLV Null " +
                            "may be substituted for a value of the specified type at a particular point in an encoding. For " +
                            "example, in the following sensor-sample structure, a null value may be encoded for the value field " +
                            "(e.g. in the case the sensor was off-line at the sample time):" +
                            "\n" +
                            "Applying a nullable qualifier to a type is exactly the same as defining a CHOICE OF type with " +
                            "alternates for the primary and NULL. For example, the sensor sample structure could also be defined " +
                            "as follows:" +
                            "\n" +
                            "### B.5.6. optional" +
                            "\n" +
                            "... field-name [ optional ] : type-or-ref, ..." +
                            "\n" +
                            "The optional qualifier declares that a field within a STRUCTURE or FIELD GROUP is optional, and may " +
                            "be omitted by an encoder. The optional qualifier may only appear on the name portion of a field " +
                            "definition within either a STRUCTURE or FIELD GROUP." +
                            "\n" +
                            "Note that an optional field is distinct, both semantically and in terms of encoding, from a field " +
                            "whose type has been declared nullable. In the former case the field may be omitted from the encoding " +
                            "altogether. In the latter case the field shall appear within the encoding, however its value may be " +
                            "encoded as a TLV Null. It is legal to declare a field that is both optional and nullable." +
                            "\n" +
                            "The conditions under which an optional field can be omitted depend on the semantics of the " +
                            "structure. In some cases, fields may be omitted entirely at the discretion of the sender. In other " +
                            "cases, omission of a field may be contingent on the value present in another field. In all cases, " +
                            "prose documentation associated with the field definition shall make clear the rules for when the " +
                            "field may be omitted." +
                            "\n" +
                            "Optional fields are allowed within FIELD GROUP and retain their optionality when included within " +
                            "STRUCTURE." +
                            "\n" +
                            "### B.5.7. range" +
                            "\n" +
                            "integer-type [ range min..max ] // explicit constraint (inclusive) integer-type [ range 8-bits ] // " +
                            "width constraint integer-type [ range 16-bits ] integer-type [ range 32-bits ] integer-type [ range " +
                            "64-bits ]" +
                            "\n" +
                            "The range qualifier may be used to constrain the range of values for a numeric type such as SIGNED " +
                            "INTEGER, UNSIGNED INTEGER, FLOAT32, or FLOAT64. Two forms are supported: explicit constraints and " +
                            "width constraints. Only one form may be applied to a given type." +
                            "\n" +
                            "An explicit constraint gives specific minimum and maximum (inclusive) values for the type. These may " +
                            "be any value that is legal for the underlying type." +
                            "\n" +
                            "A width constraint constrains the value to fit within a specific number of bytes. Any of the width " +
                            "constraints (8-bits, 16-bits, 32-bits or 64-bits) may be applied to SIGNED INTEGER and UNSIGNED " +
                            "INTEGER types, where 8-bits, 16-bits, 32-bits and 64-bits constraints correspond to 1-octet, " +
                            "2-octet, 4-octet and 8-octet element type respectively; only 32-bits constraint may be applied to " +
                            "FLOAT32 type and only 64-bits constraint may be applied to FLOAT64 type." +
                            "\n" +
                            "Note that a width constraint range qualifier does not obligate an encoder to always encode the " +
                            "specified number of bits. Per the TLV encoding rules, senders are always free to encode integer and " +
                            "floating point values in any encoding size, bigger or smaller, that will accommodate the value." +
                            "\n" +
                            "### B.5.8. tag" +
                            "\n" +
                            "identifier [ tag-num ] // context-specific tag identifier [ protocol-id:tag-num ] // " +
                            "protocol-specific tag identifier [ protocol-name:tag-num ] // protocol-specific tag identifier [ " +
                            "*:tag-num ] // protocol-specific tag (cur. protocol) identifier [ anonymous ] // no tag" +
                            "\n" +
                            "The tag qualifier is allowed on type names, field names within a STRUCTURE (STRUCTURE Fields) or " +
                            "FIELD GROUP, item names within a LIST (LIST Item Tags), alternate names within a CHOICE OF (CHOICE " +
                            "OF Fields)." +
                            "\n" +
                            "The tag qualifier specifies a numeric tag value to be used when encoding a particular value. For " +
                            "brevity, the tag keyword shall be omitted when specifying a tag qualifier. As a special case, the " +
                            "keyword anonymous may be used to signal a value that shall be encoded without a tag." +
                            "\n" +
                            "Matter TLV supports two forms of tags: Protocol-Specific Tags and Context-Specific Tags. A " +
                            "protocol-specific tag is a colon-separated tuple containing a protocol-id and a tag-num. Protocol " +
                            "ids may also be specified indirectly, by giving the name of a PROTOCOL definition (protocol-name) " +
                            "located elsewhere in the schema. An asterisk (*) may be used as a shorthand to refer to the id of " +
                            "the PROTOCOL definition in which the tag qualifier appears. This protocol is referred to as the " +
                            "current protocol." +
                            "\n" +
                            "### B.5.8.1. Explicit Tags" +
                            "\n" +
                            "A tag qualifier that appears on a field within a STRUCTURE or FIELD GROUP, or on an item within a " +
                            "LIST, specifies the exact tag to be used when encoding the associated field/item. Such a tag is " +
                            "called an explicit tag, and may be either a context-specific, protocol-specific or anonymous (for " +
                            "LIST) tag." +
                            "\n" +
                            "If a field or item lacks a tag qualifier, then the encoding will use a default tag associated with " +
                            "the underlying field type, if such a tag has been specified." +
                            "\n" +
                            "### B.5.8.2. Default Tags" +
                            "\n" +
                            "A tag qualifier that appears on a type definition, or on an alternate within a CHOICE OF, serves as " +
                            "a default tag. A default tag is used to encode a value when an explicit tag has not been given in " +
                            "the schema." +
                            "\n" +
                            "For example, a field within a STRUCTURE that refers to a type with a default tag will use that tag " +
                            "if no tag qualifier has been specified on the field itself. Similarly, tag qualifiers that appear on " +
                            "the alternates of a CHOICE OF serve as default tags to be used when no other tag has been specified." +
                            "\n" +
                            "Both context-specific and protocol-specific tags may be used as default tags. 'anonymous` tag shall " +
                            "NOT be used as default tag." +
                            "\n" +
                            "### B.5.9. Documentation and Comments" +
                            "\n" +
                            "TLV Schemas may include inline annotations that support the automatic generation of reference " +
                            "documentation and the production of documented code. TLV Schemas follow the Javadoc style of " +
                            "annotation wherein documentation is wrapped in the special multi-line comment markers /** and */." +
                            "\n" +
                            "In certain cases, documentation may also be placed after a construct, using /**< and */." +
                            "\n" +
                            "Postfix annotations are allowed on STRUCTURE and FIELD GROUP members, ARRAY and LIST items, CHOICE " +
                            "OF alternates, SIGNED INTEGER and UNSIGNED INTEGER enumerated values." +
                            "\n" +
                            "Non-documentation comments follow the standard C++ commenting style." +
                            "\n" +
                            "Appendix C: Tag-length-value (TLV) Payload Text Representation Format" +
                            "\n" +
                            "### C.1. Introduction" +
                            "\n" +
                            "This section describes a means by which to depict TLV payloads in a more user-friendly, textual " +
                            "representation." +
                            "\n" +
                            "### C.2. Format Specification" +
                            "\n" +
                            "### C.2.1. Tag/Value" +
                            "\n" +
                            "TLV elements are tag/value pairs. As such, their general textual representation is as follows:" +
                            "\n" +
                            "tag = value" +
                            "\n" +
                            "### C.2.2. Context-Specific Tags" +
                            "\n" +
                            "The basic representation of a context-specific tag is a single scalar number." +
                            "\n" +
                            "TLV entries using context-specific tags may use the basic representation alone:" +
                            "\n" +
                            "2 = \"hello\"" +
                            "\n" +
                            "If the tag has a name from an associated schema, it may be represented using that name. The basic " +
                            "representation may also be appended in parentheses (\"(\", \")\"):" +
                            "\n" +
                            "name (2) = \"hello\"" +
                            "\n" +
                            "### C.2.3. Protocol-Specific Tags" +
                            "\n" +
                            "The basic representation of a protocol-specific tag shall be fully-qualified with \"::\" separating " +
                            "the vendor id and the protocol number and \":\" separating the protocol number and tag number. The " +
                            "vendor id, protocol number and tag number are each represented using a single scalar number " +
                            "represented in hexadecimal notation." +
                            "\n" +
                            "0x0000::0x0000:0x01 = 10" +
                            "\n" +
                            "If the tag has a name from an associated schema, it may be represented using that name. The basic " +
                            "representation may also be appended in parentheses (\"(\", \")\"):" +
                            "\n" +
                            "SmartSensorsCompany::SensingProtocol:Extension (0x00ef::0x00aa:0x01) = 10" +
                            "\n" +
                            "### C.2.4. Anonymous Tags" +
                            "\n" +
                            "TLV entries using anonymous tags shall display the value alone:" +
                            "\n" +
                            "\"hello\"" +
                            "\n" +
                            "### C.2.5. Primitive Types" +
                            "\n" +
                            "Signed Integer:" +
                            "\n" +
                            "duration = 20" +
                            "\n" +
                            "Unsigned Integer:" +
                            "\n" +
                            "duration = 20U" +
                            "\n" +
                            "If the value is a defined constant, or enumerated value, then the string literal may be provided as " +
                            "well:" +
                            "\n" +
                            "mode = FAST (20U)" +
                            "\n" +
                            "UTF-8 string:" +
                            "\n" +
                            "name = \"Jonah\"" +
                            "\n" +
                            "Octet String (listed as 8-bit hex digits):" +
                            "\n" +
                            "data = 2f 2a fd 11 33 e2 ..." +
                            "\n" +
                            "Floats:" +
                            "\n" +
                            "temp = 20.234" +
                            "\n" +
                            "Booleans:" +
                            "\n" +
                            "isOn = false isOn = true" +
                            "\n" +
                            "Null:" +
                            "\n" +
                            "temp = null" +
                            "\n" +
                            "### C.2.6. Complex Types: Structure" +
                            "\n" +
                            "Braces ({ … }) shall be used to convey the start and end of structure scope, with the members " +
                            "separated by commas (,):" +
                            "\n" +
                            "### C.2.7. Complex Types: Arrays" +
                            "\n" +
                            "Square brackets ([ … ]) shall be used to convey array scope, with elements in the array separated by " +
                            "commas (,). Since elements in the array are required to be anonymous, each element shall display the " +
                            "value alone:" +
                            "\n" +
                            "temp-samples = [20, 30, 40]" +
                            "\n" +
                            "### C.2.8. Complex Types: List" +
                            "\n" +
                            "Double square brackets ([[ … ]]) shall be used to convey list scope, with elements in the list " +
                            "separated by commas (,). Since a diversity of tag types can be used in a list (including " +
                            "duplicates), the tags shall always be present and explicitly stated:" +
                            "\n" +
                            "AttributePath = [[ EndpointId = 20, ClusterId = 40 ]]" +
                            "\n" +
                            "### C.3. Examples" +
                            "\n" +
                            "### C.3.1. TLV Schema" +
                            "\n" +
                            "This is a sample TLV schema that will be used to define example TLV payloads." +
                            "\n" +
                            "### C.3.2. TLV Payloads" +
                            "\n" +
                            "### C.3.2.1. Temperature Sample" +
                            "\n" +
                            "### C.3.2.2. Accelerometer Sample" +
                            "\n" +
                            "### C.3.2.3. Sensor State" +
                            "\n" +
                            "### Appendix D: Status Report Messages" +
                            "\n" +
                            "### D.1. Overview" +
                            "\n" +
                            "The StatusReport is a core message that encapsulates the result of an operation which a responder " +
                            "sends as a reply for requests sent from an initiator, using a common message of the Secure Channel " +
                            "Protocol (Protocol ID = PROTOCOL_ID_SECURE_CHANNEL)." +
                            "\n" +
                            "This section details the standard Status Report message format encoding as Matter Message Format " +
                            "payloads." +
                            "\n" +
                            "### D.2. Status Report elements" +
                            "\n" +
                            "A Status Report message describes a protocol-specific operation result or status." +
                            "\n" +
                            "The Status Report message shall have the following message header values (some of which may be " +
                            "omitted within protocol messages, as per header flag rules), no matter which protocol actually " +
                            "generated the status report:" +
                            "\n" +
                            "  - A Protocol Vendor ID set to 0 (Matter common Vendor ID)" +
                            "\n" +
                            "  - A Protocol ID set to 0x0000 (PROTOCOL_ID_SECURE_CHANNEL)" +
                            "\n" +
                            "  - A Protocol Opcode set to 0x40 (StatusReport)" +
                            "\n" +
                            "The report message’s Application Payload shall consist of:" +
                            "\n" +
                            "  - A mandatory GENERAL CODE field, providing a general description of the status being reported." +
                            "\n" +
                            "  - A mandatory PROTOCOL SPECIFIC STATUS field, providing additional details" +
                            "\n" +
                            "  - An optional protocol-specific data section that may include any additional information that a " +
                            "protocol requires" +
                            "\n" +
                            "    - Individual protocols define the contents of this data section and how it is handled" +
                            "\n" +
                            "### D.3. Message Format" +
                            "\n" +
                            "### D.3.1. General status codes (GeneralCode)" +
                            "\n" +
                            "General status codes conveyed in the GeneralCode field are uniform codes that convey both success " +
                            "and failures." +
                            "\n" +
                            "The following general status codes are defined:" +
                            "\n" +
                            "If none of the specific codes above fits for application usage, a protocol shall use FAILURE and " +
                            "provide more information encoded in the ProtocolId and ProtocolCode subfields." +
                            "\n" +
                            "D.3.2. Protocol-specific codes (ProtocolId and ProtocolCode) The protocol-specific portion of " +
                            "StatusReport messages is composed of a fully-qualified ProtocolId which qualifies the subsequent " +
                            "ProtocolCode space." +
                            "\n" +
                            "The ProtocolId is encoded as a 32 bit value of Protocol Vendor ID (upper 16 bits) and Protocol ID " +
                            "under that Protocol Vendor ID (lower 16 bits), similarly to how message Protocol ID and Protocol " +
                            "Vendor ID are encoded in the Protocol Header." +
                            "\n" +
                            "The following rules apply to the encoding of the ProtocolCode protocol-specific field:" +
                            "\n" +
                            "  - ProtocolCode value 0x0000 shall be reserved for use as success placeholder when either a " +
                            "GeneralCode of SUCCESS (0) or CONTINUE (10) are present." +
                            "\n" +
                            "  - ProtocolCode value 0xFFFF shall be reserved to indicate that no additional protocol-specific " +
                            "status code is available." +
                            "\n" +
                            "  - When the GeneralCode is FAILURE, the ProtocolCode value of 0xFFFF SHOULD NOT be used, since the " +
                            "conveyance of specific error codes assists in troubleshooting." +
                            "\n" +
                            "  - ProtocolCode values 0x0001 through 0xFFFE shall be used to convey protocol-specific status " +
                            "indications." +
                            "\n" +
                            "Since protocol-specific status reports are meant to convey more information than generic codes, it " +
                            "is recommended to always use a specific ProtocolCode value, rather than 0xFFFF, unless there are no " +
                            "additional details to convey." +
                            "\n" +
                            "### D.3.3. Protocol-specific data (ProtocolData)" +
                            "\n" +
                            "The ProtocolData portion of the StatusReport message is composed of all data beyond the ProtocolCode " +
                            "field. If a StatusReport message of size N octets is received, the first 8 octets of payload encode " +
                            "the GeneralCode, ProtocolId and ProtocolCode, while the remaining N - 8 bytes represent the " +
                            "protocol-specific ProtocolData." +
                            "\n" +
                            "Encoding of the ProtocolData portion of the payload depends on the ProtocolId and potentially " +
                            "ProtocolCode. To decode this data, the ProtocolId has to be examined and decoding shall be done " +
                            "according to that protocol specification. For example:" +
                            "\n" +
                            "  - A vendor-specific protocol would encode additional custom error metadata in the ProtocolData." +
                            "\n" +
                            "  - The Bulk transfer (BDX) protocol does not require additional error information and will always " +
                            "have ProtocolData empty." +
                            "\n" +
                            "D.4. Presenting StatusReport messages in protocol specifications In order to simplify referring to " +
                            "StatusReport messages, the following mnemonic encoding will be used in the descriptive text for a " +
                            "given protocol." +
                            "\n" +
                            "References to StatusReport messages take one of the following forms:" +
                            "\n" +
                            "  - No ProtocolData present:" +
                            "\n" +
                            "    - StatusReport(GeneralCode: <value>, ProtocolId: <value>, ProtocolCode: <value>)" +
                            "\n" +
                            "      - Example 1: StatusReport(GeneralCode: FAILURE, ProtocolId: BDX, ProtocolCode: " +
                            "START_OFFSET_NOT_SUPPORTED)" +
                            "\n" +
                            "        - Encodes as: 01 00 02 00 00 00 52 00" +
                            "\n" +
                            "      - Example 2: StatusReport(GeneralCode: SUCCESS, ProtocolId: {VendorID=0xFFF1, " +
                            "ProtocolId=0xAABB}, ProtocolCode: 0)" +
                            "\n" +
                            "        - Encodes as: 00 00 BB AA F1 FF 00 00" +
                            "\n" +
                            "  - Additional ProtocolData present:" +
                            "\n" +
                            "    - StatusReport(GeneralCode: <value>, ProtocolId: <value>, ProtocolCode: <value>, ProtocolData: " +
                            "<value>)" +
                            "\n" +
                            "      - Example: StatusReport(GeneralCode: FAILURE, ProtocolId: {VendorID=0xFFF1, " +
                            "ProtocolId=0xAABB}, ProtocolCode: 9921, ProtocolData: [0x55, 0x66, 0xEE, 0xFF])" +
                            "\n" +
                            "        - Encodes as: 01 00 BB AA F1 FF C1 26 55 66 EE FF" +
                            "\n" +
                            "Appendix E: Matter-Specific ASN.1 Object Identifiers (OIDs) Matter defines custom ASN.1 OID values, " +
                            "which are listed in the table below under the 1.3.6.1.4.1.37244 private arc. These OID values are " +
                            "assigned by the Connectivity Standards Alliance for use with Matter." +
                            "\n" +
                            "Appendix F: Cryptographic test vectors for some procedures" +
                            "\n" +
                            "### F.1. Certification Declaration CMS test vector" +
                            "\n" +
                            "This subsection contains worked examples of encoding a Certification Declaration, which is conveyed " +
                            "by the Attestation Information payload during the Device Attestation Procedure." +
                            "\n" +
                            "The Connectivity Standards Alliance CD signing certificate and associated private key which are " +
                            "provided in the vectors are only for exemplary purposes and are not official CD signing material." +
                            "\n" +
                            "The first example Certification Declaration has the following qualities:" +
                            "\n" +
                            "  - Both dac_origin_vendor_id and dac_origin_product_id are absent" +
                            "\n" +
                            "  - The product_id_array contains a single PID" +
                            "\n" +
                            "The content of this first example is" +
                            "\n" +
                            "===== Algorithm inputs ===== -> format_version = 1 -> vendor_id = 0xFFF1 -> product_id_array = [ " +
                            "0x8000 ] -> device_type_id = 0x1234 -> certificate_id = \"ZIG20141ZB330001-24\" -> security_level = 0 " +
                            "-> security_information = 0 -> version_number = 0x2694 -> certification_type = 0 -> " +
                            "dac_origin_vendor_id is not present -> dac_origin_product_id is not present -> authorized_paa_list " +
                            "is not present -> Sample Connectivity Standards Alliance CD Signing Certificate: -----BEGIN " +
                            "CERTIFICATE----- MIIBszCCAVqgAwIBAgIIRdrzneR6oI8wCgYIKoZIzj0EAwIwKzEpMCcGA1UEAwwg " +
                            "TWF0dGVyIFRlc3QgQ0QgU2lnbmluZyBBdXRob3JpdHkwIBcNMjEwNjI4MTQyMzQz " +
                            "WhgPOTk5OTEyMzEyMzU5NTlaMCsxKTAnBgNVBAMMIE1hdHRlciBUZXN0IENEIFNp " +
                            "Z25pbmcgQXV0aG9yaXR5MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEPDmJIkUr " +
                            "VcrzicJb0bykZWlSzLkOiGkkmthHRlMBTL+V1oeWXgNrUhxRA35rjO3vyh60QEZp " +
                            "T6CIgu7WUZ3suqNmMGQwEgYDVR0TAQH/BAgwBgEB/wIBATAOBgNVHQ8BAf8EBAMC " +
                            "AQYwHQYDVR0OBBYEFGL6gjNZrPqplj4c+hQK3fUE83FgMB8GA1UdIwQYMBaAFGL6 " +
                            "gjNZrPqplj4c+hQK3fUE83FgMAoGCCqGSM49BAMCA0cAMEQCICxUXOTkV9im8NnZ " +
                            "u+vW7OHd/n+MbZps83UyH8b6xxOEAiBUB3jodDlyUn7t669YaGIgtUB48s1OYqdq 58u5L/VMiw== -----END " +
                            "CERTIFICATE----- -> Sample Connectivity Standards Alliance CD Signing Private Key: -----BEGIN EC " +
                            "PRIVATE KEY----- MHcCAQEEIK7zSEEW6UgexXvgRy30G/SZBk5QJK2GnspeiJgC1IB1oAoGCCqGSM49 " +
                            "AwEHoUQDQgAEPDmJIkUrVcrzicJb0bykZWlSzLkOiGkkmthHRlMBTL+V1oeWXgNr " +
                            "UhxRA35rjO3vyh60QEZpT6CIgu7WUZ3sug== -----END EC PRIVATE KEY----- ===== Intermediate outputs ===== " +
                            "-> Encoded TLV of sample Certification Declaration (54 bytes): 00000000 15 24 00 01 25 01 f1 ff 36 " +
                            "02 05 00 80 18 25 03 |.$..%...6.....%.| 00000010 34 12 2c 04 13 5a 49 47 32 30 31 34 31 5a 42 33 " +
                            "|4.,..ZIG20141ZB3| 00000020 33 30 30 30 31 2d 32 34 24 05 00 24 06 00 25 07 |30001-24$..$..%.| " +
                            "00000030 94 26 24 08 00 18 |.&$...| 00000036 ===== Algorithm outputs ===== -> Encoded CMS SignedData " +
                            "of Certification Declaration (235 bytes): 00000000 30 81 e8 06 09 2a 86 48 86 f7 0d 01 07 02 a0 81 " +
                            "|0....*.H........| 00000010 da 30 81 d7 02 01 03 31 0d 30 0b 06 09 60 86 48 |.0.....1.0...`.H| " +
                            "00000020 01 65 03 04 02 01 30 45 06 09 2a 86 48 86 f7 0d |.e....0E..*.H...| 00000030 01 07 01 a0 38 " +
                            "04 36 15 24 00 01 25 01 f1 ff 36 |....8.6.$..%...6| 00000040 02 05 00 80 18 25 03 34 12 2c 04 13 5a " +
                            "49 47 32 |.....%.4.,..ZIG2| 00000050 30 31 34 31 5a 42 33 33 30 30 30 31 2d 32 34 24 " +
                            "|0141ZB330001-24$| 00000060 05 00 24 06 00 25 07 94 26 24 08 00 18 31 7c 30 |..$..%..&$...1|0| " +
                            "00000070 7a 02 01 03 80 14 62 fa 82 33 59 ac fa a9 96 3e |z.....b..3Y....>| 00000080 1c fa 14 0a dd " +
                            "f5 04 f3 71 60 30 0b 06 09 60 86 |........q`0...`.| 00000090 48 01 65 03 04 02 01 30 0a 06 08 2a 86 " +
                            "48 ce 3d |H.e....0...*.H.=| 000000a0 04 03 02 04 46 30 44 02 20 43 a6 3f 2b 94 3d f3 |....F0D. " +
                            "C.?+.=.| 000000b0 3c 38 b3 e0 2f ca a7 5f e3 53 2a eb bf 5e 63 f5 |<8../.._.S*..^c.| 000000c0 bb db " +
                            "c0 b1 f0 1d 3c 4f 60 02 20 4c 1a bf 5f 18 |......<O`. L.._.| 000000d0 07 b8 18 94 b1 57 6c 47 e4 72 " +
                            "4e 4d 96 6c 61 2e |.....WlG.rNM.la.| 000000e0 d3 fa 25 c1 18 c3 f2 b3 f9 03 69 |..%.......i| " +
                            "000000eb" +
                            "\n" +
                            "The second example Certification Declaration has the following qualities:" +
                            "\n" +
                            "  - Both dac_origin_vendor_id and dac_origin_product_id are present" +
                            "\n" +
                            "  - The product_id_array contains a two PIDs (0x8001, 0x8002)" +
                            "\n" +
                            "  - It uses the authorized_paa_list to indicate the Subject Key Identifier (SKI) extension value of " +
                            "the expected PAA in the certificate chain of the Device Attestation Certificate for a product " +
                            "carrying this Certification Declaration" +
                            "\n" +
                            "The content of this second example is" +
                            "\n" +
                            "### F.2. Device Attestation Response test vector" +
                            "\n" +
                            "This subsection contains a worked example of the Attestation Information to be generated in the " +
                            "AttestationResponse Command when executing the Device Attestation Procedure." +
                            "\n" +
                            "The Device Attestation key pair shown is an example, not to be reused in implementations." +
                            "\n" +
                            "> [!NOTE]" +
                            "\n" +
                            "> This test vector does NOT contain the optional Firmware Information payload. It is omitted." +
                            "\n" +
                            "### F.3. Node Operational CSR Response test vector" +
                            "\n" +
                            "This subsection contains a worked example of the NOCSR Information to be generated in the " +
                            "CSRResponse Command when executing the Node Operational CSR Procedure." +
                            "\n" +
                            "The CSR shown is valid for the provided Node Operational public key." +
                            "\n" +
                            "The Device Attestation key pair shown is an example, not to be reused in implementations." +
                            "\n" +
                            "===== Algorithm inputs ===== -> CSRNonce: " +
                            "81:4a:4d:4c:1c:4a:8e:bb:ea:db:0a:e2:82:f9:91:eb:13:ac:5f:9f:ce:94:30:93:19:aa:94:09:6c:8c:d4:b8 -> " +
                            "Attestation challenge (example): 7a:49:53:05:d0:77:79:a4:94:dd:39:a0:85:1b:66:0d -> Device " +
                            "attestation private key (example): " +
                            "38:f3:e0:a1:f1:45:ba:1b:f3:e4:4b:55:2d:ef:65:27:3d:1d:8e:27:6a:a3:14:ac:74:2e:b1:28:93:3b:a6:4b " +
                            "-----BEGIN EC PRIVATE KEY----- MHcCAQEEIDjz4KHxRbob8+RLVS3vZSc9HY4naqMUrHQusSiTO6ZLoAoGCCqGSM49 " +
                            "AwEHoUQDQgAEzlz477BdTu55DQpx1cARu3RyQNuiFFiEXTPjSwr2ZRYzBjqASy/4 " +
                            "XcqyAZoKtvVZV3X+jYX716B8joN9pNWouQ== -----END EC PRIVATE KEY----- -> Device attestation public key " +
                            "(example): " +
                            "04:ce:5c:f8:ef:b0:5d:4e:ee:79:0d:0a:71:d5:c0:11:bb:74:72:40:db:a2:14:58:84:5d:33:e3:4b:0a:f6:65:16:33:06:3a:80:4b:2f:f8:5d:ca:b2:01:9a:0a:b6:f5:59:57:75:fe:8d:85:fb:d7:a0:7c:8e:83:7d:a4:d5:a8:b9 " +
                            "-----BEGIN PUBLIC KEY----- MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEzlz477BdTu55DQpx1cARu3RyQNui " +
                            "FFiEXTPjSwr2ZRYzBjqASy/4XcqyAZoKtvVZV3X+jYX716B8joN9pNWouQ== -----END PUBLIC KEY----- ===== " +
                            "Intermediate outputs ===== -> Candidate Operational Private Key: " +
                            "1c:18:82:e8:7f:80:d8:1a:25:9a:62:b6:ea:02:db:08:17:e2:10:68:46:84:2b:eb:3a:ab:c2:53:86:a9:1e:89 " +
                            "-----BEGIN EC PRIVATE KEY----- MHcCAQEEIBwYguh/gNgaJZpituoC2wgX4hBoRoQr6zqrwlOGqR6JoAoGCCqGSM49 " +
                            "AwEHoUQDQgAEXKJ542aCwtRs59TPiWeEZwi1ufhbnNr9jKiFJhLLDwx6cTFOyNyc " +
                            "ljTd7v7p9j8Oi9faz8O2pFMqrdiallHNbg== -----END EC PRIVATE KEY----- -> Candidate Operational Public " +
                            "Key: " +
                            "04:5c:a2:79:e3:66:82:c2:d4:6c:e7:d4:cf:89:67:84:67:08:b5:b9:f8:5b:9c:da:fd:8c:a8:85:26:12:cb:0f:0c:7a:71:31:4e:c8:dc:9c:96:34:dd:ee:fe:e9:f6:3f:0e:8b:d7:da:cf:c3:b6:a4:53:2a:ad:d8:9a:96:51:cd:6e " +
                            "-----BEGIN PUBLIC KEY----- MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEXKJ542aCwtRs59TPiWeEZwi1ufhb " +
                            "nNr9jKiFJhLLDwx6cTFOyNycljTd7v7p9j8Oi9faz8O2pFMqrdiallHNbg== -----END PUBLIC KEY----- Certificate " +
                            "Request: Data: Version: 1 (0x0) Subject: O = CSA Subject Public Key Info: Public Key Algorithm: " +
                            "id-ecPublicKey Public-Key: (256 bit) pub: 04:5c:a2:79:e3:66:82:c2:d4:6c:e7:d4:cf:89:67: " +
                            "84:67:08:b5:b9:f8:5b:9c:da:fd:8c:a8:85:26:12: cb:0f:0c:7a:71:31:4e:c8:dc:9c:96:34:dd:ee:fe: " +
                            "e9:f6:3f:0e:8b:d7:da:cf:c3:b6:a4:53:2a:ad:d8: 9a:96:51:cd:6e ASN1 OID: prime256v1 NIST CURVE: P-256 " +
                            "Attributes: Requested Extensions: Signature Algorithm: ecdsa-with-SHA256 " +
                            "30:45:02:20:0e:67:5e:e1:b3:bb:fe:15:2a:17:4a:f5:35:e2: " +
                            "2d:55:ce:10:c1:50:ca:c0:1b:31:18:de:05:e8:fd:9f:10:48: " +
                            "02:21:00:d8:8c:57:cc:6e:74:f0:e5:48:8a:26:16:7a:07:fd: " +
                            "6d:be:f1:aa:ad:72:1c:58:0b:6e:ae:21:be:5e:6d:0c:72 -> CSR bytes DER: 00000000 30 81 da 30 81 81 02 " +
                            "01 00 30 0e 31 0c 30 0a 06 |0..0.....0.1.0..| 00000010 03 55 04 0a 0c 03 43 53 41 30 59 30 13 06 07 " +
                            "2a |.U....CSA0Y0...*| 00000020 86 48 ce 3d 02 01 06 08 2a 86 48 ce 3d 03 01 07 |.H.=....*.H.=...| " +
                            "00000030 03 42 00 04 5c a2 79 e3 66 82 c2 d4 6c e7 d4 cf |.B..\\.y.f...l...| 00000040 89 67 84 67 08 " +
                            "b5 b9 f8 5b 9c da fd 8c a8 85 26 |.g.g....[......&| 00000050 12 cb 0f 0c 7a 71 31 4e c8 dc 9c 96 34 " +
                            "dd ee fe |....zq1N....4...| 00000060 e9 f6 3f 0e 8b d7 da cf c3 b6 a4 53 2a ad d8 9a " +
                            "|..?........S*...| 00000070 96 51 cd 6e a0 11 30 0f 06 09 2a 86 48 86 f7 0d |.Q.n..0...*.H...| " +
                            "00000080 01 09 0e 31 02 30 00 30 0a 06 08 2a 86 48 ce 3d |...1.0.0...*.H.=| 00000090 04 03 02 03 48 " +
                            "00 30 45 02 20 0e 67 5e e1 b3 bb |....H.0E. .g^...| 000000a0 fe 15 2a 17 4a f5 35 e2 2d 55 ce 10 c1 " +
                            "50 ca c0 |..*.J.5.-U...P..| 000000b0 1b 31 18 de 05 e8 fd 9f 10 48 02 21 00 d8 8c 57 " +
                            "|.1.......H.!...W| 000000c0 cc 6e 74 f0 e5 48 8a 26 16 7a 07 fd 6d be f1 aa |.nt..H.&.z..m...| " +
                            "000000d0 ad 72 1c 58 0b 6e ae 21 be 5e 6d 0c 72 |.r.X.n.!.^m.r| 000000dd -> Sample vendor_reserved1: " +
                            "73:61:6d:70:6c:65:5f:76:65:6e:64:6f:72:5f:72:65:73:65:72:76:65:64:31 -> Sample vendor_reserved3: " +
                            "76:65:6e:64:6f:72:5f:72:65:73:65:72:76:65:64:33:5f:65:78:61:6d:70:6c:65 -> nocsr_elements_message: " +
                            "00000000 15 30 01 dd 30 81 da 30 81 81 02 01 00 30 0e 31 |.0..0..0.....0.1| 00000010 0c 30 0a 06 03 " +
                            "55 04 0a 0c 03 43 53 41 30 59 30 |.0...U....CSA0Y0| 00000020 13 06 07 2a 86 48 ce 3d 02 01 06 08 2a " +
                            "86 48 ce |...*.H.=....*.H.| 00000030 3d 03 01 07 03 42 00 04 5c a2 79 e3 66 82 c2 d4 " +
                            "|=....B..\\.y.f...| 00000040 6c e7 d4 cf 89 67 84 67 08 b5 b9 f8 5b 9c da fd |l....g.g....[...| " +
                            "00000050 8c a8 85 26 12 cb 0f 0c 7a 71 31 4e c8 dc 9c 96 |...&....zq1N....| 00000060 34 dd ee fe e9 " +
                            "f6 3f 0e 8b d7 da cf c3 b6 a4 53 |4.....?........S| 00000070 2a ad d8 9a 96 51 cd 6e a0 11 30 0f 06 " +
                            "09 2a 86 |*....Q.n..0...*.| 00000080 48 86 f7 0d 01 09 0e 31 02 30 00 30 0a 06 08 2a " +
                            "|H......1.0.0...*| 00000090 86 48 ce 3d 04 03 02 03 48 00 30 45 02 20 0e 67 |.H.=....H.0E. .g| " +
                            "000000a0 5e e1 b3 bb fe 15 2a 17 4a f5 35 e2 2d 55 ce 10 |^.....*.J.5.-U..| 000000b0 c1 50 ca c0 1b " +
                            "31 18 de 05 e8 fd 9f 10 48 02 21 |.P...1.......H.!| 000000c0 00 d8 8c 57 cc 6e 74 f0 e5 48 8a 26 16 " +
                            "7a 07 fd |...W.nt..H.&.z..| 000000d0 6d be f1 aa ad 72 1c 58 0b 6e ae 21 be 5e 6d 0c " +
                            "|m....r.X.n.!.^m.| 000000e0 72 30 02 20 81 4a 4d 4c 1c 4a 8e bb ea db 0a e2 |r0. .JML.J......| " +
                            "000000f0 82 f9 91 eb 13 ac 5f 9f ce 94 30 93 19 aa 94 09 |......_...0.....| 00000100 6c 8c d4 b8 30 " +
                            "03 17 73 61 6d 70 6c 65 5f 76 65 |l...0..sample_ve| 00000110 6e 64 6f 72 5f 72 65 73 65 72 76 65 64 " +
                            "31 30 05 |ndor_reserved10.| 00000120 18 76 65 6e 64 6f 72 5f 72 65 73 65 72 76 65 64 " +
                            "|.vendor_reserved| 00000130 33 5f 65 78 61 6d 70 6c 65 18 |3_example.| 0000013a -> nocsr_tbs (NOT " +
                            "sent over the wire): 00000000 15 30 01 dd 30 81 da 30 81 81 02 01 00 30 0e 31 |.0..0..0.....0.1| " +
                            "00000010 0c 30 0a 06 03 55 04 0a 0c 03 43 53 41 30 59 30 |.0...U....CSA0Y0| 00000020 13 06 07 2a 86 " +
                            "48 ce 3d 02 01 06 08 2a 86 48 ce |...*.H.=....*.H.| 00000030 3d 03 01 07 03 42 00 04 5c a2 79 e3 66 " +
                            "82 c2 d4 |=....B..\\.y.f...| 00000040 6c e7 d4 cf 89 67 84 67 08 b5 b9 f8 5b 9c da fd " +
                            "|l....g.g....[...| 00000050 8c a8 85 26 12 cb 0f 0c 7a 71 31 4e c8 dc 9c 96 |...&....zq1N....| " +
                            "00000060 34 dd ee fe e9 f6 3f 0e 8b d7 da cf c3 b6 a4 53 |4.....?........S| 00000070 2a ad d8 9a 96 " +
                            "51 cd 6e a0 11 30 0f 06 09 2a 86 |*....Q.n..0...*.| 00000080 48 86 f7 0d 01 09 0e 31 02 30 00 30 0a " +
                            "06 08 2a |H......1.0.0...*| 00000090 86 48 ce 3d 04 03 02 03 48 00 30 45 02 20 0e 67 |.H.=....H.0E. " +
                            ".g| 000000a0 5e e1 b3 bb fe 15 2a 17 4a f5 35 e2 2d 55 ce 10 |^.....*.J.5.-U..| 000000b0 c1 50 ca c0 " +
                            "1b 31 18 de 05 e8 fd 9f 10 48 02 21 |.P...1.......H.!| 000000c0 00 d8 8c 57 cc 6e 74 f0 e5 48 8a 26 " +
                            "16 7a 07 fd |...W.nt..H.&.z..| 000000d0 6d be f1 aa ad 72 1c 58 0b 6e ae 21 be 5e 6d 0c " +
                            "|m....r.X.n.!.^m.| 000000e0 72 30 02 20 81 4a 4d 4c 1c 4a 8e bb ea db 0a e2 |r0. .JML.J......| " +
                            "000000f0 82 f9 91 eb 13 ac 5f 9f ce 94 30 93 19 aa 94 09 |......_...0.....| 00000100 6c 8c d4 b8 30 " +
                            "03 17 73 61 6d 70 6c 65 5f 76 65 |l...0..sample_ve| 00000110 6e 64 6f 72 5f 72 65 73 65 72 76 65 64 " +
                            "31 30 05 |ndor_reserved10.| 00000120 18 76 65 6e 64 6f 72 5f 72 65 73 65 72 76 65 64 " +
                            "|.vendor_reserved| 00000130 33 5f 65 78 61 6d 70 6c 65 18 7a 49 53 05 d0 77 |3_example.zIS..w| " +
                            "00000140 79 a4 94 dd 39 a0 85 1b 66 0d |y...9...f.| 0000014a -> SHA-256 of nocsr_tbs used for " +
                            "signature (NOT sent over the wire): " +
                            "e2:62:65:69:65:2b:49:e1:5b:6e:d5:b2:42:92:bf:28:e8:e0:e9:5d:e4:25:14:e1:03:a4:30:30:18:16:cf:3f -> " +
                            "Fixed K for sample signature of nocsr_tbs: " +
                            "a9:c0:d7:f2:b5:1f:51:e3:75:05:3d:c7:0e:53:f5:4e:b1:86:59:c7:d2:99:47:94:f6:8d:b5:08:bb:53:05:5f -> " +
                            "Attestation signature: " +
                            "87:8e:46:cf:fa:83:c8:32:96:eb:27:2e:bc:37:1c:1f:ef:ee:6d:69:54:f3:78:9f:d3:d2:27:e1:64:13:d3:d4:75:a6:2f:d0:12:b9:19:d9:95:8b:c7:3d:7c:63:b3:cc:1e:f2:b6:2c:18:e0:cc:10:2e:d1:ba:4d:ac:85:fe:ea " +
                            "===== Algorithm outputs ===== -> NOCSRElements field of CSRResponse (len 314 bytes): 00000000 15 30 " +
                            "01 dd 30 81 da 30 81 81 02 01 00 30 0e 31 |.0..0..0.....0.1| 00000010 0c 30 0a 06 03 55 04 0a 0c 03 " +
                            "43 53 41 30 59 30 |.0...U....CSA0Y0| 00000020 13 06 07 2a 86 48 ce 3d 02 01 06 08 2a 86 48 ce " +
                            "|...*.H.=....*.H.| 00000030 3d 03 01 07 03 42 00 04 5c a2 79 e3 66 82 c2 d4 |=....B..\\.y.f...| " +
                            "00000040 6c e7 d4 cf 89 67 84 67 08 b5 b9 f8 5b 9c da fd |l....g.g....[...| 00000050 8c a8 85 26 12 " +
                            "cb 0f 0c 7a 71 31 4e c8 dc 9c 96 |...&....zq1N....| 00000060 34 dd ee fe e9 f6 3f 0e 8b d7 da cf c3 " +
                            "b6 a4 53 |4.....?........S| 00000070 2a ad d8 9a 96 51 cd 6e a0 11 30 0f 06 09 2a 86 " +
                            "|*....Q.n..0...*.| 00000080 48 86 f7 0d 01 09 0e 31 02 30 00 30 0a 06 08 2a |H......1.0.0...*| " +
                            "00000090 86 48 ce 3d 04 03 02 03 48 00 30 45 02 20 0e 67 |.H.=....H.0E. .g| 000000a0 5e e1 b3 bb fe " +
                            "15 2a 17 4a f5 35 e2 2d 55 ce 10 |^.....*.J.5.-U..| 000000b0 c1 50 ca c0 1b 31 18 de 05 e8 fd 9f 10 " +
                            "48 02 21 |.P...1.......H.!| 000000c0 00 d8 8c 57 cc 6e 74 f0 e5 48 8a 26 16 7a 07 fd " +
                            "|...W.nt..H.&.z..| 000000d0 6d be f1 aa ad 72 1c 58 0b 6e ae 21 be 5e 6d 0c |m....r.X.n.!.^m.| " +
                            "000000e0 72 30 02 20 81 4a 4d 4c 1c 4a 8e bb ea db 0a e2 |r0. .JML.J......| 000000f0 82 f9 91 eb 13 " +
                            "ac 5f 9f ce 94 30 93 19 aa 94 09 |......_...0.....| 00000100 6c 8c d4 b8 30 03 17 73 61 6d 70 6c 65 " +
                            "5f 76 65 |l...0..sample_ve| 00000110 6e 64 6f 72 5f 72 65 73 65 72 76 65 64 31 30 05 " +
                            "|ndor_reserved10.| 00000120 18 76 65 6e 64 6f 72 5f 72 65 73 65 72 76 65 64 |.vendor_reserved| " +
                            "00000130 33 5f 65 78 61 6d 70 6c 65 18 |3_example.| 0000013a -> AttestationSignature field of " +
                            "CSRResponse (len 64 bytes): 00000000 87 8e 46 cf fa 83 c8 32 96 eb 27 2e bc 37 1c 1f " +
                            "|..F....2..'..7..| 00000010 ef ee 6d 69 54 f3 78 9f d3 d2 27 e1 64 13 d3 d4 |..miT.x...'.d...| " +
                            "00000020 75 a6 2f d0 12 b9 19 d9 95 8b c7 3d 7c 63 b3 cc |u./........=|c..| 00000030 1e f2 b6 2c 18 " +
                            "e0 cc 10 2e d1 ba 4d ac 85 fe ea |...,.......M....| 00000040" +
                            "\n" +
                            "### F.4. Check-In Protocol test vectors" +
                            "\n" +
                            "This subsection contains worked examples of the Check-In Protocol encryption and decryption." +
                            "\n" +
                            "### Test 1" +
                            "\n" +
                            "===== Encryption algorithm inputs ===== -> Symmetric Key: " +
                            "d9:0e:13:18:0d:00:ba:ad:d2:0c:f5:ed:49:13:d3:ff -> Server counter: 0c:00:00:00 -> Application data : " +
                            "'' ===== Intermediate outputs ===== -> generated Nonce: 45:80:d2:c6:f1:31:0d:c4:eb:64:f1:f8:e8 -> " +
                            "Ciphertext: bd:c2:1f:b5 -> Tag: 19:5d:74:7d:d2:87:9b:2b:0d:43:ce:5b:1c:56:50:78 ===== Encryption " +
                            "algorithm outputs ===== -> Check-in message payload : " +
                            "45:80:d2:c6:f1:31:0d:c4:eb:64:f1:f8:e8:bd:c2:1f:b5:19:5d:74:7d:d2:87:9b:2b:0d:43:ce:5b:1c:56:50:78" +
                            "\n" +
                            "===== Decryption algorithm inputs ===== -> Check-in message payload : " +
                            "45:80:d2:c6:f1:31:0d:c4:eb:64:f1:f8:e8:bd:c2:1f:b5:19:5d:74:7d:d2:87:9b:2b:0d:43:ce:5b:1c:56:50:78 " +
                            "-> Symmetric Key: d9:0e:13:18:0d:00:ba:ad:d2:0c:f5:ed:49:13:d3:ff -> Client counter: 0b:00:00:00 " +
                            "===== Decryption algorithm outputs ===== -> Received counter: 0c:00:00:00 -> Application data : '' " +
                            "-> Valid Check-In message" +
                            "\n" +
                            "### Test 2" +
                            "\n" +
                            "===== Encryption algorithm inputs ===== -> Symmetric Key: " +
                            "18:fd:bc:ea:ef:01:95:5b:0e:c8:75:ed:a3:ae:6e:e8 -> Server counter: 0f:00:00:00 -> Application data : " +
                            "'This' ===== Intermediate outputs ===== -> generated Nonce: 9b:02:ed:21:ee:0c:7b:49:19:85:50:2e:37 " +
                            "-> Ciphertext: 2d:bd:7b:3f:8b:4f:8e:3c -> Tag: 5a:d9:94:19:38:9f:41:a8:d6:09:93:8c:67:a8:6d:65 ===== " +
                            "Encryption algorithm outputs ===== -> Check-in message payload : " +
                            "9b:02:ed:21:ee:0c:7b:49:19:85:50:2e:37:2d:bd:7b:3f:8b:4f:8e:3c:5a:d9:94:19:38:9f:41:a8:d6:09:93:8c:67:a8:6d:65" +
                            "\n" +
                            "===== Decryption algorithm inputs ===== -> Check-in message payload : " +
                            "9b:02:ed:21:ee:0c:7b:49:19:85:50:2e:37:2d:bd:7b:3f:8b:4f:8e:3c:5a:d9:94:19:38:9f:41:a8:d6:09:93:8c:67:a8:6d:65 " +
                            "-> Symmetric Key: 18:fd:bc:ea:ef:01:95:5b:0e:c8:75:ed:a3:ae:6e:e8 -> Client counter: 0b:00:00:00 " +
                            "===== Decryption algorithm outputs ===== -> Received counter: 0f:00:00:00 -> Application data : " +
                            "'This' -> Valid Check-In message" +
                            "\n" +
                            "### Test 3" +
                            "\n" +
                            "===== Encryption algorithm inputs ===== -> Symmetric Key: " +
                            "d9:0e:13:18:0d:00:ba:ad:d2:0c:f5:ed:49:13:d3:ff -> Server counter: 0b:00:00:00 -> Application data : " +
                            "'This is a' ===== Intermediate outputs ===== -> generated Nonce: " +
                            "aa:84:bc:60:88:6a:63:a8:47:5d:5d:be:b5 -> Ciphertext: 6d:63:5f:a9:52:85:ae:33:62:66:13:c7:63 -> Tag: " +
                            "6c:e3:e3:b2:a8:b1:3a:8c:89:be:f7:68:91:e8:e2:96 ===== Encryption algorithm outputs ===== -> Check-in " +
                            "message payload : " +
                            "aa:84:bc:60:88:6a:63:a8:47:5d:5d:be:b5:6d:63:5f:a9:52:85:ae:33:62:66:13:c7:63:6c:e3:e3:b2:a8:b1:3a:8c:89:be:f7:68:91:e8:e2:96" +
                            "\n" +
                            "===== Decryption algorithm inputs ===== -> Check-in message payload : " +
                            "aa:84:bc:60:88:6a:63:a8:47:5d:5d:be:b5:6d:63:5f:a9:52:85:ae:33:62:66:13:c7:63:6c:e3:e3:b2:a8:b1:3a:8c:89:be:f7:68:91:e8:e2:96 " +
                            "-> Symmetric Key: d9:0e:13:18:0d:00:ba:ad:d2:0c:f5:ed:49:13:d3:ff -> Client counter: 0b:00:00:00 " +
                            "===== Decryption algorithm outputs ===== -> Received counter: 0b:00:00:00 -> Application data : " +
                            "'This is a' -> Invalid Check-In message - Received counter has already been used" +
                            "\n" +
                            "### Test 4" +
                            "\n" +
                            "===== Encryption algorithm inputs ===== -> Symmetric Key: " +
                            "ca:67:d4:1f:f7:11:29:10:fd:d1:8a:1b:f9:9e:a9:74 -> Server counter: 0b:00:00:00 -> Application data : " +
                            "'This is a longer' ===== Intermediate outputs ===== -> generated Nonce: " +
                            "7a:97:72:24:3c:97:c8:7d:5f:3a:31:c4:e6 -> Ciphertext: " +
                            "db:bc:1a:a5:66:c4:43:c2:05:86:06:6b:42:7b:fc:aa:ad:78:da:4a -> Tag: " +
                            "10:5a:13:42:ad:bf:3f:47:98:cd:81:b9:ef:97:bb:b7 ===== Encryption algorithm outputs ===== -> Check-in " +
                            "message payload : " +
                            "7a:97:72:24:3c:97:c8:7d:5f:3a:31:c4:e6:db:bc:1a:a5:66:c4:43:c2:05:86:06:6b:42:7b:fc:aa:ad:78:da:4a:10:5a:13:42:ad:bf:3f:47:98:cd:81:b9:ef:97:bb:b7" +
                            "\n" +
                            "===== Decryption algorithm inputs ===== -> Check-in message payload " +
                            ":7a:97:72:24:3c:97:c8:7d:5f:3a:31:c4:e6:db:bc:1a:a5:66:c4:43:c2:05:86:06:6b:42:7b:fc:aa:ad:78:da:4a:10:5a:13:42:ad:bf:3f:47:98:cd:81:b9:ef:97:bb:b7 " +
                            "-> Symmetric Key: ca:67:d4:1f:f7:11:29:10:fd:d1:8a:1b:f9:9e:a9:74 -> Client counter: 0f:00:00:00 " +
                            "===== Decryption algorithm outputs ===== -> Received counter: 0b:00:00:00 -> Application data : " +
                            "'This is a longer' -> Invalid Check-In message - Received counter has already been used" +
                            "\n" +
                            "### Test 5" +
                            "\n" +
                            "This test only had decryption processing because it tests the nonce validation that only applies to " +
                            "the decryption process." +
                            "\n" +
                            "===== Decryption algorithm inputs ===== -> Check-in message payload : " +
                            "f9:34:67:6e:a6:e0:70:7b:7a:d7:81:4f:f8:2e:5b:18:d1:9a:23:b2:e4:fa:df:82:92:53:51:7f:f3:c9:1d:8d:47:84:31:5a:1e:32:08:b8:ec:f6:11:8b:02:1a:5a:4c:d4:e9:d4:13:8d:ff:29:71 " +
                            "-> Symmetric Key: ca:67:d4:1f:f7:11:29:10:fd:d1:8a:1b:f9:9e:a9:74 -> Client counter: 0b:00:00:00 " +
                            "===== Decryption algorithm outputs ===== -> Failed to decrypt Check-In message." +
                            "\n" +
                            "### Test 6" +
                            "\n" +
                            "This test only had decryption processing because it tests the nonce validation that only applies to " +
                            "the decryption process." +
                            "\n" +
                            "===== Decryption algorithm inputs ===== -> Check-in message payload : " +
                            "06:34:67:6e:a6:e0:70:7b:7a:d7:81:4f:f8:29:5b:18:d1:9a:23:b2:e4:fa:df:82:92:53:51:7f:f3:c9:1d:8d:47:84:2e:41:02:3c:03:ad:66:ac:4d:ca:72:47:e0:e4:c6:6b:d9:d3:99:13:e2:3d:82:32:b9:61:fa:92:26 " +
                            "-> Symmetric Key: ca:67:d4:1f:f7:11:29:10:fd:d1:8a:1b:f9:9e:a9:74 -> Client counter: 0f:00:00:00 " +
                            "===== Decryption algorithm outputs ===== -> Received counter: 0b:00:00:00 -> Application data : " +
                            "'This is a longer longer string' -> Invalid Check-In message - Nonce and received counter do not " +
                            "match." +
                            "\n" +
                            "F.5. Fabric Table Vendor ID Verification Procedure Test Vector This subsection contains a worked " +
                            "example of the Fabric Table Vendor ID Verification Procedure." +
                            "\n" +
                            "All key pairs used are examples, not to be reused in implementations." +
                            "\n" +
                            "### Appendix G: Minimal Resource Requirements" +
                            "\n" +
                            "This is a list of various resources required by a Node implementation, along with references to " +
                            "where the minimal requirements for each resource type are defined."
                    }
                ]
            },

            {
                tag: "datatype", name: "TLSEndpointID", xref: "core§14.5.4.1",
                details: "This data type is derived from uint16 and represents a provisioned endpoint with valid values from 0 " +
                    "to 65534. This value SHOULD start at 0 and monotonically increase by 1 with each new allocation " +
                    "provisioned by the Node. A value incremented past 65534 SHOULD wrap to 0. The Node shall verify that " +
                    "a new value does not match any other value for this type. If such a match is found, the value shall " +
                    "be changed until a unique value is found."
            },

            {
                tag: "datatype", name: "TLSEndpointStruct", xref: "core§14.5.4.2",
                details: "This struct encodes details about a TLS Endpoint.",

                children: [
                    {
                        tag: "field", name: "EndpointId", xref: "core§14.5.4.2.1",
                        details: "This field shall represent the unique TLS Endpoint ID."
                    },
                    {
                        tag: "field", name: "Hostname", xref: "core§14.5.4.2.2",
                        details: "This field shall represent a TLS Hostname."
                    },
                    {
                        tag: "field", name: "Port", xref: "core§14.5.4.2.3",
                        details: "This field shall represent a TLS Port Number."
                    },
                    {
                        tag: "field", name: "Caid", xref: "core§14.5.4.2.4",
                        details: "This field shall be a TLSCAID representing the associated Certificate Authority ID."
                    },
                    {
                        tag: "field", name: "Ccdid", xref: "core§14.5.4.2.5",
                        details: "This field shall be a TLSCCDID representing the associated Client Certificate Details ID. A NULL " +
                            "value means no client certificate is used with this endpoint."
                    },

                    {
                        tag: "field", name: "ReferenceCount", xref: "core§14.5.4.2.6",
                        details: "This field shall indicate a reference count of the number of entities currently using this TLS " +
                            "Endpoint. The node shall recompute this field to reflect the correct value at runtime (e.g., when " +
                            "restored from a persisted value after a reboot)."
                    }
                ]
            },

            {
                tag: "datatype", name: "StatusCodeEnum", xref: "core§14.5.5.1",

                children: [
                    { tag: "field", name: "EndpointAlreadyInstalled", description: "The endpoint is already installed." },
                    {
                        tag: "field", name: "RootCertificateNotFound",
                        description: "No root certificate exists for this CAID."
                    },
                    {
                        tag: "field", name: "ClientCertificateNotFound",
                        description: "No client certificate exists for this CCDID."
                    },
                    { tag: "field", name: "EndpointInUse", description: "The endpoint is in use and cannot be removed." },
                    { tag: "field", name: "InvalidTime", description: "Time sync has not yet occurred." }
                ]
            }
        ]
    }
);
