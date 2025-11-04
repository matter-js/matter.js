/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { FabricScopedAttribute, Attribute, Command, TlvNoResponse, Event } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvOptionalField, TlvObject } from "../tlv/TlvObject.js";
import { TlvByteString, TlvString } from "../tlv/TlvString.js";
import { TlvEnum, TlvUInt16, TlvBitmap, TlvEpochS, TlvUInt64, TlvUInt32 } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvFabricIndex } from "../datatype/FabricIndex.js";
import { Priority } from "../globals/Priority.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace Messages {
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
     * This data type is derived from map16, and indicates control information related to a message.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.2
     */
    export const MessageControl = {
        /**
         * Message requires confirmation from user
         *
         * This bit shall indicate that the message originator requests a confirmation of receipt by the user. If
         * confirmation is required, the device SHOULD present the message until it is either confirmed by the user
         * selecting a confirmation option, or the message expires.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.2.1
         */
        confirmationRequired: BitFlag(0),

        /**
         * Message requires response from user
         *
         * This bit shall indicate that a MessagePresented event SHOULD be generated based on the response of the user
         * to the message.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.2.2
         */
        responseRequired: BitFlag(1),

        /**
         * Message supports reply message from user
         *
         * This bit shall indicate that a free-form user reply is to be included in the confirmation of receipt.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.2.3
         */
        replyMessage: BitFlag(2),

        /**
         * Message has already been confirmed
         *
         * This bit shall indicate the current confirmation state of a message, which is useful in the event that there
         * are multiple Messages cluster client devices on a network.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.2.4
         */
        messageConfirmed: BitFlag(3),

        /**
         * Message required PIN/password protection
         *
         * This bit shall indicate that user authentication (e.g. by password or PIN) is required before viewing a
         * message.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.2.5
         */
        messageProtected: BitFlag(4)
    };

    /**
     * This represents a possible response to a message.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.6
     */
    export const TlvMessageResponseOption = TlvObject({
        /**
         * This field shall indicate a unique unsigned 32-bit number identifier for this message response option.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.6.1
         */
        messageResponseId: TlvField(0, TlvUInt32.bound({ min: 1 })),

        /**
         * This field shall indicate the text for this option; e.g. "Yes", "No", etc.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.6.2
         */
        label: TlvField(1, TlvString.bound({ maxLength: 32 }))
    });

    /**
     * This represents a possible response to a message.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.6
     */
    export interface MessageResponseOption extends TypeFromSchema<typeof TlvMessageResponseOption> {}

    /**
     * This represents a single message.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.5
     */
    export const TlvMessage = TlvObject({
        /**
         * This field shall indicate a globally unique ID for this message.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.5.1
         */
        messageId: TlvField(0, TlvByteString.bound({ length: 16 })),

        /**
         * This field shall indicate the priority level for this message.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.5.2
         */
        priority: TlvField(1, TlvEnum<MessagePriority>()),

        /**
         * This field shall indicate control information related to the message.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.5.3
         */
        messageControl: TlvField(2, TlvBitmap(TlvUInt16, MessageControl)),

        /**
         * This field shall indicate the time in UTC at which the message becomes available to be presented. A null
         * value shall indicate "now."
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.5.4
         */
        startTime: TlvField(3, TlvNullable(TlvEpochS)),

        /**
         * This field shall indicate the amount of time, in milliseconds, after the StartTime during which the message
         * is available to be presented. A null value shall indicate "until changed".
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.5.5
         */
        duration: TlvField(4, TlvNullable(TlvUInt64)),

        /**
         * This field shall indicate a string containing the message to be presented.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.5.6
         */
        messageText: TlvField(5, TlvString.bound({ maxLength: 256 })),

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
        responses: TlvOptionalField(6, TlvArray(TlvMessageResponseOption, { maxLength: 4 })),

        fabricIndex: TlvField(254, TlvFabricIndex)
    });

    /**
     * This represents a single message.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.5.5
     */
    export interface Message extends TypeFromSchema<typeof TlvMessage> {}

    /**
     * Input to the Messages presentMessagesRequest command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.1
     */
    export const TlvPresentMessagesRequest = TlvObject({
        /**
         * This field shall indicate a globally unique ID for this message. See MessageID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.1.1
         */
        messageId: TlvField(0, TlvByteString.bound({ length: 16 })),

        /**
         * This field shall indicate the priority level for this message. See Priority.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.1.2
         */
        priority: TlvField(1, TlvEnum<MessagePriority>()),

        /**
         * This field shall indicate control information related to the message. See MessageControl.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.1.3
         */
        messageControl: TlvField(2, TlvBitmap(TlvUInt16, MessageControl)),

        /**
         * This field shall indicate the time in UTC at which the message becomes available to be presented. A null
         * value shall indicate "now." See StartTime.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.1.4
         */
        startTime: TlvField(3, TlvNullable(TlvEpochS)),

        /**
         * This field shall indicate the amount of time, in milliseconds, after the StartTime during which the message
         * is available to be presented. A null value shall indicate "until changed". See Duration.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.1.5
         */
        duration: TlvField(4, TlvNullable(TlvUInt64)),

        /**
         * This field shall indicate a string containing the message to be presented. See MessageText.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.1.6
         */
        messageText: TlvField(5, TlvString.bound({ maxLength: 256 })),

        /**
         * This field shall indicate a list of potential responses to the message. The entries in this list shall have
         * unique values of MessageResponseID.
         *
         * If the ResponseRequired bit is set on the message but this list is empty, the device shall provide a generic
         * acknowledgement button, e.g. "OK".
         *
         * If the ResponseRequired bit is not set on the message, this list shall be ignored. See Responses.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.1.7
         */
        responses: TlvOptionalField(6, TlvArray(TlvMessageResponseOption, { maxLength: 4 }))
    });

    /**
     * Input to the Messages presentMessagesRequest command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.1
     */
    export interface PresentMessagesRequest extends TypeFromSchema<typeof TlvPresentMessagesRequest> {}

    /**
     * Input to the Messages cancelMessagesRequest command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.2
     */
    export const TlvCancelMessagesRequest = TlvObject({
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
        messageIDs: TlvField(0, TlvArray(TlvByteString.bound({ length: 16 }), { maxLength: 8 }))
    });

    /**
     * Input to the Messages cancelMessagesRequest command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.2
     */
    export interface CancelMessagesRequest extends TypeFromSchema<typeof TlvCancelMessagesRequest> {}

    /**
     * Body of the Messages messageQueued event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.1
     */
    export const TlvMessageQueuedEvent = TlvObject({
        /**
         * This field shall indicate the MessageID for newly added message.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.1.1
         */
        messageId: TlvField(0, TlvByteString.bound({ length: 16 })),

        fabricIndex: TlvField(254, TlvFabricIndex)
    });

    /**
     * Body of the Messages messageQueued event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.1
     */
    export interface MessageQueuedEvent extends TypeFromSchema<typeof TlvMessageQueuedEvent> {}

    /**
     * Body of the Messages messagePresented event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.2
     */
    export const TlvMessagePresentedEvent = TlvObject({
        /**
         * This field shall indicate the MessageID for the message being presented.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.2.1
         */
        messageId: TlvField(0, TlvByteString.bound({ length: 16 })),

        fabricIndex: TlvField(254, TlvFabricIndex)
    });

    /**
     * Body of the Messages messagePresented event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.2
     */
    export interface MessagePresentedEvent extends TypeFromSchema<typeof TlvMessagePresentedEvent> {}

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
     * Body of the Messages messageComplete event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.3
     */
    export const TlvMessageCompleteEvent = TlvObject({
        /**
         * This field shall indicate the MessageID for the message being confirmed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.3.1
         */
        messageId: TlvField(0, TlvByteString.bound({ length: 16 })),

        /**
         * This field shall indicate the MessageResponseID selected by the user. If there was no response before the
         * Duration field of the message has elapsed, this field shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.3.2
         */
        responseId: TlvOptionalField(1, TlvNullable(TlvUInt32)),

        /**
         * This field shall indicate a user-provided reply to the message. If there was no reply, or the message did not
         * have the ReplyRequired bit set, this field shall be null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.3.3
         */
        reply: TlvOptionalField(2, TlvNullable(TlvString.bound({ maxLength: 256 }))),

        futureMessagesPreference: TlvField(3, TlvNullable(TlvEnum<FutureMessagePreference>())),
        fabricIndex: TlvField(254, TlvFabricIndex)
    });

    /**
     * Body of the Messages messageComplete event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.3
     */
    export interface MessageCompleteEvent extends TypeFromSchema<typeof TlvMessageCompleteEvent> {}

    /**
     * These elements and properties are present in all Messages clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x97,
        name: "Messages",
        revision: 3,

        features: {
            /**
             * This feature shall indicate that the device can get confirmation from a user that the message was
             * received.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.16.4.1
             */
            receivedConfirmation: BitFlag(0),

            /**
             * This feature shall indicate that the device is capable of presenting a list of responses to the user and
             * recording the user’s choice of response.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.16.4.2
             */
            confirmationResponse: BitFlag(1),

            /**
             * This feature shall indicate that the device is capable of collecting a free-form text response to a
             * message.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.16.4.3
             */
            confirmationReply: BitFlag(2),

            /**
             * This feature shall indicate that the device is capable of requiring the user to authenticate before
             * viewing a message; e.g. entering a PIN or password before viewing a message with billing information.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.16.4.4
             */
            protectedMessages: BitFlag(3)
        },

        attributes: {
            /**
             * Indicates a list of queued messages.
             *
             * In addition to filtering based upon fabric, to preserve user privacy, the server may further limit the
             * set of messages returned in a read request. At minimum, the server shall return to a client those
             * messages that the client itself created/submitted.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.16.6.1
             */
            messages: FabricScopedAttribute(0x0, TlvArray(TlvMessage, { maxLength: 8 }), { default: [] }),

            /**
             * Indicates a list of the MessageIDs of the Messages currently being presented. If this list is empty, no
             * messages are currently being presented.
             *
             * This list shall NOT be fabric-scoped; it shall contain MessageIDs for all Messages being presented, no
             * matter what fabric the client that queued them is on.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.16.6.2
             */
            activeMessageIDs: Attribute(
                0x1,
                TlvArray(TlvByteString.bound({ length: 16 }), { maxLength: 8 }),
                { default: [] }
            )
        },

        commands: {
            /**
             * Upon receipt, this shall cause the message in the passed fields to be appended to the Messages attribute.
             *
             * If appending the message would cause the number of messages to be greater than the capacity of the list,
             * the device shall NOT append any message to Messages, and shall return a status code of
             * RESOURCE_EXHAUSTED.
             *
             * When displaying a message in response to this command, an indication (ex. visual) of the origin node of
             * the command shall be provided. This could be in the form of a friendly name label which uniquely
             * identifies the node to the user. This friendly name label is typically assigned by the Matter Admin at
             * the time of commissioning and, when it’s a device, is often editable by the user. It might be a
             * combination of a company name and friendly name, for example, ”Acme” or “Acme Streaming Service on
             * Alice’s Phone”.
             *
             * > [!NOTE]
             *
             * > It is currently not specified where the friendly name label can be found on the node, meaning that
             *   clients SHOULD NOT rely on a certain method they happen to observe in a particular server instance,
             *   since other instances could employ a different method.
             *
             * The device SHOULD make it possible for the user to view which nodes have access to this cluster and to
             * individually remove privileges for each node.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.1
             */
            presentMessagesRequest: Command(0x0, TlvPresentMessagesRequest, 0x0, TlvNoResponse),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 1.16.7.2
             */
            cancelMessagesRequest: Command(0x1, TlvCancelMessagesRequest, 0x1, TlvNoResponse)
        },

        events: {
            /**
             * This event shall be generated when a message is added to the messages attribute.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.1
             */
            messageQueued: Event(0x0, Priority.Info, TlvMessageQueuedEvent),

            /**
             * This event shall be generated when the message is presented to the user.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.2
             */
            messagePresented: Event(0x1, Priority.Info, TlvMessagePresentedEvent),

            /**
             * This event shall be generated when the message is confirmed by the user, or when the Duration field of
             * the message has elapsed without confirmation.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.16.8.3
             */
            messageComplete: Event(0x2, Priority.Info, TlvMessageCompleteEvent)
        },

        /**
         * This metadata controls which MessagesCluster elements matter.js activates for specific feature combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { confirmationResponse: true, receivedConfirmation: false }, component: false },
            { flags: { confirmationReply: true, receivedConfirmation: false }, component: false }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This cluster provides an interface for passing messages to be presented by a device.
     *
     * MessagesCluster supports optional features that you can enable with the MessagesCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.16
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type MessagesCluster = Messages.Cluster;
export const MessagesCluster = Messages.Cluster;
ClusterRegistry.register(Messages.Complete);
