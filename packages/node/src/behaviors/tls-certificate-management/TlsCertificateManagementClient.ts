/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TlsCertificateManagement } from "@matter/types/clusters/tls-certificate-management";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const TlsCertificateManagementClientConstructor = ClientBehavior(TlsCertificateManagement);
export interface TlsCertificateManagementClient extends InstanceType<typeof TlsCertificateManagementClientConstructor> {}
export interface TlsCertificateManagementClientConstructor extends Identity<typeof TlsCertificateManagementClientConstructor> {}
export const TlsCertificateManagementClient: TlsCertificateManagementClientConstructor = TlsCertificateManagementClientConstructor;
