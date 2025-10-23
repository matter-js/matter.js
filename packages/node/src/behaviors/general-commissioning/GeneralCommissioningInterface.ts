/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { GeneralCommissioning } from "#clusters/general-commissioning";

export namespace GeneralCommissioningInterface {
    export interface Base {
        /**
         * This command is used to arm or disarm the fail-safe timer.
         *
         * Success or failure of this command shall be communicated by the ArmFailSafeResponse command, unless some data
         * model validations caused a failure status code to be issued during the processing of the command.
         *
         * If the fail-safe timer is not currently armed, the commissioning window is open, and the command was received
         * over a CASE session, the command shall leave the current fail-safe state unchanged and immediately respond
         * with an ArmFailSafeResponse containing an ErrorCode value of BusyWithOtherAdmin. This is done to allow
         * commissioners, which use PASE connections, the opportunity to use the failsafe during the relatively short
         * commissioning window.
         *
         * Otherwise, the command shall arm or re-arm the "fail-safe timer" with an expiry time set for a duration of
         * ExpiryLengthSeconds, or disarm it, depending on the situation:
         *
         *   • If ExpiryLengthSeconds is 0 and the fail-safe timer was already armed and the accessing fabric matches
         *     the Fabric currently associated with the fail-safe context, then the fail-safe timer shall be immediately
         *     expired (see further below for side-effects of expiration).
         *
         *   • If ExpiryLengthSeconds is 0 and the fail-safe timer was not armed, then this command invocation shall
         *     lead to a success response with no side-effects against the fail-safe context.
         *
         *   • If ExpiryLengthSeconds is non-zero and the fail-safe timer was not currently armed, then the fail-safe
         *     timer shall be armed for that duration.
         *
         *   • If ExpiryLengthSeconds is non-zero and the fail-safe timer was currently armed, and the accessing Fabric
         *     matches the fail-safe context’s associated Fabric, then the fail-safe timer shall be re-armed to expire
         *     in ExpiryLengthSeconds.
         *
         *   • Otherwise, the command shall leave the current fail-safe state unchanged and immediately respond with
         *     ArmFailSafeResponse containing an ErrorCode value of BusyWithOtherAdmin, indicating a likely conflict
         *     between commissioners.
         *
         * The value of the Breadcrumb field shall be written to the Breadcrumb on successful execution of the command.
         *
         * If the receiver restarts unexpectedly (e.g., power interruption, software crash, or other reset) the receiver
         * shall behave as if the fail-safe timer expired and perform the sequence of clean-up steps listed below.
         *
         * On successful execution of the command, the ErrorCode field of the ArmFailSafeResponse shall be set to OK.
         *
         * ### Fail Safe Context
         *
         * When first arming the fail-safe timer, a 'Fail Safe Context' shall be created on the receiver, to track the
         * following state information while the fail-safe is armed:
         *
         *   • The fail-safe timer duration.
         *
         *   • The state of all Network Commissioning Networks attribute configurations, to allow recovery of
         *     connectivity after Fail-Safe expiry.
         *
         *   • Whether an AddNOC command or UpdateNOC command has taken place.
         *
         *   • A fabric-index for the fabric-scoping of the context, starting at the accessing fabric index for the
         *     ArmFailSafe command, and updated with the Fabric Index associated with an AddNOC or an UpdateNOC command
         *     being invoked successfully during the ongoing Fail-Safe timer period.
         *
         *   • The operational credentials associated with any Fabric whose configuration is affected by the UpdateNOC
         *     command.
         *
         *   • Optionally: the previous state of non-fabric-scoped data that is mutated during the fail-safe period.
         *
         * Note the following to assist in understanding the above state-keeping, which summarizes other normative
         * requirements in the respective sections:
         *
         *   • The AddNOC command can only be invoked once per contiguous non-expiring fail-safe timer period, and only
         *     if no UpdateNOC command was previously processed within the same fail-safe timer period.
         *
         *   • The UpdateNOC command can only be invoked once per contiguous non-expiring fail-safe timer period, can
         *     only be invoked over a CASE session, and only if no AddNOC command was previously processed in the same
         *     fail-safe timer period.
         *
         * On creation of the Fail Safe Context a second timer shall be created to expire at
         * MaxCumulativeFailsafeSeconds as specified in BasicCommissioningInfo. This Cumulative Fail Safe Context timer
         * (CFSC timer) serves to limit the lifetime of any particular Fail Safe Context; it shall NOT be extended or
         * modified on subsequent invocations of ArmFailSafe associated with this Fail Safe Context. Upon expiry of the
         * CFSC timer, the receiver shall execute cleanup behavior equivalent to that of fail-safe timer expiration as
         * detailed in Section 11.10.7.2.2, “Behavior on expiry of Fail-Safe timer”. Termination of the session prior to
         * the expiration of that timer for any reason (including a successful end of commissioning or an expiry of a
         * fail-safe timer) shall also delete the CFSC timer.
         *
         * ### Behavior on expiry of Fail-Safe timer
         *
         * If the fail-safe timer expires before the CommissioningComplete command is successfully invoked, the
         * following sequence of clean-up steps shall be executed, in order, by the receiver:
         *
         *   1. Terminate any open PASE secure session by clearing any associated Secure Session Context at the Server.
         *
         *   2. Revoke the temporary administrative privileges granted to any open PASE session (see Section 6.6.2.9,
         *      “Bootstrapping of the Access Control Cluster”) at the Server.
         *
         *   3. If an AddNOC or UpdateNOC command has been successfully invoked, terminate all CASE sessions associated
         *      with the Fabric whose Fabric Index is recorded in the Fail-Safe context (see Section 11.10.7.2,
         *      “ArmFailSafe Command”) by clearing any associated Secure Session Context at the Server.
         *
         *   4. Reset the configuration of all Network Commissioning Networks attribute to their state prior to the
         *      Fail-Safe being armed.
         *
         *   5. If an UpdateNOC command had been successfully invoked, revert the state of operational key pair, NOC and
         *      ICAC for that Fabric to the state prior to the Fail-Safe timer being armed, for the Fabric Index that
         *      was the subject of the UpdateNOC command.
         *
         *   6. If an AddNOC command had been successfully invoked, achieve the equivalent effect of invoking the
         *      RemoveFabric command against the fabric-index stored in the Fail-Safe Context for the Fabric Index that
         *      was the subject of the AddNOC command. This shall remove all associations to that Fabric including all
         *      fabric-scoped data, and may possibly factory-reset the device depending on current device state. This
         *      shall only apply to Fabrics added during the fail-safe period as the result of the AddNOC command.
         *
         *   7. If the CSRRequest command had been successfully invoked, but no AddNOC or UpdateNOC command had been
         *      successfully invoked, then the new operational key pair temporarily generated for the purposes of NOC
         *      addition or update (see Section 6.4.6.1, “Node Operational Certificate Signing Request (NOCSR)
         *      Procedure”) shall be removed as it is no longer needed.
         *
         *   8. Remove any RCACs added by the AddTrustedRootCertificate command that are not currently referenced by any
         *      entry in the Fabrics attribute.
         *
         *   9. Reset the Breadcrumb attribute to zero.
         *
         *   10. Optionally: if no factory-reset resulted from the previous steps, it is recommended that the Node
         *       rollback the state of all non fabric-scoped data present in the Fail-Safe context.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.10.7.2
         */
        armFailSafe(request: GeneralCommissioning.ArmFailSafeRequest): MaybePromise<GeneralCommissioning.ArmFailSafeResponse>;

