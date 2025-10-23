/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "status", description: "Status Code", xref: "core§7.19.2",

    children: [
        { tag: "field", name: "Success", description: "Operation was successful.", xref: "core§8.10.1" },
        { tag: "field", name: "Failure", description: "Operation was not successful.", xref: "core§8.10.1" },
        {
            tag: "field", name: "InvalidSubscription", description: "Subscription ID is not active.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "UnsupportedAccess",
            description: "The sender of the action or command does not have authorization or access.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "UnsupportedEndpoint",
            description: "The endpoint indicated is unsupported on the node.", xref: "core§8.10.1"
        },
        {
            tag: "field", name: "InvalidAction",
            description: "The action is malformed, has missing fields, or fields with invalid values. Action not carried out.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "UnsupportedCommand",
            description: "The indicated command ID is not supported on the cluster instance. Command not carried out.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "InvalidCommand",
            description: "The cluster command is malformed, has missing fields, or fields with invalid values. Command not carried out.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "UnsupportedAttribute",
            description: "The indicated attribute ID, field ID or list entry does not exist for an attribute path.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "ConstraintError",
            description: "Out of range error or set to a reserved value. Attribute keeps its old value. Note that an attribute value may be out of range if an attribute is related to another, e.g. with minimum and maximum attributes. See the individual attribute descriptions for specific details.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "UnsupportedWrite", description: "Attempt to write a read-only attribute.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "ResourceExhausted",
            description: "An action or operation failed due to insufficient available resources.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "NotFound",
            description: "The indicated data field or entry could not be found.", xref: "core§8.10.1"
        },
        {
            tag: "field", name: "UnreportableAttribute",
            description: "Reports cannot be issued for this attribute.", xref: "core§8.10.1"
        },
        {
            tag: "field", name: "InvalidDataType",
            description: "The data type indicated is undefined or invalid for the indicated data field. Command or action not carried out.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "UnsupportedRead", description: "Attempt to read a write-only attribute.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "DataVersionMismatch",
            description: "Cluster instance data version did not match request path", xref: "core§8.10.1"
        },
        {
            tag: "field", name: "Timeout",
            description: "The transaction was aborted due to time being exceeded.", xref: "core§8.10.1"
        },
        {
            tag: "field", name: "UnsupportedNode",
            description: "The node ID indicated is not supported on the node.", xref: "core§8.10.1"
        },
        {
            tag: "field", name: "Busy",
            description: "The receiver is busy processing another action that prevents the execution of the incoming action.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "AccessRestricted",
            description: "The access to the action or command by the sender is permitted by the ACL but restricted by the ARL.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "UnsupportedCluster",
            description: "The cluster indicated is not supported on the endpoint.", xref: "core§8.10.1"
        },
        {
            tag: "field", name: "NoUpstreamSubscription",
            description: "Used by proxies to convey to clients the lack of an upstream subscription to a source.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "NeedsTimedInteraction",
            description: "A Untimed Write or Untimed Invoke interaction was used for an attribute or command that requires a Timed Write or Timed Invoke.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "UnsupportedEvent",
            description: "The indicated event ID is not supported on the cluster instance.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "PathsExhausted",
            description: "The receiver has insufficient resources to support the specified number of paths in the request",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "TimedRequestMismatch",
            description: "A request with TimedRequest field set to TRUE was issued outside a Timed transaction or a request with TimedRequest set to FALSE was issued inside a Timed transaction.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "FailsafeRequired",
            description: "A request requiring a Fail-safe context was invoked without the Fail-Safe context.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "InvalidInState",
            description: "The received request cannot be handled due to the current operational state of the device",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "NoCommandResponse",
            description: "A CommandDataIB is missing a response in the InvokeResponses of an Invoke Response action.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "TermsAndConditionsChanged",
            description: "The node requires updated TC acceptance. The user MAY be directed to visit the EnhancedSetupFlowMaintenanceUrl to complete this.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "MaintenanceRequired",
            description: "The node requires the user to visit the EnhancedSetupFlowMaintenanceUrl for instructions on further action.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "DynamicConstraintError",
            description: "The value for the data type was not accepted due to runtime validation issues. Command or action not carried out.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "AlreadyExists",
            description: "Attempt to create an entity that already exists or create an entity with an identifier that is already in use. Command or action not carried out.",
            xref: "core§8.10.1"
        },
        {
            tag: "field", name: "InvalidTransportType",
            description: "Attempt to process on a transport type not valid for this element. Command or action not carried out.",
            xref: "core§8.10.1"
        }
    ]
});
