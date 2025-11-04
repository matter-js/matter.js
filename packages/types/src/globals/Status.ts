/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

/**
 * Status Code
 *
 * @see {@link MatterSpecification.v142.Core} § 7.19.2
 */
export enum Status {
    /**
     * Operation was successful.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    Success = 0,

    /**
     * Operation was not successful.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    Failure = 1,

    /**
     * Subscription ID is not active.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    InvalidSubscription = 125,

    /**
     * The sender of the action or command does not have authorization or access.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    UnsupportedAccess = 126,

    /**
     * The endpoint indicated is unsupported on the node.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    UnsupportedEndpoint = 127,

    /**
     * The action is malformed, has missing fields, or fields with invalid values. Action not carried out.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    InvalidAction = 128,

    /**
     * The indicated command ID is not supported on the cluster instance. Command not carried out.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    UnsupportedCommand = 129,

    /**
     * The cluster command is malformed, has missing fields, or fields with invalid values. Command not carried out.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    InvalidCommand = 133,

    /**
     * The indicated attribute ID, field ID or list entry does not exist for an attribute path.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    UnsupportedAttribute = 134,

    /**
     * Out of range error or set to a reserved value. Attribute keeps its old value. Note that an attribute value may be
     * out of range if an attribute is related to another, e.g. with minimum and maximum attributes. See the individual
     * attribute descriptions for specific details.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    ConstraintError = 135,

    /**
     * Attempt to write a read-only attribute.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    UnsupportedWrite = 136,

    /**
     * An action or operation failed due to insufficient available resources.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    ResourceExhausted = 137,

    /**
     * The indicated data field or entry could not be found.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    NotFound = 139,

    /**
     * Reports cannot be issued for this attribute.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    UnreportableAttribute = 140,

    /**
     * The data type indicated is undefined or invalid for the indicated data field. Command or action not carried out.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    InvalidDataType = 141,

    /**
     * Attempt to read a write-only attribute.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    UnsupportedRead = 143,

    /**
     * Cluster instance data version did not match request path
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    DataVersionMismatch = 146,

    /**
     * The transaction was aborted due to time being exceeded.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    Timeout = 148,

    /**
     * The node ID indicated is not supported on the node.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    UnsupportedNode = 155,

    /**
     * The receiver is busy processing another action that prevents the execution of the incoming action.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    Busy = 156,

    /**
     * The access to the action or command by the sender is permitted by the ACL but restricted by the ARL.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    AccessRestricted = 157,

    /**
     * The cluster indicated is not supported on the endpoint.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    UnsupportedCluster = 195,

    /**
     * Used by proxies to convey to clients the lack of an upstream subscription to a source.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    NoUpstreamSubscription = 197,

    /**
     * A Untimed Write or Untimed Invoke interaction was used for an attribute or command that requires a Timed Write or
     * Timed Invoke.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    NeedsTimedInteraction = 198,

    /**
     * The indicated event ID is not supported on the cluster instance.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    UnsupportedEvent = 199,

    /**
     * The receiver has insufficient resources to support the specified number of paths in the request
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    PathsExhausted = 200,

    /**
     * A request with TimedRequest field set to TRUE was issued outside a Timed transaction or a request with
     * TimedRequest set to FALSE was issued inside a Timed transaction.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    TimedRequestMismatch = 201,

    /**
     * A request requiring a Fail-safe context was invoked without the Fail-Safe context.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    FailsafeRequired = 202,

    /**
     * The received request cannot be handled due to the current operational state of the device
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    InvalidInState = 203,

    /**
     * A CommandDataIB is missing a response in the InvokeResponses of an Invoke Response action.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    NoCommandResponse = 204,

    /**
     * The node requires updated TC acceptance. The user MAY be directed to visit the EnhancedSetupFlowMaintenanceUrl to
     * complete this.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    TermsAndConditionsChanged = 205,

    /**
     * The node requires the user to visit the EnhancedSetupFlowMaintenanceUrl for instructions on further action.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    MaintenanceRequired = 206,

    /**
     * The value for the data type was not accepted due to runtime validation issues. Command or action not carried out.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    DynamicConstraintError = 207,

    /**
     * Attempt to create an entity that already exists or create an entity with an identifier that is already in use.
     * Command or action not carried out.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    AlreadyExists = 208,

    /**
     * Attempt to process on a transport type not valid for this element. Command or action not carried out.
     *
     * @see {@link MatterSpecification.v142.Core} § 8.10.1
     */
    InvalidTransportType = 209
}
