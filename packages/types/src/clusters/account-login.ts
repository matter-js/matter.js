/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Command, TlvNoResponse, OptionalEvent } from "../cluster/Cluster.js";
import { TlvField, TlvObject, TlvOptionalField } from "../tlv/TlvObject.js";
import { TlvString } from "../tlv/TlvString.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { AccessLevel } from "#model";
import { TlvNodeId } from "../datatype/NodeId.js";
import { Priority } from "../globals/Priority.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace AccountLogin {
    /**
     * Input to the AccountLogin getSetupPin command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.2.4.1
     */
    export const TlvGetSetupPinRequest = TlvObject({
        /**
         * This field shall specify the client’s Temporary Account Identifier. The length of this field shall be at
         * least 16 characters to protect the account holder against password guessing attacks.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.2.4.1.1
         */
        tempAccountIdentifier: TlvField(0, TlvString.bound({ minLength: 16, maxLength: 100 }))
    });

    /**
     * Input to the AccountLogin getSetupPin command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.2.4.1
     */
    export interface GetSetupPinRequest extends TypeFromSchema<typeof TlvGetSetupPinRequest> {}

    /**
     * This message is sent in response to the GetSetupPIN command, and contains the Setup PIN, or null when the account
     * identified in the request does not match the active account of the running Content App.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.2.4.2
     */
    export const TlvGetSetupPinResponse = TlvObject({
        /**
         * This field shall provide the Setup PIN as a text string at least 8 characters in length or empty string to
         * indicate that the accounts do not match.
         *
         * > [!NOTE]
         *
         * > Newer cluster clients should be aware that AccountLogin cluster version 1 specified an 11 digit minimum
         *   length.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.2.4.2.1
         */
        setupPin: TlvField(0, TlvString)
    });

    /**
     * This message is sent in response to the GetSetupPIN command, and contains the Setup PIN, or null when the account
     * identified in the request does not match the active account of the running Content App.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.2.4.2
     */
    export interface GetSetupPinResponse extends TypeFromSchema<typeof TlvGetSetupPinResponse> {}

    /**
     * Input to the AccountLogin login command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.2.4.3
     */
    export const TlvLoginRequest = TlvObject({
        /**
         * This field shall specify the client’s temporary account identifier.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.2.4.3.1
         */
        tempAccountIdentifier: TlvField(0, TlvString.bound({ minLength: 16, maxLength: 100 })),

        /**
         * This field shall provide the Setup PIN as a text string at least 8 characters in length.
         *
         * > [!NOTE]
         *
         * > Newer cluster clients should be aware that AccountLogin cluster revision 1 specified an 11 digit minimum
         *   length.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.2.4.3.2
         */
        setupPin: TlvField(1, TlvString.bound({ minLength: 8 })),

        /**
         * This optional field shall provide the Node ID of the Client. This field can be used by the Content App to
         * keep track of Nodes which currently have access to it.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.2.4.3.3
         */
        node: TlvOptionalField(2, TlvNodeId)
    });

    /**
     * Input to the AccountLogin login command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.2.4.3
     */
    export interface LoginRequest extends TypeFromSchema<typeof TlvLoginRequest> {}

    /**
     * Input to the AccountLogin logout command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.2.4.4
     */
    export const TlvLogoutRequest = TlvObject({
        /**
         * This optional field shall provide the Node ID of the Client. This field can be used by the Content App to
         * keep track of Nodes which currently have access to it.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.2.4.4.1
         */
        node: TlvOptionalField(0, TlvNodeId)
    });

    /**
     * Input to the AccountLogin logout command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.2.4.4
     */
    export interface LogoutRequest extends TypeFromSchema<typeof TlvLogoutRequest> {}

    /**
     * Body of the AccountLogin loggedOut event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.2.5.1
     */
    export const TlvLoggedOutEvent = TlvObject({
        /**
         * This field shall provide the Node ID corresponding to the user account that has logged out, if that Node ID
         * is available. If it is NOT available, this field shall NOT be present in the event.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.2.5.1.1
         */
        node: TlvOptionalField(0, TlvNodeId)
    });

    /**
     * Body of the AccountLogin loggedOut event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.2.5.1
     */
    export interface LoggedOutEvent extends TypeFromSchema<typeof TlvLoggedOutEvent> {}

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x50e,
        name: "AccountLogin",
        revision: 2,

        commands: {
            /**
             * The purpose of this command is to determine if the active user account of the given Content App matches
             * the active user account of a given Commissionee, and when it does, return a Setup PIN which can be used
             * for password-authenticated session establishment (PASE) with the Commissionee.
             *
             * For example, a Video Player with a Content App Platform may invoke this command on one of its Content App
             * endpoints to facilitate commissioning of a Phone App made by the same vendor as the Content App. If the
             * accounts match, then the Content App may return a Setup PIN that can be used by the Video Player to
             * commission the Phone App without requiring the user to physically input a Setup PIN.
             *
             * The account match is determined by the Content App using a method which is outside the scope of this
             * specification and will typically involve a central service which is in communication with both the
             * Content App and the Commissionee. The GetSetupPIN command is needed in order to provide the
             * Commissioner/Admin with a Setup PIN when this Commissioner/Admin is operated by a different vendor from
             * the Content App.
             *
             * This method is used to facilitate Setup PIN exchange (for PASE) between Commissioner and Commissionee
             * when the same user account is active on both nodes. With this method, the Content App satisfies proof of
             * possession related to commissioning by requiring the same user account to be active on both Commissionee
             * and Content App, while the Commissioner/Admin ensures user consent by prompting the user prior to
             * invocation of the command.
             *
             * Upon receipt of this command, the Content App checks if the account associated with the Temporary Account
             * Identifier sent by the client is the same account that is active on itself. If the accounts are the same,
             * then the Content App returns the GetSetupPIN Response which includes a Setup PIN that may be used for
             * PASE with the Commissionee.
             *
             * The Temporary Account Identifier for a Commissionee may be populated with the Rotating ID field of the
             * client’s commissionable node advertisement (see Rotating Device Identifier section in [MatterCore])
             * encoded as an octet string where the octets of the Rotating Device Identifier are encoded as 2-character
             * sequences by representing each octet’s value as a 2-digit hexadecimal number, using uppercase letters.
             *
             * The Setup PIN is a character string so that it can accommodate different future formats, including
             * alpha-numeric encodings. For a Commissionee it shall be populated with the Manual Pairing Code (see
             * Manual Pairing Code section in [MatterCore]) encoded as a string (11 characters) or the Passcode portion
             * of the Manual Pairing Code (when less than 11 characters).
             *
             * The server shall implement rate limiting to prevent brute force attacks. No more than 10 unique requests
             * in a 10 minute period shall be allowed; a command response status of FAILURE should sent for additional
             * commands received within the 10 minute period. Because access to this command is limited to nodes with
             * Admin-level access, and the user is prompted for consent prior to Commissioning, there are in place
             * multiple obstacles to successfully mounting a brute force attack. A Content App that supports this
             * command shall ensure that the Temporary Account Identifier used by its clients is not valid for more than
             * 10 minutes.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.2.4.1
             */
            getSetupPin: Command(
                0x0,
                TlvGetSetupPinRequest,
                0x1,
                TlvGetSetupPinResponse,
                { invokeAcl: AccessLevel.Administer, timed: true }
            ),

            /**
             * The purpose of this command is to allow the Content App to assume the user account of a given
             * Commissionee by leveraging the Setup PIN input by the user during the commissioning process.
             *
             * For example, a Video Player with a Content App Platform may invoke this command on one of its Content App
             * endpoints after the commissioning has completed of a Phone App made by the same vendor as the Content
             * App. The Content App may determine whether the Temporary Account Identifier maps to an account with a
             * corresponding Setup PIN and, if so, it may automatically login to the account for the corresponding user.
             * The end result is that a user performs commissioning of a Phone App to a Video Player by inputting the
             * Setup PIN for the Phone App into the Video Player UX. Once commissioning has completed, the Video Player
             * invokes this command to allow the corresponding Content App to assume the same user account as the Phone
             * App.
             *
             * The verification of Setup PIN for the given Temporary Account Identifier is determined by the Content App
             * using a method which is outside the scope of this specification and will typically involve a central
             * service which is in communication with both the Content App and the Commissionee. Implementations of such
             * a service should impose aggressive time outs for any mapping of Temporary Account Identifier to Setup PIN
             * in order to prevent accidental login due to delayed invocation.
             *
             * Upon receipt, the Content App checks if the account associated with the client’s Temp Account Identifier
             * has a current active Setup PIN with the given value. If the Setup PIN is valid for the user account
             * associated with the Temp Account Identifier, then the Content App may make that user account active.
             *
             * The Temporary Account Identifier for a Commissionee may be populated with the Rotating ID field of the
             * client’s commissionable node advertisement encoded as an octet string where the octets of the Rotating
             * Device Identifier are encoded as 2-character sequences by representing each octet’s value as a 2-digit
             * hexadecimal number, using uppercase letters.
             *
             * The Setup PIN for a Commissionee may be populated with the Manual Pairing Code encoded as a string of
             * decimal numbers (11 characters) or the Passcode portion of the Manual Pairing Code encoded as a string of
             * decimal numbers (8 characters).
             *
             * The server shall implement rate limiting to prevent brute force attacks. No more than 10 unique requests
             * in a 10 minute period shall be allowed; a command response status of FAILURE should sent for additional
             * commands received within the 10 minute period. Because access to this command is limited to nodes with
             * Admin-level access, and the user is involved when obtaining the Setup PIN, there are in place multiple
             * obstacles to successfully mounting a brute force attack. A Content App that supports this command shall
             * ensure that the Temporary Account Identifier used by its clients is not valid for more than 10 minutes.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.2.4.3
             */
            login: Command(
                0x2,
                TlvLoginRequest,
                0x2,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer, timed: true }
            ),

            /**
             * The purpose of this command is to instruct the Content App to clear the current user account. This
             * command SHOULD be used by clients of a Content App to indicate the end of a user session.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.2.4.4
             */
            logout: Command(0x3, TlvLogoutRequest, 0x3, TlvNoResponse, { timed: true })
        },

        events: {
            /**
             * This event can be used by the Content App to indicate that the current user has logged out. In response
             * to this event, the Fabric Admin shall remove access to this Content App by the specified Node. If no Node
             * is provided, then the Fabric Admin shall remove access to all non-Admin Nodes.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.2.5.1
             */
            loggedOut: OptionalEvent(0x0, Priority.Critical, TlvLoggedOutEvent, { readAcl: AccessLevel.Administer })
        }
    });

    /**
     * This cluster provides commands that facilitate user account login on a Content App or a node. For example, a
     * Content App running on a Video Player device, which is represented as an endpoint (see Device Type Library
     * document), can use this cluster to help make the user account on the Content App match the user account on the
     * Client.
     *
     * Often a fabric administrator will facilitate commissioning of a Client (such as a Casting Video Client), and
     * invoke commands on the AccountLogin cluster on the Content App associated with that client. Specifically:
     *
     *   1. GetSetupPIN in order to attempt to obtain the Passcode for commissioning.
     *
     *   2. Login in order to let the Content App know that commissioning has completed. The Content App can use
     *      information provided in this command in order to determine the user account associated with the client, and
     *      potentially assume that user account.
     *
     *   3. Logout in order to let the Content App know that client access has been removed, and potentially clear the
     *      current user account.
     *
     * The cluster server for this cluster may be supported on each endpoint that represents a Content App on a Video
     * Player device.
     *
     * See Device Type Library document for details of how a Content App, represented as an endpoint on the Video Player
     * device, may implement the cluster server for this cluster to simplify account login for its users.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.2
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type AccountLoginCluster = AccountLogin.Cluster;
export const AccountLoginCluster = AccountLogin.Cluster;
ClusterRegistry.register(AccountLogin.Complete);
