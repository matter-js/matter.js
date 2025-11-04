/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, Command, TlvNoResponse, OptionalAttribute } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvOptionalField, TlvObject } from "../tlv/TlvObject.js";
import { TlvUInt16, TlvEnum, TlvEpochS, TlvUInt8, TlvBitmap, TlvInt16 } from "../tlv/TlvNumber.js";
import { TlvString, TlvByteString } from "../tlv/TlvString.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { StatusResponseError } from "../common/StatusResponseError.js";
import { Status as GlobalStatus } from "../globals/Status.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { ContentLauncher } from "./content-launcher.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace Channel {
    /**
     * These are optional features supported by ChannelCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.4
     */
    export enum Feature {
        /**
         * ChannelList (CL)
         *
         * Provides list of available channels.
         */
        ChannelList = "ChannelList",

        /**
         * LineupInfo (LI)
         *
         * Provides lineup info, which is a reference to an external source of lineup information.
         */
        LineupInfo = "LineupInfo",

        /**
         * ElectronicGuide (EG)
         *
         * Provides electronic program guide information.
         */
        ElectronicGuide = "ElectronicGuide",

        /**
         * RecordProgram (RP)
         *
         * Provides ability to record program.
         */
        RecordProgram = "RecordProgram"
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.4
     */
    export enum ChannelType {
        /**
         * The channel is sourced from a satellite provider.
         */
        Satellite = 0,

        /**
         * The channel is sourced from a cable provider.
         */
        Cable = 1,

        /**
         * The channel is sourced from a terrestrial provider.
         */
        Terrestrial = 2,

        /**
         * The channel is sourced from an OTT provider.
         */
        Ott = 3
    }

    /**
     * This indicates a channel in a channel lineup.
     *
     * While the major and minor numbers in the ChannelInfoStruct support use of ATSC channel format, a lineup may use
     * other formats which can map into these numeric values.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.5
     */
    export const TlvChannelInfo = TlvObject({
        /**
         * This field shall indicate the channel major number value (for example, using ATSC format). When the channel
         * number is expressed as a string, such as "13.1" or "256", the major number would be 13 or 256, respectively.
         * This field is required but shall be set to 0 for channels such as over-the-top channels that are not
         * represented by a major or minor number.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.5.1
         */
        majorNumber: TlvField(0, TlvUInt16),

        /**
         * This field shall indicate the channel minor number value (for example, using ATSC format). When the channel
         * number is expressed as a string, such as "13.1" or "256", the minor number would be 1 or 0, respectively.
         * This field is required but shall be set to 0 for channels such as over-the-top channels that are not
         * represented by a major or minor number.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.5.2
         */
        minorNumber: TlvField(1, TlvUInt16),

        /**
         * This field shall indicate the marketing name for the channel, such as “The CW" or "Comedy Central". This
         * field is optional, but SHOULD be provided when known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.5.3
         */
        name: TlvOptionalField(2, TlvString),

        /**
         * This field shall indicate the call sign of the channel, such as "PBS". This field is optional, but SHOULD be
         * provided when known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.5.4
         */
        callSign: TlvOptionalField(3, TlvString),

        /**
         * This field shall indicate the local affiliate call sign, such as "KCTS". This field is optional, but SHOULD
         * be provided when known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.5.5
         */
        affiliateCallSign: TlvOptionalField(4, TlvString),

        /**
         * This shall indicate the unique identifier for a specific channel. This field is optional, but SHOULD be
         * provided when MajorNumber and MinorNumber are not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.5.6
         */
        identifier: TlvOptionalField(5, TlvString),

        /**
         * This shall indicate the type or grouping of a specific channel. This field is optional, but SHOULD be
         * provided when known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.5.7
         */
        type: TlvOptionalField(6, TlvEnum<ChannelType>())
    });

    /**
     * This indicates a channel in a channel lineup.
     *
     * While the major and minor numbers in the ChannelInfoStruct support use of ATSC channel format, a lineup may use
     * other formats which can map into these numeric values.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.5
     */
    export interface ChannelInfo extends TypeFromSchema<typeof TlvChannelInfo> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.2
     */
    export enum LineupInfoType {
        /**
         * Multi System Operator
         */
        Mso = 0
    }

    /**
     * The Lineup Info allows references to external lineup sources like Gracenote. The combination of OperatorName,
     * LineupName, and PostalCode MUST uniquely identify a lineup.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.6
     */
    export const TlvLineupInfo = TlvObject({
        /**
         * This field shall indicate the name of the operator, for example “Comcast”.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.6.1
         */
        operatorName: TlvField(0, TlvString),

        /**
         * This field shall indicate the name of the provider lineup, for example "Comcast King County". This field is
         * optional, but SHOULD be provided when known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.6.2
         */
        lineupName: TlvOptionalField(1, TlvString),

        /**
         * This field shall indicate the postal code (zip code) for the location of the device, such as "98052". This
         * field is optional, but SHOULD be provided when known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.6.3
         */
        postalCode: TlvOptionalField(2, TlvString),

        /**
         * This field shall indicate the type of lineup. This field is optional, but SHOULD be provided when known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.6.4
         */
        lineupInfoType: TlvField(3, TlvEnum<LineupInfoType>())
    });

    /**
     * The Lineup Info allows references to external lineup sources like Gracenote. The combination of OperatorName,
     * LineupName, and PostalCode MUST uniquely identify a lineup.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.6
     */
    export interface LineupInfo extends TypeFromSchema<typeof TlvLineupInfo> {}

    /**
     * Input to the Channel changeChannel command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.1
     */
    export const TlvChangeChannelRequest = TlvObject({
        /**
         * This field shall contain a user-input string to match in order to identify the target channel.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.1.1
         */
        match: TlvField(0, TlvString)
    });

    /**
     * Input to the Channel changeChannel command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.1
     */
    export interface ChangeChannelRequest extends TypeFromSchema<typeof TlvChangeChannelRequest> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.3
     */
    export enum Status {
        /**
         * Command succeeded
         */
        Success = 0,

        /**
         * More than one equal match for the ChannelInfoStruct passed in.
         */
        MultipleMatches = 1,

        /**
         * No matches for the ChannelInfoStruct passed in.
         */
        NoMatches = 2
    }

    /**
     * Thrown for cluster status code {@link Status.MultipleMatches}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.3
     */
    export class MultipleMatchesError extends StatusResponseError {
        constructor(
            message = "More than one equal match for the ChannelInfoStruct passed in",
            code = GlobalStatus.Failure,
            clusterCode = Status.MultipleMatches
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link Status.NoMatches}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.3
     */
    export class NoMatchesError extends StatusResponseError {
        constructor(
            message = "No matches for the ChannelInfoStruct passed in",
            code = GlobalStatus.Failure,
            clusterCode = Status.NoMatches
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * This command shall be generated in response to a ChangeChannel command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.2
     */
    export const TlvChangeChannelResponse = TlvObject({
        /**
         * This field shall indicate the status of the command which resulted in this response.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.2.1
         */
        status: TlvField(0, TlvEnum<Status>()),

        /**
         * This field shall indicate Optional app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.2.2
         */
        data: TlvOptionalField(1, TlvString)
    });

    /**
     * This command shall be generated in response to a ChangeChannel command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.2
     */
    export interface ChangeChannelResponse extends TypeFromSchema<typeof TlvChangeChannelResponse> {}

    /**
     * This object defines the pagination structure.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.11
     */
    export const TlvPageToken = TlvObject({
        /**
         * This field shall indicate the maximum number of entries that should be retrieved from the program guide in a
         * single response. It allows clients to specify the size of the paginated result set based on their needs.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.11.1
         */
        limit: TlvOptionalField(0, TlvUInt16),

        /**
         * This field shall indicate the cursor that pinpoints the start of the upcoming data page. In a Cursor-based
         * pagination system, the field acts as a reference point, ensuring the set of results corresponds directly to
         * the data following the specified cursor. In a Offset-based pagination system, the field, along with limit,
         * indicate the offset from which entries in the program guide will be retrieved.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.11.2
         */
        after: TlvOptionalField(1, TlvString.bound({ maxLength: 8192 })),

        /**
         * This field shall indicate the cursor that pinpoints the end of the upcoming data page. In a Cursor-based
         * pagination system, the field acts as a reference point, ensuring the set of results corresponds directly to
         * the data preceding the specified cursor. In a Offset-based pagination system, the field, along with limit,
         * indicate the offset from which entries in the program guide will be retrieved.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.11.3
         */
        before: TlvOptionalField(2, TlvString.bound({ maxLength: 8192 }))
    });

    /**
     * This object defines the pagination structure.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.11
     */
    export interface PageToken extends TypeFromSchema<typeof TlvPageToken> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.1
     */
    export const RecordingFlag = {
        /**
         * The program is scheduled for recording.
         */
        scheduled: BitFlag(0),

        /**
         * The program series is scheduled for recording.
         */
        recordSeries: BitFlag(1),

        /**
         * The program is recorded and available to be played.
         */
        recorded: BitFlag(2)
    };

    /**
     * Input to the Channel getProgramGuide command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.5
     */
    export const TlvGetProgramGuideRequest = TlvObject({
        /**
         * This field shall indicate the beginning of the time window for which program guide entries are to be
         * retrieved, as a UTC time. Entries with a start time on or after this value will be included in the results.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.5.1
         */
        startTime: TlvField(0, TlvEpochS),

        /**
         * This field shall indicate the end of the time window for which program guide entries are to be retrieved, as
         * a UTC time. Entries with an end time on or before this value will be included in the results. This field can
         * represent a past or future value but shall be greater than the StartTime.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.5.2
         */
        endTime: TlvField(1, TlvEpochS),

        /**
         * This field shall indicate the set of channels for which program guide entries should be fetched. By providing
         * a list of channels in this field, the response will only include entries corresponding to the specified
         * channels.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.5.3
         */
        channelList: TlvOptionalField(2, TlvArray(TlvChannelInfo, { maxLength: 255 })),

        /**
         * This field shall indicate the pagination token used for managing pagination progression.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.5.4
         */
        pageToken: TlvOptionalField(3, TlvNullable(TlvPageToken)),

        /**
         * This field shall indicate the flags of the programs for which entries should be fetched.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.5.5
         */
        recordingFlag: TlvOptionalField(5, TlvNullable(TlvBitmap(TlvUInt8, RecordingFlag))),

        /**
         * This field shall indicate the list of additional external content identifiers.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.5.6
         */
        externalIdList: TlvOptionalField(6, TlvArray(ContentLauncher.TlvAdditionalInfo, { maxLength: 255 })),

        /**
         * This field shall indicate Optional app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.5.7
         */
        data: TlvOptionalField(7, TlvByteString.bound({ maxLength: 8092 }))
    });

    /**
     * Input to the Channel getProgramGuide command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.5
     */
    export interface GetProgramGuideRequest extends TypeFromSchema<typeof TlvGetProgramGuideRequest> {}

    /**
     * This object defines the paging structure that includes the previous and next pagination tokens.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.12
     */
    export const TlvChannelPaging = TlvObject({
        /**
         * This field shall indicate the token to retrieve the preceding page. Absence of this field denotes the
         * response as the initial page.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.12.1
         */
        previousToken: TlvOptionalField(0, TlvNullable(TlvPageToken)),

        /**
         * This field shall indicate the token to retrieve the next page. Absence of this field denotes the response as
         * the last page.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.12.2
         */
        nextToken: TlvOptionalField(1, TlvNullable(TlvPageToken))
    });

    /**
     * This object defines the paging structure that includes the previous and next pagination tokens.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.12
     */
    export interface ChannelPaging extends TypeFromSchema<typeof TlvChannelPaging> {}

    /**
     * This object provides the episode information related to a program.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.9
     */
    export const TlvSeriesInfo = TlvObject({
        /**
         * This field shall represent the season of the series associated to the program.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.9.1
         */
        season: TlvField(0, TlvString.bound({ maxLength: 256 })),

        /**
         * This field shall represent the episode of the program.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.9.2
         */
        episode: TlvField(1, TlvString.bound({ maxLength: 256 }))
    });

    /**
     * This object provides the episode information related to a program.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.9
     */
    export interface SeriesInfo extends TypeFromSchema<typeof TlvSeriesInfo> {}

    /**
     * This object defines the category associated to a program.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.8
     */
    export const TlvProgramCategory = TlvObject({
        /**
         * This field shall represent the category or genre of the program. Ex. News.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.8.1
         */
        category: TlvField(0, TlvString.bound({ maxLength: 256 })),

        /**
         * This field shall represent the sub-category or sub-genre of the program. Ex. Local.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.8.2
         */
        subCategory: TlvOptionalField(1, TlvString.bound({ maxLength: 256 }))
    });

    /**
     * This object defines the category associated to a program.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.8
     */
    export interface ProgramCategory extends TypeFromSchema<typeof TlvProgramCategory> {}

    /**
     * This object provides the cast information related to a program.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.10
     */
    export const TlvProgramCast = TlvObject({
        /**
         * This field shall represent the name of the cast member.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.10.1
         */
        name: TlvField(0, TlvString.bound({ maxLength: 256 })),

        /**
         * This field shall represent the role of the cast member. Ex. Actor, Director.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.10.2
         */
        role: TlvField(1, TlvString.bound({ maxLength: 256 }))
    });

    /**
     * This object provides the cast information related to a program.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.10
     */
    export interface ProgramCast extends TypeFromSchema<typeof TlvProgramCast> {}

    /**
     * This indicates a program within an electronic program guide (EPG).
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7
     */
    export const TlvProgram = TlvObject({
        /**
         * This field shall indicate a unique identifier for a program within an electronic program guide list. The
         * identifier shall be unique across multiple channels.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.1
         */
        identifier: TlvField(0, TlvString.bound({ maxLength: 255 })),

        /**
         * This field shall indicate the channel associated to the program.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.2
         */
        channel: TlvField(1, TlvChannelInfo),

        /**
         * This field shall indicate an epoch time in seconds indicating the start time of a program, as a UTC time.
         * This field can represent a past or future value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.3
         */
        startTime: TlvField(2, TlvEpochS),

        /**
         * This field shall indicate an epoch time in seconds indicating the end time of a program, as a UTC time. This
         * field can represent a past or future value but shall be greater than the StartTime.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.4
         */
        endTime: TlvField(3, TlvEpochS),

        /**
         * This field shall indicate the title or name for the specific program. For example, “MCIS: Los Angeles”.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.5
         */
        title: TlvField(4, TlvString.bound({ maxLength: 255 })),

        /**
         * This field shall indicate the subtitle for the specific program. For example, “Maybe Today" which is an
         * episode name for “MCIS: Los Angeles”. This field is optional but shall be provided if applicable and known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.6
         */
        subtitle: TlvOptionalField(5, TlvString.bound({ maxLength: 255 })),

        /**
         * This field shall indicate the brief description for the specific program. For example, a description of an
         * episode. This field is optional but shall be provided if known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.7
         */
        description: TlvOptionalField(6, TlvString.bound({ maxLength: 8192 })),

        /**
         * This field shall indicate the audio language for the specific program. The value is a string containing one
         * of the standard Tags for Identifying Languages RFC 5646. This field is optional but shall be provided if
         * known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.8
         */
        audioLanguages: TlvOptionalField(7, TlvArray(TlvString, { maxLength: 10 })),

        /**
         * This field shall be used for indicating the level of parental guidance recommended for of a particular
         * program. This can be any rating system used in the country or region where the program is broadcast. For
         * example, in the United States “TV-PG” may contain material that parents can find not suitable for younger
         * children but can be accepted in general for older children. This field is optional but shall be provided if
         * known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.9
         */
        ratings: TlvOptionalField(8, TlvArray(TlvString, { maxLength: 255 })),

        /**
         * This field shall represent a URL of a thumbnail that clients can use to render an image for the program. The
         * syntax of this field shall follow the syntax as specified in RFC 1738 and shall use the https scheme.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.10
         */
        thumbnailUrl: TlvOptionalField(9, TlvString.bound({ maxLength: 8192 })),

        /**
         * This field shall represent a URL of a poster that clients can use to render an image for the program on the
         * detail view. The syntax of this field shall follow the syntax as specified in RFC 1738 and shall use the
         * https scheme.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.11
         */
        posterArtUrl: TlvOptionalField(10, TlvString.bound({ maxLength: 8192 })),

        /**
         * This field shall represent the DVB-I URL associated to the program. The syntax of this field shall follow the
         * syntax as specified in RFC 1738 and shall use the https scheme.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.12
         */
        dvbiUrl: TlvOptionalField(11, TlvString.bound({ maxLength: 8192 })),

        /**
         * This field shall be a string, in ISO 8601 format, representing the date on which the program was released.
         * This field is optional but when provided, the year shall be provided as part of the string.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.13
         */
        releaseDate: TlvOptionalField(12, TlvString.bound({ maxLength: 30 })),

        /**
         * This field shall represent a string providing additional information on the parental guidance. This field is
         * optional.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.14
         */
        parentalGuidanceText: TlvOptionalField(13, TlvString.bound({ maxLength: 255 })),

        /**
         * This field shall represent the recording status of the program. This field is required if the RecordProgram
         * feature is set.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.15
         */
        recordingFlag: TlvOptionalField(14, TlvBitmap(TlvUInt8, RecordingFlag)),

        /**
         * This field shall represent the information of a series such as season and episode number. This field is
         * optional but SHOULD be provided if the program represents a series and this information is available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.16
         */
        seriesInfo: TlvOptionalField(15, TlvNullable(TlvSeriesInfo)),

        /**
         * This field shall represent the category of a particular program. This field is optional but shall be provided
         * if known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.17
         */
        categoryList: TlvOptionalField(16, TlvArray(TlvProgramCategory, { maxLength: 255 })),

        /**
         * This field shall represent a list of the cast or the crew on the program. A single cast member may have more
         * than one role. This field is optional but shall be provided if known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.18
         */
        castList: TlvOptionalField(17, TlvArray(TlvProgramCast, { maxLength: 255 })),

        /**
         * This field shall indicate the list of additional external content identifiers.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.19
         */
        externalIdList: TlvOptionalField(18, TlvArray(ContentLauncher.TlvAdditionalInfo, { maxLength: 255 }))
    });

    /**
     * This indicates a program within an electronic program guide (EPG).
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7
     */
    export interface Program extends TypeFromSchema<typeof TlvProgram> {}

    /**
     * This command is a response to the GetProgramGuide command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.6
     */
    export const TlvProgramGuideResponse = TlvObject({
        /**
         * This field shall indicate the necessary pagination attributes that define information for both the succeeding
         * and preceding data pages.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.6.1
         */
        paging: TlvField(0, TlvChannelPaging),

        /**
         * This field shall indicate the list of programs.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.6.2
         */
        programList: TlvField(1, TlvArray(TlvProgram))
    });

    /**
     * This command is a response to the GetProgramGuide command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.6
     */
    export interface ProgramGuideResponse extends TypeFromSchema<typeof TlvProgramGuideResponse> {}

    /**
     * Input to the Channel recordProgram command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.7
     */
    export const TlvRecordProgramRequest = TlvObject({
        /**
         * This field shall indicate the program identifier for the program that should be recorded. This value is
         * provided by the identifier field in ProgramStruct.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.7.1
         */
        programIdentifier: TlvField(0, TlvString.bound({ maxLength: 255 })),

        /**
         * This field shall indicate whether the whole series associated to the program should be recorded. For example,
         * invoking record program on an episode with that flag set to true, the target should schedule record the whole
         * series.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.7.2
         */
        shouldRecordSeries: TlvField(1, TlvBoolean),

        /**
         * This field, if present, shall indicate the list of additional external content identifiers.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.7.3
         */
        externalIdList: TlvOptionalField(2, TlvArray(ContentLauncher.TlvAdditionalInfo, { maxLength: 255 })),

        /**
         * This field, if present, shall indicate app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.7.4
         */
        data: TlvOptionalField(3, TlvByteString.bound({ maxLength: 8092 }))
    });

    /**
     * Input to the Channel recordProgram command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.7
     */
    export interface RecordProgramRequest extends TypeFromSchema<typeof TlvRecordProgramRequest> {}

    /**
     * Input to the Channel cancelRecordProgram command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.8
     */
    export const TlvCancelRecordProgramRequest = TlvObject({
        /**
         * This field shall indicate the program identifier for the program that should be cancelled from recording.
         * This value is provided by the identifier field in ProgramStruct.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.8.1
         */
        programIdentifier: TlvField(0, TlvString.bound({ maxLength: 255 })),

        /**
         * This field shall indicate whether the whole series associated to the program should be cancelled from
         * recording. For example, invoking record program on an episode with that flag set to true, the target should
         * schedule record the whole series.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.8.2
         */
        shouldRecordSeries: TlvField(1, TlvBoolean),

        /**
         * This field, if present, shall indicate the list of additional external content identifiers.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.8.3
         */
        externalIdList: TlvOptionalField(2, TlvArray(ContentLauncher.TlvAdditionalInfo, { maxLength: 255 })),

        /**
         * This field, if present, shall indicate app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.8.4
         */
        data: TlvOptionalField(3, TlvByteString.bound({ maxLength: 8092 }))
    });

    /**
     * Input to the Channel cancelRecordProgram command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.8
     */
    export interface CancelRecordProgramRequest extends TypeFromSchema<typeof TlvCancelRecordProgramRequest> {}

    /**
     * Input to the Channel changeChannelByNumber command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.3
     */
    export const TlvChangeChannelByNumberRequest = TlvObject({
        /**
         * This field shall indicate the channel major number value (ATSC format) to which the channel should change.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.3.1
         */
        majorNumber: TlvField(0, TlvUInt16),

        /**
         * This field shall indicate the channel minor number value (ATSC format) to which the channel should change.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.3.2
         */
        minorNumber: TlvField(1, TlvUInt16)
    });

    /**
     * Input to the Channel changeChannelByNumber command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.3
     */
    export interface ChangeChannelByNumberRequest extends TypeFromSchema<typeof TlvChangeChannelByNumberRequest> {}

    /**
     * Input to the Channel skipChannel command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.4
     */
    export const TlvSkipChannelRequest = TlvObject({
        /**
         * This field shall indicate the number of steps to increase (Count is positive) or decrease (Count is negative)
         * the current channel.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.4.1
         */
        count: TlvField(0, TlvInt16)
    });

    /**
     * Input to the Channel skipChannel command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.4
     */
    export interface SkipChannelRequest extends TypeFromSchema<typeof TlvSkipChannelRequest> {}

    /**
     * A ChannelCluster supports these elements if it supports feature ChannelList.
     */
    export const ChannelListComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute shall provide the list of supported channels.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.6.6.1
             */
            channelList: Attribute(0x0, TlvArray(TlvChannelInfo), { default: [] })
        }
    });

    /**
     * A ChannelCluster supports these elements if it supports feature LineupInfo.
     */
    export const LineupInfoComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute shall identify the channel lineup using external data sources.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.6.6.2
             */
            lineup: Attribute(0x1, TlvNullable(TlvLineupInfo), { default: null })
        }
    });

    /**
     * A ChannelCluster supports these elements if it supports features ChannelList or LineupInfo.
     */
    export const ChannelListOrLineupInfoComponent = MutableCluster.Component({
        commands: {
            /**
             * Change the channel to the channel case-insensitive exact matching the value passed as an argument.
             *
             * The match priority order shall be: Identifier, AffiliateCallSign, CallSign, Name, Number. In the match
             * string, the Channel number should be presented in the "Major.Minor" format, such as "13.1".
             *
             * Upon receipt, this shall generate a ChangeChannelResponse command.
             *
             * Upon success, the CurrentChannel attribute, if supported, shall be updated to reflect the change.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.1
             */
            changeChannel: Command(0x0, TlvChangeChannelRequest, 0x1, TlvChangeChannelResponse)
        }
    });

    /**
     * A ChannelCluster supports these elements if it supports feature ElectronicGuide.
     */
    export const ElectronicGuideComponent = MutableCluster.Component({
        commands: {
            /**
             * This command retrieves the program guide. It accepts several filter parameters to return specific
             * schedule and program information from a content app. The command shall receive in response a
             * ProgramGuideResponse. Standard error codes shall be used when arguments provided are not valid. For
             * example, if StartTime is greater than EndTime, the status code INVALID_ACTION shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.5
             */
            getProgramGuide: Command(0x4, TlvGetProgramGuideRequest, 0x5, TlvProgramGuideResponse)
        }
    });

    /**
     * A ChannelCluster supports these elements if it supports features RecordProgram and ElectronicGuide.
     */
    export const RecordProgramAndElectronicGuideComponent = MutableCluster.Component({
        commands: {
            /**
             * Record a specific program or series when it goes live. This functionality enables DVR recording features.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.7
             */
            recordProgram: Command(0x6, TlvRecordProgramRequest, 0x6, TlvNoResponse),

            /**
             * Cancel recording for a specific program or series.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.8
             */
            cancelRecordProgram: Command(0x7, TlvCancelRecordProgramRequest, 0x7, TlvNoResponse)
        }
    });

    /**
     * These elements and properties are present in all Channel clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x504,
        name: "Channel",
        revision: 2,

        features: {
            /**
             * Provides list of available channels.
             */
            channelList: BitFlag(0),

            /**
             * Provides lineup info, which is a reference to an external source of lineup information.
             */
            lineupInfo: BitFlag(1),

            /**
             * Provides electronic program guide information.
             */
            electronicGuide: BitFlag(2),

            /**
             * Provides ability to record program.
             */
            recordProgram: BitFlag(3)
        },

        attributes: {
            /**
             * This attribute shall contain the current channel. When supported but a channel is not currently tuned to
             * (if a content application is in foreground), the value of the field shall be null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.6.6.3
             */
            currentChannel: OptionalAttribute(0x2, TlvNullable(TlvChannelInfo), { default: null })
        },

        commands: {
            /**
             * Change the channel to the channel with the given Number in the ChannelList attribute.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.3
             */
            changeChannelByNumber: Command(0x2, TlvChangeChannelByNumberRequest, 0x2, TlvNoResponse),

            /**
             * This command provides channel up and channel down functionality, but allows channel index jumps of size
             * Count.
             *
             * Jumps are relative to the available list of channels. For example, when the current channel is 100.0 and
             * the list of available channels is [100.0, 200.0, 201.0, 305.1], a SkipChannel command with jump value of
             * 2 shall change the channel to 201.0.
             *
             * When the value of the increase or decrease is larger than the number of channels remaining in the given
             * direction, then the behavior shall be to return to the beginning (or end) of the channel list and
             * continue. For example, if the current channel is at index 0 and count value of -1 is given, then the
             * current channel should change to the last channel.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.4
             */
            skipChannel: Command(0x3, TlvSkipChannelRequest, 0x3, TlvNoResponse)
        },

        /**
         * This metadata controls which ChannelCluster elements matter.js activates for specific feature combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { channelList: true }, component: ChannelListComponent },
            { flags: { lineupInfo: true }, component: LineupInfoComponent },
            { flags: { channelList: true }, component: ChannelListOrLineupInfoComponent },
            { flags: { lineupInfo: true }, component: ChannelListOrLineupInfoComponent },
            { flags: { electronicGuide: true }, component: ElectronicGuideComponent },
            {
                flags: { recordProgram: true, electronicGuide: true },
                component: RecordProgramAndElectronicGuideComponent
            }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This cluster provides an interface for controlling the current Channel on a device or endpoint.
     *
     * This cluster server would be supported on Video Player devices or endpoints that allow Channel control such as a
     * Content App. This cluster provides a list of available channels and provides commands for absolute and relative
     * channel changes. Some of these commands and/or their responses may be large (see Large Message Quality under Data
     * Model section in [MatterCore]), but they do not have the Large quality indicator (L) because they can also be
     * transferred over MRP (see Message Reliability Protocol in [MatterCore]) in pages that fit within the MRP MTU
     * limit. However, an implementation may leverage a transport like TCP that allows large payloads, if available, to
     * minimize the number of messages required to transfer the corresponding payload.
     *
     * The cluster server for Channel is implemented by an endpoint that controls the current Channel.
     *
     * ChannelCluster supports optional features that you can enable with the ChannelCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const CL = { channelList: true };
    const LI = { lineupInfo: true };
    const EG = { electronicGuide: true };
    const RP_EG = { recordProgram: true, electronicGuide: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Cluster.id,
        name: Cluster.name,
        revision: Cluster.revision,
        features: Cluster.features,

        attributes: {
            ...Cluster.attributes,
            channelList: MutableCluster.AsConditional(
                ChannelListComponent.attributes.channelList,
                { mandatoryIf: [CL] }
            ),
            lineup: MutableCluster.AsConditional(LineupInfoComponent.attributes.lineup, { mandatoryIf: [LI] })
        },

        commands: {
            ...Cluster.commands,
            changeChannel: MutableCluster.AsConditional(
                ChannelListOrLineupInfoComponent.commands.changeChannel,
                { mandatoryIf: [CL, LI] }
            ),
            getProgramGuide: MutableCluster.AsConditional(
                ElectronicGuideComponent.commands.getProgramGuide,
                { mandatoryIf: [EG] }
            ),
            recordProgram: MutableCluster.AsConditional(
                RecordProgramAndElectronicGuideComponent.commands.recordProgram,
                { mandatoryIf: [RP_EG] }
            ),
            cancelRecordProgram: MutableCluster.AsConditional(
                RecordProgramAndElectronicGuideComponent.commands.cancelRecordProgram,
                { mandatoryIf: [RP_EG] }
            )
        }
    });

    /**
     * This cluster supports all Channel features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type ChannelCluster = Channel.Cluster;
export const ChannelCluster = Channel.Cluster;
ClusterRegistry.register(Channel.Complete);
