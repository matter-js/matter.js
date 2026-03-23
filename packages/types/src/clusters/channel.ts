/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise, Bytes } from "@matter/general";
import { ContentLauncher } from "./content-launcher.js";
import { StatusResponseError } from "../common/StatusResponseError.js";
import { Status as GlobalStatus } from "../globals/Status.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { Channel as ChannelModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the Channel cluster.
 */
export namespace Channel {
    /**
     * {@link Channel} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * This attribute shall contain the current channel. When supported but a channel is not currently tuned to
             * (if a content application is in foreground), the value of the field shall be null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.6.6.3
             */
            readonly currentChannel?: ChannelInfo | null;
        }

        export interface Commands {
            /**
             * Change the channel to the channel with the given Number in the ChannelList attribute.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.3
             */
            changeChannelByNumber(request: ChangeChannelByNumberRequest): MaybePromise;

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
            skipChannel(request: SkipChannelRequest): MaybePromise;
        }
    }

    /**
     * {@link Channel} supports these elements if it supports feature "ChannelList".
     */
    export namespace ChannelListComponent {
        export interface Attributes {
            /**
             * This attribute shall provide the list of supported channels.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.6.6.1
             */
            readonly channelList: ChannelInfo[];
        }
    }

    /**
     * {@link Channel} supports these elements if it supports feature "LineupInfo".
     */
    export namespace LineupInfoComponent {
        export interface Attributes {
            /**
             * This attribute shall identify the channel lineup using external data sources.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.6.6.2
             */
            readonly lineup: LineupInfo | null;
        }
    }

    /**
     * {@link Channel} supports these elements if it supports feature "ChannelListOrLineupInfo".
     */
    export namespace ChannelListOrLineupInfoComponent {
        export interface Commands {
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
            changeChannel(request: ChangeChannelRequest): MaybePromise<ChangeChannelResponse>;
        }
    }

    /**
     * {@link Channel} supports these elements if it supports feature "ElectronicGuide".
     */
    export namespace ElectronicGuideComponent {
        export interface Commands {
            /**
             * This command retrieves the program guide. It accepts several filter parameters to return specific
             * schedule and program information from a content app. The command shall receive in response a
             * ProgramGuideResponse. Standard error codes shall be used when arguments provided are not valid. For
             * example, if StartTime is greater than EndTime, the status code INVALID_ACTION shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.5
             */
            getProgramGuide(request: GetProgramGuideRequest): MaybePromise<ProgramGuideResponse>;
        }
    }

    /**
     * {@link Channel} supports these elements if it supports feature "RecordProgramAndElectronicGuide".
     */
    export namespace RecordProgramAndElectronicGuideComponent {
        export interface Commands {
            /**
             * Record a specific program or series when it goes live. This functionality enables DVR recording features.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.7
             */
            recordProgram(request: RecordProgramRequest): MaybePromise;

            /**
             * Cancel recording for a specific program or series.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.8
             */
            cancelRecordProgram(request: CancelRecordProgramRequest): MaybePromise;
        }
    }

    /**
     * Attributes that may appear in {@link Channel}.
     *
     * Optional properties represent attributes that devices are not required to support. Device support for attributes
     * may also be affected by a device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute shall contain the current channel. When supported but a channel is not currently tuned to (if
         * a content application is in foreground), the value of the field shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.6.3
         */
        readonly currentChannel: ChannelInfo | null;

        /**
         * This attribute shall provide the list of supported channels.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.6.1
         */
        readonly channelList: ChannelInfo[];

        /**
         * This attribute shall identify the channel lineup using external data sources.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.6.2
         */
        readonly lineup: LineupInfo | null;
    }

    export interface Commands extends Base.Commands, ChannelListOrLineupInfoComponent.Commands, ElectronicGuideComponent.Commands, RecordProgramAndElectronicGuideComponent.Commands {}

    export type Components = [
        { flags: {}, attributes: Base.Attributes, commands: Base.Commands },
        { flags: { channelList: true }, attributes: ChannelListComponent.Attributes },
        { flags: { lineupInfo: true }, attributes: LineupInfoComponent.Attributes },
        { flags: { channelList: true }, commands: ChannelListOrLineupInfoComponent.Commands },
        { flags: { lineupInfo: true }, commands: ChannelListOrLineupInfoComponent.Commands },
        { flags: { electronicGuide: true }, commands: ElectronicGuideComponent.Commands },
        {
            flags: { recordProgram: true, electronicGuide: true },
            commands: RecordProgramAndElectronicGuideComponent.Commands
        }
    ];

    export type Features = "ChannelList" | "LineupInfo" | "ElectronicGuide" | "RecordProgram";

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
     * This indicates a channel in a channel lineup.
     *
     * While the major and minor numbers in the ChannelInfoStruct support use of ATSC channel format, a lineup may use
     * other formats which can map into these numeric values.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.5
     */
    export interface ChannelInfo {
        /**
         * This field shall indicate the channel major number value (for example, using ATSC format). When the channel
         * number is expressed as a string, such as "13.1" or "256", the major number would be 13 or 256, respectively.
         * This field is required but shall be set to 0 for channels such as over-the-top channels that are not
         * represented by a major or minor number.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.5.1
         */
        majorNumber: number;

        /**
         * This field shall indicate the channel minor number value (for example, using ATSC format). When the channel
         * number is expressed as a string, such as "13.1" or "256", the minor number would be 1 or 0, respectively.
         * This field is required but shall be set to 0 for channels such as over-the-top channels that are not
         * represented by a major or minor number.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.5.2
         */
        minorNumber: number;

        /**
         * This field shall indicate the marketing name for the channel, such as “The CW" or "Comedy Central". This
         * field is optional, but SHOULD be provided when known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.5.3
         */
        name?: string;

        /**
         * This field shall indicate the call sign of the channel, such as "PBS". This field is optional, but SHOULD be
         * provided when known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.5.4
         */
        callSign?: string;

        /**
         * This field shall indicate the local affiliate call sign, such as "KCTS". This field is optional, but SHOULD
         * be provided when known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.5.5
         */
        affiliateCallSign?: string;

        /**
         * This shall indicate the unique identifier for a specific channel. This field is optional, but SHOULD be
         * provided when MajorNumber and MinorNumber are not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.5.6
         */
        identifier?: string;

        /**
         * This shall indicate the type or grouping of a specific channel. This field is optional, but SHOULD be
         * provided when known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.5.7
         */
        type?: ChannelType;
    }

    /**
     * Change the channel to the channel with the given Number in the ChannelList attribute.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.3
     */
    export interface ChangeChannelByNumberRequest {
        /**
         * This field shall indicate the channel major number value (ATSC format) to which the channel should change.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.3.1
         */
        majorNumber: number;

        /**
         * This field shall indicate the channel minor number value (ATSC format) to which the channel should change.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.3.2
         */
        minorNumber: number;
    }

    /**
     * This command provides channel up and channel down functionality, but allows channel index jumps of size Count.
     *
     * Jumps are relative to the available list of channels. For example, when the current channel is 100.0 and the list
     * of available channels is [100.0, 200.0, 201.0, 305.1], a SkipChannel command with jump value of 2 shall change
     * the channel to 201.0.
     *
     * When the value of the increase or decrease is larger than the number of channels remaining in the given
     * direction, then the behavior shall be to return to the beginning (or end) of the channel list and continue. For
     * example, if the current channel is at index 0 and count value of -1 is given, then the current channel should
     * change to the last channel.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.4
     */
    export interface SkipChannelRequest {
        /**
         * This field shall indicate the number of steps to increase (Count is positive) or decrease (Count is negative)
         * the current channel.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.4.1
         */
        count: number;
    }

    /**
     * The Lineup Info allows references to external lineup sources like Gracenote. The combination of OperatorName,
     * LineupName, and PostalCode MUST uniquely identify a lineup.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.6
     */
    export interface LineupInfo {
        /**
         * This field shall indicate the name of the operator, for example “Comcast”.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.6.1
         */
        operatorName: string;

        /**
         * This field shall indicate the name of the provider lineup, for example "Comcast King County". This field is
         * optional, but SHOULD be provided when known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.6.2
         */
        lineupName?: string;

        /**
         * This field shall indicate the postal code (zip code) for the location of the device, such as "98052". This
         * field is optional, but SHOULD be provided when known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.6.3
         */
        postalCode?: string;

        /**
         * This field shall indicate the type of lineup. This field is optional, but SHOULD be provided when known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.6.4
         */
        lineupInfoType: LineupInfoType;
    }

    /**
     * Change the channel to the channel case-insensitive exact matching the value passed as an argument.
     *
     * The match priority order shall be: Identifier, AffiliateCallSign, CallSign, Name, Number. In the match string,
     * the Channel number should be presented in the "Major.Minor" format, such as "13.1".
     *
     * Upon receipt, this shall generate a ChangeChannelResponse command.
     *
     * Upon success, the CurrentChannel attribute, if supported, shall be updated to reflect the change.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.1
     */
    export interface ChangeChannelRequest {
        /**
         * This field shall contain a user-input string to match in order to identify the target channel.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.1.1
         */
        match: string;
    }

    /**
     * This command shall be generated in response to a ChangeChannel command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.2
     */
    export interface ChangeChannelResponse {
        /**
         * This field shall indicate the status of the command which resulted in this response.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.2.1
         */
        status: Status;

        /**
         * This field shall indicate Optional app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.2.2
         */
        data?: string;
    }

    /**
     * This command retrieves the program guide. It accepts several filter parameters to return specific schedule and
     * program information from a content app. The command shall receive in response a ProgramGuideResponse. Standard
     * error codes shall be used when arguments provided are not valid. For example, if StartTime is greater than
     * EndTime, the status code INVALID_ACTION shall be returned.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.5
     */
    export interface GetProgramGuideRequest {
        /**
         * This field shall indicate the beginning of the time window for which program guide entries are to be
         * retrieved, as a UTC time. Entries with a start time on or after this value will be included in the results.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.5.1
         */
        startTime: number;

        /**
         * This field shall indicate the end of the time window for which program guide entries are to be retrieved, as
         * a UTC time. Entries with an end time on or before this value will be included in the results. This field can
         * represent a past or future value but shall be greater than the StartTime.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.5.2
         */
        endTime: number;

        /**
         * This field shall indicate the set of channels for which program guide entries should be fetched. By providing
         * a list of channels in this field, the response will only include entries corresponding to the specified
         * channels.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.5.3
         */
        channelList?: ChannelInfo[];

        /**
         * This field shall indicate the pagination token used for managing pagination progression.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.5.4
         */
        pageToken?: PageToken | null;

        /**
         * This field shall indicate the flags of the programs for which entries should be fetched.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.5.5
         */
        recordingFlag?: RecordingFlag | null;

        /**
         * This field shall indicate the list of additional external content identifiers.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.5.6
         */
        externalIdList?: ContentLauncher.AdditionalInfo[];

        /**
         * This field shall indicate Optional app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.5.7
         */
        data?: Bytes;
    }

    /**
     * This command is a response to the GetProgramGuide command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.6
     */
    export interface ProgramGuideResponse {
        /**
         * This field shall indicate the necessary pagination attributes that define information for both the succeeding
         * and preceding data pages.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.6.1
         */
        paging: ChannelPaging;

        /**
         * This field shall indicate the list of programs.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.6.2
         */
        programList: Program[];
    }

    /**
     * Record a specific program or series when it goes live. This functionality enables DVR recording features.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.7
     */
    export interface RecordProgramRequest {
        /**
         * This field shall indicate the program identifier for the program that should be recorded. This value is
         * provided by the identifier field in ProgramStruct.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.7.1
         */
        programIdentifier: string;

        /**
         * This field shall indicate whether the whole series associated to the program should be recorded. For example,
         * invoking record program on an episode with that flag set to true, the target should schedule record the whole
         * series.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.7.2
         */
        shouldRecordSeries: boolean;

        /**
         * This field, if present, shall indicate the list of additional external content identifiers.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.7.3
         */
        externalIdList?: ContentLauncher.AdditionalInfo[];

        /**
         * This field, if present, shall indicate app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.7.4
         */
        data?: Bytes;
    }

    /**
     * Cancel recording for a specific program or series.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.8
     */
    export interface CancelRecordProgramRequest {
        /**
         * This field shall indicate the program identifier for the program that should be cancelled from recording.
         * This value is provided by the identifier field in ProgramStruct.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.8.1
         */
        programIdentifier: string;

        /**
         * This field shall indicate whether the whole series associated to the program should be cancelled from
         * recording. For example, invoking record program on an episode with that flag set to true, the target should
         * schedule record the whole series.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.8.2
         */
        shouldRecordSeries: boolean;

        /**
         * This field, if present, shall indicate the list of additional external content identifiers.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.8.3
         */
        externalIdList?: ContentLauncher.AdditionalInfo[];

        /**
         * This field, if present, shall indicate app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.7.8.4
         */
        data?: Bytes;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.1
     */
    export interface RecordingFlag {
        /**
         * The program is scheduled for recording.
         */
        scheduled?: boolean;

        /**
         * The program series is scheduled for recording.
         */
        recordSeries?: boolean;

        /**
         * The program is recorded and available to be played.
         */
        recorded?: boolean;
    }

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
     * This indicates a program within an electronic program guide (EPG).
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7
     */
    export interface Program {
        /**
         * This field shall indicate a unique identifier for a program within an electronic program guide list. The
         * identifier shall be unique across multiple channels.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.1
         */
        identifier: string;

        /**
         * This field shall indicate the channel associated to the program.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.2
         */
        channel: ChannelInfo;

        /**
         * This field shall indicate an epoch time in seconds indicating the start time of a program, as a UTC time.
         * This field can represent a past or future value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.3
         */
        startTime: number;

        /**
         * This field shall indicate an epoch time in seconds indicating the end time of a program, as a UTC time. This
         * field can represent a past or future value but shall be greater than the StartTime.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.4
         */
        endTime: number;

        /**
         * This field shall indicate the title or name for the specific program. For example, “MCIS: Los Angeles”.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.5
         */
        title: string;

        /**
         * This field shall indicate the subtitle for the specific program. For example, “Maybe Today" which is an
         * episode name for “MCIS: Los Angeles”. This field is optional but shall be provided if applicable and known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.6
         */
        subtitle?: string;

        /**
         * This field shall indicate the brief description for the specific program. For example, a description of an
         * episode. This field is optional but shall be provided if known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.7
         */
        description?: string;

        /**
         * This field shall indicate the audio language for the specific program. The value is a string containing one
         * of the standard Tags for Identifying Languages RFC 5646. This field is optional but shall be provided if
         * known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.8
         */
        audioLanguages?: string[];

        /**
         * This field shall be used for indicating the level of parental guidance recommended for of a particular
         * program. This can be any rating system used in the country or region where the program is broadcast. For
         * example, in the United States “TV-PG” may contain material that parents can find not suitable for younger
         * children but can be accepted in general for older children. This field is optional but shall be provided if
         * known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.9
         */
        ratings?: string[];

        /**
         * This field shall represent a URL of a thumbnail that clients can use to render an image for the program. The
         * syntax of this field shall follow the syntax as specified in RFC 1738 and shall use the https scheme.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.10
         */
        thumbnailUrl?: string;

        /**
         * This field shall represent a URL of a poster that clients can use to render an image for the program on the
         * detail view. The syntax of this field shall follow the syntax as specified in RFC 1738 and shall use the
         * https scheme.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.11
         */
        posterArtUrl?: string;

        /**
         * This field shall represent the DVB-I URL associated to the program. The syntax of this field shall follow the
         * syntax as specified in RFC 1738 and shall use the https scheme.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.12
         */
        dvbiUrl?: string;

        /**
         * This field shall be a string, in ISO 8601 format, representing the date on which the program was released.
         * This field is optional but when provided, the year shall be provided as part of the string.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.13
         */
        releaseDate?: string;

        /**
         * This field shall represent a string providing additional information on the parental guidance. This field is
         * optional.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.14
         */
        parentalGuidanceText?: string;

        /**
         * This field shall represent the recording status of the program. This field is required if the RecordProgram
         * feature is set.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.15
         */
        recordingFlag?: RecordingFlag;

        /**
         * This field shall represent the information of a series such as season and episode number. This field is
         * optional but SHOULD be provided if the program represents a series and this information is available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.16
         */
        seriesInfo?: SeriesInfo | null;

        /**
         * This field shall represent the category of a particular program. This field is optional but shall be provided
         * if known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.17
         */
        categoryList?: ProgramCategory[];

        /**
         * This field shall represent a list of the cast or the crew on the program. A single cast member may have more
         * than one role. This field is optional but shall be provided if known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.18
         */
        castList?: ProgramCast[];

        /**
         * This field shall indicate the list of additional external content identifiers.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.7.19
         */
        externalIdList?: ContentLauncher.AdditionalInfo[];
    }

    /**
     * This object defines the category associated to a program.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.8
     */
    export interface ProgramCategory {
        /**
         * This field shall represent the category or genre of the program. Ex. News.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.8.1
         */
        category: string;

        /**
         * This field shall represent the sub-category or sub-genre of the program. Ex. Local.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.8.2
         */
        subCategory?: string;
    }

    /**
     * This object provides the episode information related to a program.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.9
     */
    export interface SeriesInfo {
        /**
         * This field shall represent the season of the series associated to the program.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.9.1
         */
        season: string;

        /**
         * This field shall represent the episode of the program.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.9.2
         */
        episode: string;
    }

    /**
     * This object provides the cast information related to a program.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.10
     */
    export interface ProgramCast {
        /**
         * This field shall represent the name of the cast member.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.10.1
         */
        name: string;

        /**
         * This field shall represent the role of the cast member. Ex. Actor, Director.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.10.2
         */
        role: string;
    }

    /**
     * This object defines the pagination structure.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.11
     */
    export interface PageToken {
        /**
         * This field shall indicate the maximum number of entries that should be retrieved from the program guide in a
         * single response. It allows clients to specify the size of the paginated result set based on their needs.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.11.1
         */
        limit?: number;

        /**
         * This field shall indicate the cursor that pinpoints the start of the upcoming data page. In a Cursor-based
         * pagination system, the field acts as a reference point, ensuring the set of results corresponds directly to
         * the data following the specified cursor. In a Offset-based pagination system, the field, along with limit,
         * indicate the offset from which entries in the program guide will be retrieved.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.11.2
         */
        after?: string;

        /**
         * This field shall indicate the cursor that pinpoints the end of the upcoming data page. In a Cursor-based
         * pagination system, the field acts as a reference point, ensuring the set of results corresponds directly to
         * the data preceding the specified cursor. In a Offset-based pagination system, the field, along with limit,
         * indicate the offset from which entries in the program guide will be retrieved.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.11.3
         */
        before?: string;
    }

    /**
     * This object defines the paging structure that includes the previous and next pagination tokens.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.12
     */
    export interface ChannelPaging {
        /**
         * This field shall indicate the token to retrieve the preceding page. Absence of this field denotes the
         * response as the initial page.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.12.1
         */
        previousToken?: PageToken | null;

        /**
         * This field shall indicate the token to retrieve the next page. Absence of this field denotes the response as
         * the last page.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.6.5.12.2
         */
        nextToken?: PageToken | null;
    }

    export const id = ClusterId(0x504);
    export const name = "Channel" as const;
    export const revision = 2;
    export const schema = ChannelModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export type Cluster = typeof Channel;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `Channel` instead of `Channel.Complete`)
     */
    export type Complete = typeof Channel;

    export declare const Complete: Complete;
    export declare const Typing: Channel;
}

ClusterNamespace.define(Channel);
export type ChannelCluster = Channel.Cluster;
export const ChannelCluster = Channel.Cluster;
export interface Channel extends ClusterTyping { Attributes: Channel.Attributes; Commands: Channel.Commands; Features: Channel.Features; Components: Channel.Components }
