/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TlsCertificateManagement } from "@matter/types/clusters/tls-certificate-management";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { TlsCertificateManagementInterface } from "./TlsCertificateManagementInterface.js";
import { Identity } from "@matter/general";

/**
 * TlsCertificateManagementBehavior is the base class for objects that support interaction with
 * {@link TlsCertificateManagement.Cluster}.
 */
export const TlsCertificateManagementBehaviorConstructor = ClusterBehavior
    .withInterface<TlsCertificateManagementInterface>()
    .for(TlsCertificateManagement.Cluster);

export interface TlsCertificateManagementBehaviorConstructor extends Identity<typeof TlsCertificateManagementBehaviorConstructor> {}
export const TlsCertificateManagementBehavior: TlsCertificateManagementBehaviorConstructor = TlsCertificateManagementBehaviorConstructor;
export interface TlsCertificateManagementBehavior extends InstanceType<TlsCertificateManagementBehaviorConstructor> {}
export namespace TlsCertificateManagementBehavior {
    export interface State extends InstanceType<typeof TlsCertificateManagementBehavior.State> {}
}