        /**
         * This command is used to set the regulatory configuration for the device.
         *
         * This shall add or update the regulatory configuration in the RegulatoryConfig Attribute to the value provided
         * in the NewRegulatoryConfig field.
         *
         * Success or failure of this command shall be communicated by the SetRegulatoryConfigResponse command, unless
         * some data model validations caused a failure status code to be issued during the processing of the command.
         *
         * The CountryCode field shall conforms to ISO 3166-1 alpha-2 and shall be used to set the Location attribute
         * reflected by the Basic Information Cluster.
         *
         * If the server limits some of the values (e.g. locked to a particular country, with no regulatory data for
         * others), then setting regulatory information outside a valid country or location shall still set the Location
         * attribute reflected by the Basic Information Cluster configuration, but the SetRegulatoryConfigResponse
         * replied shall have the ErrorCode field set to ValueOutsideRange error.
         *
         * If the LocationCapability attribute is not Indoor/Outdoor and the NewRegulatoryConfig value received does not
         * match either the Indoor or Outdoor fixed value in LocationCapability, then the SetRegulatoryConfigResponse
         * replied shall have the ErrorCode field set to ValueOutsideRange error and the RegulatoryConfig attribute and
         * associated internal radio configuration shall remain unchanged.
         *
         * If the LocationCapability attribute is set to Indoor/Outdoor, then the RegulatoryConfig attribute shall be
         * set to match the NewRegulatoryConfig field.
         *
         * On successful execution of the command, the ErrorCode field of the SetRegulatoryConfigResponse shall be set
         * to OK.
         *
         * The Breadcrumb field shall be used to atomically set the Breadcrumb attribute on success of this command,
         * when SetRegulatoryConfigResponse has the ErrorCode field set to OK. If the command fails, the Breadcrumb
         * attribute shall be left unchanged.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.10.7.4
         */
        setRegulatoryConfig(request: GeneralCommissioning.SetRegulatoryConfigRequest): MaybePromise<GeneralCommissioning.SetRegulatoryConfigResponse>;

