/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Command, TlvNoResponse } from "../cluster/Cluster.js";
import { TlvField, TlvOptionalField, TlvObject } from "../tlv/TlvObject.js";
import { TlvVendorId } from "../datatype/VendorId.js";
import { TlvUInt16, TlvUInt32, TlvEnum } from "../tlv/TlvNumber.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvString, TlvByteString } from "../tlv/TlvString.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { StatusResponseError } from "../common/StatusResponseError.js";
import { Status as GlobalStatus } from "../globals/Status.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace OtaSoftwareUpdateProvider {
    /**
     * Note that only HTTP over TLS (HTTPS) is supported (see RFC 7230). Using HTTP without TLS shall NOT be supported,
     * as there is no way to authenticate the involved participants.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.6.4.3
     */
    export enum DownloadProtocol {
        /**
         * Indicates support for synchronous BDX.
         */
        BdxSynchronous = 0,

        /**
         * Indicates support for asynchronous BDX.
         */
        BdxAsynchronous = 1,

        /**
         * Indicates support for HTTPS.
         */
        Https = 2,

        /**
         * Indicates support for vendor specific protocol.
         */
        VendorSpecific = 3
    }

    /**
     * Input to the OtaSoftwareUpdateProvider queryImage command
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.1
     */
    export const TlvQueryImageRequest = TlvObject({
        /**
         * The value shall be the Vendor ID applying to the OTA Requestor’s Node and shall match the value reported by
         * the Basic Information Cluster VendorID attribute.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.1.1
         */
        vendorId: TlvField(0, TlvVendorId),

        /**
         * The value shall be the Product ID applying to the OTA Requestor’s Node and shall match the value reported by
         * the Basic Information Cluster ProductID attribute.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.1.2
         */
        productId: TlvField(1, TlvUInt16),

        /**
         * The SoftwareVersion included in the request payload shall provide the value representing the current version
         * running on the OTA Requestor invoking the command. This version shall be equal to the Software Version
         * attribute of the Basic Information Cluster.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.1.3
         */
        softwareVersion: TlvField(2, TlvUInt32),

        /**
         * This field shall contain a list of all download protocols supported by the OTA Requestor.
         *
         * This field shall be used by the OTA Provider to generate the correct URI for the location of the Software
         * Image when one is found to be available. The values of BDX Synchronous and BDX Asynchronous shall always be
         * supported by an OTA Provider. Furthermore, OTA Providers with access to external networking SHOULD support
         * the HTTPS protocol. OTA Providers may support other protocols.
         *
         * The algorithm to select the specific protocol to use in a given Software Image URI is
         * implementation-dependent, provided that the rules in Section 11.20.3.3.1, “Download Protocol selection” are
         * followed.
         *
         * See Section 11.20.3.2, “Querying the OTA Provider” and Section 11.20.3.5, “Transfer of OTA Software Update
         * images” for more details about usage of this field.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.1.4
         */
        protocolsSupported: TlvField(3, TlvArray(TlvEnum<DownloadProtocol>(), { maxLength: 8 })),

        /**
         * The value of this field, if present, shall contain the OTA Requestor’s hardware version, and shall be equal
         * to the HardwareVersion attribute of the Basic Information Cluster.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.1.5
         */
        hardwareVersion: TlvOptionalField(4, TlvUInt16),

        /**
         * The location, if present, shall provide the same value as the Basic Information Cluster Location attribute
         * for the OTA Requestor as configured. This may be used by the OTA Provider logic to allow per-region selection
         * of the Software Image.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.1.6
         */
        location: TlvOptionalField(5, TlvString.bound({ length: 2 })),

        /**
         * This field shall be set to true by an OTA Requestor that is capable of obtaining user consent for OTA
         * application by virtue of built-in user interface capabilities. Otherwise, it shall be false.
         *
         * See Section 11.20.3.4, “Obtaining user consent for updating software” for application details about usage.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.1.7
         */
        requestorCanConsent: TlvOptionalField(6, TlvBoolean),

        /**
         * This optional field, if present, shall consist of a top-level anonymous list; each list element shall have a
         * profile-specific tag encoded in fully-qualified form. Each list element shall contain a manufacturer-specific
         * payload, which the OTA Requestor invoking this command wants to expose to the receiving OTA Provider. This
         * payload may be used for any purpose and SHOULD be as small as practical.
         *
         * The use of this field SHOULD be restricted to Vendor-specific usage and shall NOT be used as a selector
         * required to match for the selection of a Software Image in production environments, unless absolutely
         * necessary, as the interpretation of this field may be ambiguous to OTA Providers implementing the Cluster in
         * a compliant but divergent way from the sender.
         *
         * An example of usage for this field is for an OTA Requestor to provide specific data about grouping or
         * authentication in field trial environments, where the OTA Provider is likely to understand it and be able to
         * act upon it, either for special selection of image, or recording of activity.
         *
         * An OTA Provider shall report the availability of Software Images, if one is found to be applicable using the
         * other provided fields, even if the MetadataForProvider field is deemed to contain invalid or unknown
         * information. That is, the contents of the MetadataForProvider field shall NOT be used to deny a software
         * update to an OTA Requestor, unless both OTA Requestor and OTA Provider have an externally agreed-upon policy
         * whereby strictly correct additional MetadataForProvider is expected to fulfill the OTA Software Update
         * process.
         *
         * ### Usage of the QueryImage Command
         *
         * OTA Requestors shall send a QueryImage command to the OTA Provider to determine the availability of a new
         * Software Image.
         *
         * See Section 11.20.3.2, “Querying the OTA Provider” for full details about the OTA Software Update Query flow
         * which makes use of this command.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.1.8
         */
        metadataForProvider: TlvOptionalField(7, TlvByteString.bound({ maxLength: 512 }))
    });

    /**
     * Input to the OtaSoftwareUpdateProvider queryImage command
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.1
     */
    export interface QueryImageRequest extends TypeFromSchema<typeof TlvQueryImageRequest> {}

    /**
     * See Section 11.20.3.2, “Querying the OTA Provider” for the semantics of these values.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.6.4.1
     */
    export enum Status {
        /**
         * Indicates that the OTA Provider has an update available.
         */
        UpdateAvailable = 0,

        /**
         * Indicates OTA Provider may have an update, but it is not ready yet.
         */
        Busy = 1,

        /**
         * Indicates that there is definitely no update currently available from the OTA Provider.
         */
        NotAvailable = 2,

        /**
         * Indicates that the requested download protocol is not supported by the OTA Provider.
         */
        DownloadProtocolNotSupported = 3
    }

    /**
     * Thrown for cluster status code {@link Status.UpdateAvailable}.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.6.4.1
     */
    export class UpdateAvailableError extends StatusResponseError {
        constructor(
            message = "Indicates that the OTA Provider has an update available",
            code = GlobalStatus.Failure,
            clusterCode = Status.UpdateAvailable
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link Status.Busy}.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.6.4.1
     */
    export class BusyError extends StatusResponseError {
        constructor(
            message = "Indicates OTA Provider may have an update, but it is not ready yet",
            code = GlobalStatus.Failure,
            clusterCode = Status.Busy
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link Status.NotAvailable}.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.6.4.1
     */
    export class NotAvailableError extends StatusResponseError {
        constructor(
            message = "Indicates that there is definitely no update currently available from the OTA Provider",
            code = GlobalStatus.Failure,
            clusterCode = Status.NotAvailable
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link Status.DownloadProtocolNotSupported}.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.6.4.1
     */
    export class DownloadProtocolNotSupportedError extends StatusResponseError {
        constructor(
            message = "Indicates that the requested download protocol is not supported by the OTA Provider",
            code = GlobalStatus.Failure,
            clusterCode = Status.DownloadProtocolNotSupported
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.2
     */
    export const TlvQueryImageResponse = TlvObject({
        /**
         * This field shall contain the primary response regarding the availability of a Software Image.
         *
         * See Section 11.20.3.2, “Querying the OTA Provider” for details about the possible values for this field and
         * their meaning.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.2.1
         */
        status: TlvField(0, TlvEnum<Status>()),

        /**
         * This field shall convey the minimum time to wait, in seconds from the time of this response, before sending
         * another QueryImage command or beginning a download from the OTA Provider. OTA Requestors shall respect this
         * minimum delay, unless they had previously restarted and lost track of it. OTA Providers SHOULD expect OTA
         * Requestors to follow this value to their best capability, however, a restarting Node may come back sooner,
         * due to having lost track of this state response.
         *
         * Beware, this field is conditionally present based on the conformance listed in Section 11.20.6.5.2,
         * “QueryImageResponse Command”.
         *
         * See Section 11.20.3.2, “Querying the OTA Provider” for details about the rules regarding this field.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.2.2
         */
        delayedActionTime: TlvOptionalField(1, TlvUInt32),

        /**
         * This field, when present, shall contain a URI where the OTA Requestor SHOULD download a Soft ware Image. The
         * syntax of the ImageURI field shall follow the URI syntax as specified in RFC 3986.
         *
         * Beware, this field is conditionally present based on the conformance listed in Section 11.20.6.5.2,
         * “QueryImageResponse Command”.
         *
         * If the ImageURI specifies a BDX Protocol bdx: scheme, then the following rules describe the location to be
         * used for download:
         *
         *   1. The URI’s scheme field shall be exactly bdx in lowercase characters.
         *
         *   2. The URI’s authority field shall contain only the host portion and shall use string representation of the
         *      Operational Node ID of the Node where to proceed with the download, on the same Fabric on which the OTA
         *      Requestor received the QueryImageResponse.
         *
         *   3. The encoding of the Node ID in the host field shall use an uppercase hexadecimal format, using exactly
         *      16 characters to encode the network byte order value of the NodeID, in a similar fashion as the Node
         *      Identifier portion of the Operational Instance Name.
         *
         *     a. The Operational Node ID in the host field shall match the NodeID of the OTA Provider responding with
         *        the QueryImageResponse. The usage of a different Node ID than that of the provider is reserved for
         *        future use. This constraint reduces the number of independent CASE secure channel sessions that have
         *        to be maintained to proceed with OTA software updates, thus reducing energy and resource utilization
         *        for the software update process.
         *
         *   4. The user section of the authority field shall be absent, as there are no "users" to be considered.
         *
         *   5. The port section of the authority field shall be absent, as the port for transport shall be determined
         *      through Operational Discovery of the target Node.
         *
         *   6. The URI shall NOT contain a query field.
         *
         *   7. The URI shall NOT contain a fragment field.
         *
         *   8. The path field shall employ absolute path representation and shall contain the file designator of the
         *      software image to download at the BDX server. When used with the BDX server, the leading / separating
         *      the URI authority from the path shall be omitted. When contacting the BDX server, further processing of
         *      the file designator shall NOT be done, including handling of URL-encoded escape sequences. Rather, the
         *      exact octets of the path, as received shall be the values used by both client and server in handling the
         *      file designator.
         *
         *     a. The path shall only contain valid URI characters.
         *
         * These rules above for BDX URIs simplify parsing for OTA Requestors receiving Image URIs. The following
         * example procedure shows how the format constraints simplify the extraction of the necessary data to reach the
         * BDX server for download.
         *
         *   1. Verify that the URI is 24 characters or longer, which is the minimum length of a valid BDX URI with all
         *      elements present, for example bdx://00112233AABBCCDD/0.
         *
         *   2. Verify the presence of prefix bdx:// indicating a BDX URI.
         *
         *   3. Extract the next 16 characters and convert from uppercase hexadecimal to a 64-bit scalar value,
         *      considering network byte order. This is the destination Node ID.
         *
         *   4. Verify the presence of a path separator / and skip it.
         *
         *   5. Extract the remaining characters of the string as the file designator to employ when initiating the BDX
         *      transfer.
         *
         * Example ImageURI values are below, and illustrate some but not all of valid and invalid cases:
         *
         *   • Synchronous or Asynchronous BDX Protocol:
         *
         *     ◦ Valid: bdx://8899AABBCCDDEEFF/the_file_designator123
         *
         *       ▪ Node ID: 0x8899AABBCCDDEEFF
         *
         *       ▪ File designator: the_file_designator123
         *
         *     ◦ Valid: bdx://0099AABBCCDDEE77/the%20file%20designator/some_more
         *
         *       ▪ Node ID: 0x0099AABBCCDDEE77
         *
         *       ▪ File designator: the%20file%20designator/some_more. Note that the %20 are retained and not converted
         *         to ASCII 0x20 (space). The file designator is the path as received verbatim, after the first '/'
         *         (U+002F / SOLIDUS) following the host.
         *
         *     ◦ Invalid: bdx://99AABBCCDDEE77/the_file_designator123
         *
         *       ▪ Node ID: Invalid since it is not exactly 16 characters long, due to having omitted leading zeros.
         *
         *     ◦ Invalid: bdx://0099aabbccddee77/the_file_designator123
         *
         *       ▪ Node ID: Invalid since lowercase hexadecimal was used.
         *
         *     ◦ Invalid: bdx:8899AABBCCDDEEFF/the_file_designator123
         *
         *       ▪ Invalid since bdx scheme does not contain an authority, that is, it does not have // after the first
         *         :.
         *
         *   • HTTP over TLS:
         *
         *     ◦ Valid: https://example.domain:8466/software/image.bin
         *
         * See Section 11.20.3.2, “Querying the OTA Provider” for additional details about the flow.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.2.3
         */
        imageUri: TlvOptionalField(2, TlvString.bound({ maxLength: 256 })),

        /**
         * This field indicates the version of the image being provided to the OTA Requestor by the OTA Provider.
         *
         * Beware, this field is conditionally present based on the conformance listed in Section 11.20.6.5.2,
         * “QueryImageResponse Command”.
         *
         * See Section 11.20.3.2, “Querying the OTA Provider” for additional details about the flow and acceptable
         * values.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.2.4
         */
        softwareVersion: TlvOptionalField(3, TlvUInt32),

        /**
         * This field provides a string version of the image being provided to the OTA Requestor by the OTA Provider.
         *
         * Beware, this field is conditionally present based on the conformance listed in Section 11.20.6.5.2,
         *
         * “QueryImageResponse Command”.
         *
         * See Section 11.20.3.2, “Querying the OTA Provider” for additional details about the flow and acceptable
         * values.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.2.5
         */
        softwareVersionString: TlvOptionalField(4, TlvString.bound({ minLength: 1, maxLength: 64 })),

        /**
         * Beware, this field is conditionally present based on the conformance listed in Section 11.20.6.5.2,
         * “QueryImageResponse Command”.
         *
         * See Section 11.20.3.6.1, “UpdateToken usage” for additional details about the generation and usage of
         * UpdateToken.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.2.6
         */
        updateToken: TlvOptionalField(5, TlvByteString.bound({ minLength: 8, maxLength: 32 })),

        /**
         * This field, if present, shall only be interpreted if the OTA Requestor had previously indicated a value of
         * True in the RequestorCanConsent field of the QueryImageRequest. This field, when present and set to True,
         * shall indicate that a capable OTA Requestor must obtain user-visible consent prior to downloading the OTA
         * Software Image.
         *
         * See Section 11.20.3.4, “Obtaining user consent for updating software” for application details about usage.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.2.7
         */
        userConsentNeeded: TlvOptionalField(6, TlvBoolean),

        /**
         * This optional field, if present, shall consist of a top-level anonymous list; each list element shall have a
         * profile-specific tag encoded in fully-qualified form. Each list element shall contain a manufacturer-specific
         * payload, which the OTA Provider wants to expose to the receiving OTA Requestor. This payload may be used for
         * any purpose and SHOULD be as small as practical.
         *
         * The presence of this field shall NOT be required for correct operation of any OTA Provider compliant with
         * this Cluster specification.
         *
         * The data for this field does not exist in any Distributed Compliance Ledger record and SHOULD only be emitted
         * by an OTA Provider with this additional knowledge if it has knowledge that the receiving OTA Requestor may be
         * able to use it.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.2.8
         */
        metadataForRequestor: TlvOptionalField(7, TlvByteString.bound({ maxLength: 512 }))
    });

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.2
     */
    export interface QueryImageResponse extends TypeFromSchema<typeof TlvQueryImageResponse> {}

    /**
     * Input to the OtaSoftwareUpdateProvider applyUpdateRequest command
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.3
     */
    export const TlvApplyUpdateRequest = TlvObject({
        /**
         * This field shall contain the UpdateToken as specified in Section 11.20.3.6.1, “UpdateToken usage”. This field
         * may be used by the OTA Provider to track minimal lifecycle state to allow finer-grained scheduling of the
         * application of Software Images by OTA Requestors.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.3.1
         */
        updateToken: TlvField(0, TlvByteString.bound({ minLength: 8, maxLength: 32 })),

        /**
         * The NewVersion field included in the request payload shall provide the SoftwareVersion value of the new
         * Software Image which the OTA Requestor is ready to start applying. The OTA Provider may use this new version
         * to track or record Software Image application by OTA Requestors.
         *
         * ### When Generated
         *
         * The ApplyUpdateRequest Command shall be invoked by an OTA Requestor once it is ready to apply a previously
         * downloaded Software Image.
         *
         * ### Effect on Receipt
         *
         * Upon receipt of this command the OTA Provider shall respond with an Action field consistent with the next
         * action the OTA Requestor should take, including any possible time delay.
         *
         * The OTA Provider shall NOT refer to previously stored state about any download progress to reply. If any
         * state keeping is done by the OTA Provider, it shall only relate to the UpdateToken and the history of prior
         * ApplyUpdateRequest commands.
         *
         * See Section 11.20.3.6, “Applying a software update” for a description of the flow in response to an OTA
         * Provider receiving an invocation of this command.
         *
         * ### Handling Error Cases
         *
         * See Section 11.20.3.6, “Applying a software update” for all error-handling information.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.3.2
         */
        newVersion: TlvField(1, TlvUInt32)
    });

    /**
     * Input to the OtaSoftwareUpdateProvider applyUpdateRequest command
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.3
     */
    export interface ApplyUpdateRequest extends TypeFromSchema<typeof TlvApplyUpdateRequest> {}

    /**
     * See Section 11.20.3.6, “Applying a software update” for the semantics of the values. This enumeration is used in
     * the Action field of the ApplyUpdateResponse command. See (Action).
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.6.4.2
     */
    export enum ApplyUpdateAction {
        /**
         * Apply the update.
         */
        Proceed = 0,

        /**
         * Wait at least the given delay time.
         */
        AwaitNextAction = 1,

        /**
         * The OTA Provider is conveying a desire to rescind a previously provided Software Image.
         */
        Discontinue = 2
    }

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.4
     */
    export const TlvApplyUpdateResponse = TlvObject({
        /**
         * The Action field shall express the action that the OTA Provider requests from the OTA Requestor. See Section
         * 11.20.3.6, “Applying a software update” for a description of the Action values provided in response to an OTA
         * Provider receiving an invocation of this command.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.4.1
         */
        action: TlvField(0, TlvEnum<ApplyUpdateAction>()),

        /**
         * The minimum time period the OTA Requestor shall wait before executing the Action, in seconds from receipt.
         *
         * If this field has a value higher than 86400 seconds (24 hours), then the OTA Requestor may assume a value of
         * 86400, in order to reduce undue Software Image application delays.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.4.2
         */
        delayedActionTime: TlvField(1, TlvUInt32)
    });

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.4
     */
    export interface ApplyUpdateResponse extends TypeFromSchema<typeof TlvApplyUpdateResponse> {}

    /**
     * Input to the OtaSoftwareUpdateProvider notifyUpdateApplied command
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.5
     */
    export const TlvNotifyUpdateAppliedRequest = TlvObject({
        /**
         * This field shall contain the UpdateToken as specified in Section 11.20.3.6.1, “UpdateToken usage”.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.5.1
         */
        updateToken: TlvField(0, TlvByteString.bound({ minLength: 8, maxLength: 32 })),

        /**
         * The SoftwareVersion included in the request payload shall provide the same value as the SoftwareVersion
         * attribute in the invoking OTA Requestor’s Basic Information Cluster, and SHOULD be consistent with the value
         * representing a new version running on the Node invoking the command.
         *
         * ### When Generated
         *
         * The NotifyUpdateApplied command SHOULD be invoked in the following two circumstances:
         *
         *   1. An OTA Requestor has just successfully applied a Software Image it had obtained from a previous
         *      QueryImageResponse.
         *
         *   2. An OTA Requestor has just successfully applied a Software Image it had obtained through means different
         *      than those of this Cluster.
         *
         * An OTA Provider may use the state of invocation of this command to help track the progress of update for OTA
         * Requestors it knows require a new OTA Software Image. However, due to the possibility that an OTA Requestor
         * may never come back (e.g. device removed from Fabric altogether, or a critical malfunction), an OTA Provider
         * shall NOT expect every OTA Requestor to invoke this command for correct operation of the OTA Provider.
         *
         * This command shall be considered optional and shall NOT result in reduced availability of the OTA Provider
         * functionality if OTA Requestors never invoke this command.
         *
         * ### Effect on Receipt
         *
         * An OTA Provider receiving an invocation of this command may log it internally.
         *
         * On receiving this command, an OTA Provider may use the information to update its bookkeeping of cached
         * Software Images, or use it for other similar administrative purposes.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.5.2
         */
        softwareVersion: TlvField(1, TlvUInt32)
    });

    /**
     * Input to the OtaSoftwareUpdateProvider notifyUpdateApplied command
     *
     * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.5
     */
    export interface NotifyUpdateAppliedRequest extends TypeFromSchema<typeof TlvNotifyUpdateAppliedRequest> {}

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x29,
        name: "OtaSoftwareUpdateProvider",
        revision: 1,

        commands: {
            /**
             * Upon receipt, this command shall trigger an attempt to find an updated Software Image by the OTA Provider
             * to match the OTA Requestor’s constraints provided in the payload fields.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.1
             */
            queryImage: Command(0x0, TlvQueryImageRequest, 0x1, TlvQueryImageResponse),

            /**
             * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.3
             */
            applyUpdateRequest: Command(0x2, TlvApplyUpdateRequest, 0x3, TlvApplyUpdateResponse),

            /**
             * @see {@link MatterSpecification.v141.Core} § 11.20.6.5.5
             */
            notifyUpdateApplied: Command(0x4, TlvNotifyUpdateAppliedRequest, 0x4, TlvNoResponse)
        }
    });

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.20.6
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type OtaSoftwareUpdateProviderCluster = OtaSoftwareUpdateProvider.Cluster;
export const OtaSoftwareUpdateProviderCluster = OtaSoftwareUpdateProvider.Cluster;
ClusterRegistry.register(OtaSoftwareUpdateProvider.Complete);
