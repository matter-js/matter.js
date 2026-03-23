/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { Bytes, MaybePromise } from "@matter/general";
import type { FabricIndex } from "../datatype/FabricIndex.js";

/**
 * Definitions for the Messages cluster.
 *
 * This cluster provides an interface for passing messages to be presented by a device.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 1.16
 */
export declare namespace Messages {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0097;

    /**
     * Textual cluster identifier.
     */
    export const name: "Messages";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 3;

    /**
     * Canonical metadata for the Messages cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link Messages} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates a list of queued messages.
         *
         * In addition to filtering based upon fabric, to preserve user privacy, the server may further limit the set of
         * messages returned in a read request. At minimum, the server shall return to a client those messages that the
         * client itself created/submitted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.6.1
         */
        messages: Message[];

        /**
         * Indicates a list of the MessageIDs of the Messages currently being presented. If this list is empty, no
         * messages are currently being presented.
         *
         * This list shall NOT be fabric-scoped; it shall contain MessageIDs for all Messages being presented, no matter
         * what fabric the client that queued them is on.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.6.2
         */
        activeMessageIDs: Bytes[];
    }

    /**
     * Attributes that may appear in {@link Messages}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates a list of queued messages.
         *
         * In addition to filtering based upon fabric, to preserve user privacy, the server may further limit the set of
         * messages returned in a read request. At minimum, the server shall return to a client those messages that the
         * client itself created/submitted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.6.1
         */
        messages: Message[];

        /**
         * Indicates a list of the MessageIDs of the Messages currently being presented. If this list is empty, no
         * messages are currently being presented.
         *
         * This list shall NOT be fabric-scoped; it shall contain MessageIDs for all Messages being presented, no matter
         * what fabric the client that queued them is on.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.6.2
         */
        activeMessageIDs: Bytes[];
    }

    /**
     * {@link Messages} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * Upon receipt, this shall cause the message in the passed fields to be appended to the Messages attribute.
         *
         * If appending the message would cause the number of messages to be greater than the capacity of the list, the
         * device shall NOT append any message to Messages, and shall return a status code of RESOURCE_EXHAUSTED.
         *
         * When displaying a message in response to this command, an indication (ex. visual) of the origin node of the
         * command shall be provided. This could be in the form of a friendly name label which uniquely identifies the
         * node to the user. This friendly name label is typically assigned by the Matter Admin at the time of
         * commissioning and, when it’s a device, is often editable by the user. It might be a combination of a company
         * name and friendly name, for example, ”Acme” or “Acme Streaming Service on Alice’s Phone”.
         *
         * > [!NOTE]
         *
         * > It is currently not specified where the friendly name label can be found on the node, meaning that clients
         *   SHOULD NOT rely on a certain method they happen to observe in a particular server instance, since other
         *   instances could employ a different method.
         *
         * The device SHOULD make it possible for the user to view which nodes have access to this cluster and to
         * individually remove privileges for each node.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.1
         */
        presentMessagesRequest(request: PresentMessagesRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.2
         */
        cancelMessagesRequest(request: CancelMessagesRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link Messages}.
     */
    export interface Commands extends BaseCommands {}

    /**
     * {@link Messages} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * This event shall be generated when a message is added to the messages attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.1
         */
        messageQueued: MessageQueuedEvent;

        /**
         * This event shall be generated when the message is presented to the user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.2
         */
        messagePresented: MessagePresentedEvent;

        /**
         * This event shall be generated when the message is confirmed by the user, or when the Duration field of the
         * message has elapsed without confirmation.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.3
         */
        messageComplete: MessageCompleteEvent;
    }

    /**
     * Events that may appear in {@link Messages}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * This event shall be generated when a message is added to the messages attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.1
         */
        messageQueued: MessageQueuedEvent;

        /**
         * This event shall be generated when the message is presented to the user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.2
         */
        messagePresented: MessagePresentedEvent;

        /**
         * This event shall be generated when the message is confirmed by the user, or when the Duration field of the
         * message has elapsed without confirmation.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.3
         */
        messageComplete: MessageCompleteEvent;
    }

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands, events: BaseEvents }];
    export type Features = "ReceivedConfirmation" | "ConfirmationResponse" | "ConfirmationReply" | "ProtectedMessages";

    /**
     * These are optional features supported by MessagesCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.4
     */
    export enum Feature {
        /**
         * ReceivedConfirmation (CONF)
         *
         * This feature shall indicate that the device can get confirmation from a user that the message was received.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.4.1
         */
        ReceivedConfirmation = "ReceivedConfirmation",

        /**
         * ConfirmationResponse (RESP)
         *
         * This feature shall indicate that the device is capable of presenting a list of responses to the user and
         * recording the user’s choice of response.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.4.2
         */
        ConfirmationResponse = "ConfirmationResponse",

        /**
         * ConfirmationReply (RPLY)
         *
         * This feature shall indicate that the device is capable of collecting a free-form text response to a message.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.4.3
         */
        ConfirmationReply = "ConfirmationReply",

        /**
         * ProtectedMessages (PROT)
         *
         * This feature shall indicate that the device is capable of requiring the user to authenticate before viewing a
         * message; e.g. entering a PIN or password before viewing a message with billing information.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.4.4
         */
        ProtectedMessages = "ProtectedMessages"
    }

    /**
     * This represents a single message.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.5
     */
    export interface Message {
        /**
         * This field shall indicate a globally unique ID for this message.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.5.1
         */
        messageId: Bytes;

        /**
         * This field shall indicate the priority level for this message.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.5.2
         */
        priority: MessagePriority;

        /**
         * This field shall indicate control information related to the message.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.5.3
         */
        messageControl: MessageControl;

        /**
         * This field shall indicate the time in UTC at which the message becomes available to be presented. A null
         * value shall indicate "now."
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.5.4
         */
        startTime: number | null;

        /**
         * This field shall indicate the amount of time, in milliseconds, after the StartTime during which the message
         * is available to be presented. A null value shall indicate "until changed".
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.5.5
         */
        duration: number | bigint | null;

        /**
         * This field shall indicate a string containing the message to be presented.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.5.6
         */
        messageText: string;

        /**
         * This field shall indicate a list of potential responses to the message. The entries in this list shall have
         * unique values of MessageResponseID.
         *
         * If the ResponseRequired bit is set on the message but this list is empty, the device shall provide a generic
         * acknowledgement button, e.g. "OK".
         *
         * If the ResponseRequired bit is not set on the message, this list shall be ignored.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.5.7
         */
        responses?: MessageResponseOption[];

        fabricIndex: FabricIndex;
    }

    /**
     * Upon receipt, this shall cause the message in the passed fields to be appended to the Messages attribute.
     *
     * If appending the message would cause the number of messages to be greater than the capacity of the list, the
     * device shall NOT append any message to Messages, and shall return a status code of RESOURCE_EXHAUSTED.
     *
     * When displaying a message in response to this command, an indication (ex. visual) of the origin node of the
     * command shall be provided. This could be in the form of a friendly name label which uniquely identifies the node
     * to the user. This friendly name label is typically assigned by the Matter Admin at the time of commissioning and,
     * when it’s a device, is often editable by the user. It might be a combination of a company name and friendly name,
     * for example, ”Acme” or “Acme Streaming Service on Alice’s Phone”.
     *
     * > [!NOTE]
     *
     * > It is currently not specified where the friendly name label can be found on the node, meaning that clients
     *   SHOULD NOT rely on a certain method they happen to observe in a particular server instance, since other
     *   instances could employ a different method.
     *
     * The device SHOULD make it possible for the user to view which nodes have access to this cluster and to
     * individually remove privileges for each node.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.1
     */
    export interface PresentMessagesRequest {
        /**
         * This field shall indicate a globally unique ID for this message. See MessageID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.1.1
         */
        messageId: Bytes;

        /**
         * This field shall indicate the priority level for this message. See Priority.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.1.2
         */
        priority: MessagePriority;

        /**
         * This field shall indicate control information related to the message. See MessageControl.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.1.3
         */
        messageControl: MessageControl;

        /**
         * This field shall indicate the time in UTC at which the message becomes available to be presented. A null
         * value shall indicate "now." See StartTime.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.1.4
         */
        startTime: number | null;

        /**
         * This field shall indicate the amount of time, in milliseconds, after the StartTime during which the message
         * is available to be presented. A null value shall indicate "until changed". See Duration.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.1.5
         */
        duration: number | bigint | null;

        /**
         * This field shall indicate a string containing the message to be presented. See MessageText.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.1.6
         */
        messageText: string;

        /**
         * This field shall indicate a list of potential responses to the message. The entries in this list shall have
         * unique values of MessageResponseID.
         *
         * If the ResponseRequired bit is set on the message but this list is empty, the device shall provide a generic
         * acknowledgement button, e.g. "OK".
         *
         * If the ResponseRequired bit is not set on the message, this list shall be ignored.
         *
         * See Responses.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.1.7
         */
        responses?: MessageResponseOption[];
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.2
     */
    export interface CancelMessagesRequest {
        /**
         * This field shall indicate the MessageIDs for the messages being cancelled.
         *
         * Cancelling a message shall cause it to be removed from Messages, cause its MessageID to be removed from
         * ActiveMessageIDs and cause any active presentation of the message to cease.
         *
         * Message IDs in this command that indicate messages that do not exist in Messages, or that are not scoped to
         * the fabric of the sender, shall be ignored.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.2.1
         */
        messageIDs: Bytes[];
    }

    /**
     * This event shall be generated when a message is added to the messages attribute.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.1
     */
    export interface MessageQueuedEvent {
        /**
         * This field shall indicate the MessageID for newly added message.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.1.1
         */
        messageId: Bytes;

        fabricIndex: FabricIndex;
    }

    /**
     * This event shall be generated when the message is presented to the user.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.2
     */
    export interface MessagePresentedEvent {
        /**
         * This field shall indicate the MessageID for the message being presented.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.2.1
         */
        messageId: Bytes;

        fabricIndex: FabricIndex;
    }

    /**
     * This event shall be generated when the message is confirmed by the user, or when the Duration field of the
     * message has elapsed without confirmation.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.3
     */
    export interface MessageCompleteEvent {
        /**
         * This field shall indicate the MessageID for the message being confirmed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.3.1
         */
        messageId: Bytes;

        /**
         * This field shall indicate the MessageResponseID selected by the user. If there was no response before the
         * Duration field of the message has elapsed, this field shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.3.2
         */
        responseId?: number | null;

        /**
         * This field shall indicate a user-provided reply to the message. If there was no reply, or the message did not
         * have the ReplyRequired bit set, this field shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.3.3
         */
        reply?: string | null;

        futureMessagesPreference: FutureMessagePreference | null;
        fabricIndex: FabricIndex;
    }

    /**
     * This data type is derived from map16, and indicates control information related to a message.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.2
     */
    export interface MessageControl {
        /**
         * Message requires confirmation from user
         *
         * This bit shall indicate that the message originator requests a confirmation of receipt by the user. If
         * confirmation is required, the device SHOULD present the message until it is either confirmed by the user
         * selecting a confirmation option, or the message expires.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.2.1
         */
        confirmationRequired?: boolean;

        /**
         * Message requires response from user
         *
         * This bit shall indicate that a MessagePresented event SHOULD be generated based on the response of the user
         * to the message.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.2.2
         */
        responseRequired?: boolean;

        /**
         * Message supports reply message from user
         *
         * This bit shall indicate that a free-form user reply is to be included in the confirmation of receipt.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.2.3
         */
        replyMessage?: boolean;

        /**
         * Message has already been confirmed
         *
         * This bit shall indicate the current confirmation state of a message, which is useful in the event that there
         * are multiple Messages cluster client devices on a network.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.2.4
         */
        messageConfirmed?: boolean;

        /**
         * Message required PIN/password protection
         *
         * This bit shall indicate that user authentication (e.g. by password or PIN) is required before viewing a
         * message.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.2.5
         */
        messageProtected?: boolean;
    }

    /**
     * A display device may include this preference in the MessageComplete event as a hint to clients about how to
     * handle future similar messages.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.3
     */
    export enum FutureMessagePreference {
        /**
         * Similar messages are allowed
         */
        Allowed = 0,

        /**
         * Similar messages should be sent more often
         */
        Increased = 1,

        /**
         * Similar messages should be sent less often
         */
        Reduced = 2,

        /**
         * Similar messages should not be sent
         */
        Disallowed = 3,

        /**
         * No further messages should be sent
         */
        Banned = 4
    }

    /**
     * Priority SHOULD be used to decide which messages to show when the number of eligible messages is larger than the
     * device’s capacity to present them.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.4
     */
    export enum MessagePriority {
        /**
         * Message to be transferred with a low level of importance
         */
        Low = 0,

        /**
         * Message to be transferred with a medium level of importance
         */
        Medium = 1,

        /**
         * Message to be transferred with a high level of importance
         */
        High = 2,

        /**
         * Message to be transferred with a critical level of importance
         */
        Critical = 3
    }

    /**
     * This represents a possible response to a message.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.6
     */
    export interface MessageResponseOption {
        /**
         * This field shall indicate a unique unsigned 32-bit number identifier for this message response option.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.6.1
         */
        messageResponseId: number;

        /**
         * This field shall indicate the text for this option; e.g. "Yes", "No", etc.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.6.2
         */
        label: string;
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterNamespace.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterNamespace.CommandObjects<Commands>;

    /**
     * Event metadata objects keyed by name.
     */
    export const events: ClusterNamespace.EventObjects<Events>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterNamespace.Features<Features>;

    /**
     * @deprecated Use {@link Messages}.
     */
    export const Cluster: typeof Messages;

    /**
     * @deprecated Use {@link Messages}.
     */
    export const Complete: typeof Messages;

    export const Typing: Messages;
}

/**
 * @deprecated Use {@link Messages}.
 */
export declare const MessagesCluster: typeof Messages;

export interface Messages extends ClusterTyping {
    Attributes: Messages.Attributes;
    Commands: Messages.Commands;
    Events: Messages.Events;
    Features: Messages.Features;
    Components: Messages.Components;
}