        /**
         * This command is used to indicate that the commissioning process is complete.
         *
         * Success or failure of this command shall be communicated by the CommissioningCompleteResponse command, unless
         * some data model validations caused a failure status code to be issued during the processing of the command.
         *
         * This command signals the Server that the Commissioner or Administrator has successfully completed all steps
         * needed during the Fail-Safe period, such as commissioning (see Section 5.5, “Commissioning Flows”) or other
         * Administrator operations requiring usage of the Fail Safe timer. It ensures that the Server is configured in
         * a state such that it still has all necessary elements to be fully operable within a Fabric, such as ACL
         * entries (see Section 9.10, “Access Control Cluster”) and operational credentials (see Section 6.4, “Node
         * Operational Credentials Specification”), and that the Node is reachable using CASE (see Section 4.14.2,
         * “Certificate Authenticated Session Establishment (CASE)”) over an operational network.
         *
         * An ErrorCode of NoFailSafe shall be responded to the invoker if the CommissioningComplete command was
         * received when no Fail-Safe context exists.
         *
         * If Terms and Conditions are required, then an ErrorCode of TCAcknowledgementsNotReceived shall be responded
         * to the invoker if the user acknowledgements to the required Terms and Conditions have not been provided.
         *
         * This command is fabric-scoped, so cannot be issued over a session that does not have an associated fabric,
         * i.e. over PASE session prior to an AddNOC command. In addition, this command is only permitted over CASE and
         * must be issued by a node associated with the ongoing Fail-Safe context. An ErrorCode of InvalidAuthentication
         * shall be responded to the invoker if the CommissioningComplete command was received outside a CASE session
         * (e.g., over Group messaging, or PASE session after AddNOC), or if the accessing fabric is not the one
         * associated with the ongoing Fail-Safe context.
         *
         * This command shall only result in success with an ErrorCode value of OK in the CommissioningCompleteResponse
         * if received over a CASE session and the accessing fabric index matches the Fabric Index associated with the
         * current Fail-Safe context. In other words:
         *
         *   • If no AddNOC command had been successfully invoked, the CommissioningComplete command must originate from
         *     the Fabric that initiated the Fail-Safe context.
         *
         *   • After an AddNOC command has been successfully invoked, the CommissioningComplete command must originate
         *     from the Fabric which was joined through the execution of that command, which updated the Fail-Safe
         *     context’s Fabric Index.
         *
         * On successful execution of the CommissioningComplete command, where the CommissioningCompleteResponse has an
         * ErrorCode of OK, the following actions shall be undertaken on the Server:
         *
         *   1. The Fail-Safe timer associated with the current Fail-Safe context shall be disarmed.
         *
         *   2. The commissioning window at the Server shall be closed.
         *
         *   3. Any temporary administrative privileges automatically granted to any open PASE session shall be revoked
         *      (see Section 6.6.2.9, “Bootstrapping of the Access Control Cluster”).
         *
         *   4. The Secure Session Context of any PASE session still established at the Server shall be cleared.
         *
         *   5. The Breadcrumb attribute shall be reset to zero.
         *
         * After receipt of a CommissioningCompleteResponse with an ErrorCode value of OK, a client cannot expect any
         * previously established PASE session to still be usable, due to the server having cleared such sessions.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.10.7.6
         */
        commissioningComplete(): MaybePromise<GeneralCommissioning.CommissioningCompleteResponse>;
    }

    export interface TermsAndConditions {
        /**
         * This command is used to set the user acknowledgements received in the Enhanced Setup Flow Terms & Conditions
         * into the node.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.10.7.8
         */
        setTcAcknowledgements(request: GeneralCommissioning.SetTcAcknowledgementsRequest): MaybePromise<GeneralCommissioning.SetTcAcknowledgementsResponse>;
    }
}

export type GeneralCommissioningInterface = {
    components: [
        { flags: {}, methods: GeneralCommissioningInterface.Base },
        { flags: { termsAndConditions: true }, methods: GeneralCommissioningInterface.TermsAndConditions }
    ]
};
