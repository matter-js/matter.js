# Matter Groupcast Feature – Specification Notes

> **Status**: Provisional (Matter 1.6 in-progress)
> **Spec source**: `/Users/ingof/DevCSA/connectedhomeip-spec/src/`
> **Spec guards**: `ifdef::in-progress,groupcast[]` (and general `groupcast` keyword)
> **Do not commit this file.**

---

## Overview

The Groupcast feature (introduced in Matter 1.6) defines a unified, simpler, and more scalable mechanism for configuring, managing, and using groups in Matter. It replaces the legacy `Groups` cluster and redistributed functionality in `Group Key Management`.

Key improvements over the legacy approach:
- Single cluster for membership, addressing, key management, and ACL permissions
- IANA-assigned single multicast address for all groups (reduces multicast address usage)
- Explicit sender/receiver role separation (allows resource-constrained devices to participate)
- Automatic AuxiliaryACL generation for group access control
- Streamlined key management with single-key KeySets
- Explicit migration path from legacy Groups cluster

**Relevant spec files:**

| File | Content |
|------|---------|
| `src/service_device_management/Groupcast.adoc` | New Groupcast cluster (full spec) |
| `src/data_model/ACL-Cluster.adoc` | Access Control changes (AUX feature + AuxiliaryACL) |
| `src/data_model/Group-Key-Management-Cluster.adoc` | GKM cluster changes (GCAST feature + GroupcastAdoption) |
| `src/secure_channel/Group_Communication.adoc` | Transport: multicast address policy |
| `src/Ch02_Architecture.adoc` | Migration guide (Groups → Groupcast, Matter 1.6) |
| `src/app_clusters/Groups.adoc` | Groups cluster deprecation notes |
| `src/device_types/RootNodeDeviceType.adoc` | Groupcast conditions on Root Node |

---

## 1. New Cluster: Groupcast (0x0065)

**Spec**: `src/service_device_management/Groupcast.adoc`  
**Included via**: `src/Ch11_Management.adoc` (guarded by `ifdef::in-progress,groupcast[]`)  
**Cluster ID**: `0x0065`  
**PICS Code**: `GC`  
**Hierarchy/Role/Scope**: Base / Utility / **Node** (on Root Endpoint)  
**Revision**: 1 (initial release, replacing Groups + GKM functionality)

### 1.1 Features

| Bit | Code | Feature | Conformance | Summary |
|-----|------|---------|-------------|---------|
| 0 | LN | Listener | O.a+ | Can join multicast groups and receive messages |
| 1 | SD | Sender | O.a+ | Can send multicast messages to groups |
| 2 | PGA | PerGroup | O | Supports per-group multicast addresses |

At least one of `LN` or `SD` must be supported (`O.a+` = at least one of the group).

### 1.2 Data Types

#### `MulticastAddrPolicyEnum` (enum8)
| Value | Name | Summary | Conformance |
|-------|------|---------|-------------|
| 0 | IanaAddr | IANA-assigned multicast address (`FF05::FA`) | M |
| 1 | PerGroup | Multicast address scoped to Fabric ID + Group ID | PGA |

**IanaAddr** (default): All groups share `FF05::FA`. Nodes receive all group traffic and filter by decryption. Minimizes multicast address subscriptions.  
**PerGroup**: Each group uses unique IPv6 multicast address (old behavior, backwards compat). Use only for legacy interop or low-power devices needing network-layer filtering. Infrastructure limit concern (MPL registrations on Border Routers).

#### `GroupcastTestingEnum` (enum8)
| Value | Name | Summary |
|-------|------|---------|
| 0 | DisableTesting | Disable all test events |
| 1 | EnableListenerTesting | Enable Listener test events (LN) |
| 2 | EnableSenderTesting | Enable Sender test events (SD) |

#### `GroupcastTestResultEnum` (enum8)
| Value | Name | Summary |
|-------|------|---------|
| 0 | Success | No failure |
| 1 | GeneralError | Other error |
| 2 | MessageReplay | Counter ≤ last received |
| 3 | FailedAuth | Authentication failed |
| 4 | NoAvailableKey | No key found |
| 5 | SendFailure | IPv6 multicast send issue |

#### `MembershipStruct` (Fabric-Scoped)
| ID | Name | Type | Conformance | Notes |
|----|------|------|-------------|-------|
| 0 | GroupID | group-id | M | min 1 |
| 1 | Endpoints | list[endpoint-no] | LN | max 255 per entry |
| 2 | KeySetID | uint16 | M | maps to GKM GroupKeySetID; marked Secret (S) |
| 3 | HasAuxiliaryACL | bool | LN | if true → AuxiliaryACL entries will be generated |
| 4 | McastAddrPolicy | MulticastAddrPolicyEnum | M | fallback: 0 (IanaAddr) |

**Key rules for Membership entries:**
- Per-fabric GroupID count ≤ floor(MaxMembershipCount / 2)
- A single GroupID with >255 endpoints must be split into consecutive entries (max `ceil(endpoints/255)` entries)
- Split entries must be consecutive in the list, identical in all fields except Endpoints
- Senders: Endpoints field is empty; Listeners: Endpoints field must have ≥1 entry

### 1.3 Attributes

| ID | Name | Type | Access | Conformance | Notes |
|----|------|------|--------|-------------|-------|
| 0x0000 | Membership | list[MembershipStruct] | R V F | P, M | Fabric-scoped |
| 0x0001 | MaxMembershipCount | uint16 | R V | P, M | min 10, Fixed |
| 0x0002 | MaxMcastAddrCount | uint16 | R V | P, M | min 1; min 4 if PGA |
| 0x0003 | UsedMcastAddrCount | uint16 | R V | P, M | Fixed |
| 0x0004 | FabricUnderTest | fabric-idx | R V | P, M | 0 = no test in progress |

### 1.4 Commands

| ID | Name | Direction | Response | Access | Conformance |
|----|------|-----------|----------|--------|-------------|
| 0x00 | JoinGroup | C→S | Status (Y) | M F | P, M |
| 0x01 | LeaveGroup | C→S | LeaveGroupResponse | M F | P, M |
| 0x02 | LeaveGroupResponse | S→C | N/A | F | P, M |
| 0x03 | UpdateGroupKey | C→S | Status (Y) | M F | P, M |
| 0x04 | ConfigureAuxiliaryACL | C→S | Status (Y) | A F | P, LN |
| 0x05 | GroupcastTesting | C→S | Status (Y) | A F | P, M |

#### `JoinGroup` Command Fields
| ID | Name | Type | Conformance | Notes |
|----|------|------|-------------|-------|
| 0 | GroupID | group-id | M | min 1 |
| 1 | Endpoints | list[endpoint-no] | M | empty for Sender; 1–20 for Listener; no Endpoint 0 |
| 2 | KeySetID | uint16 | M | new or existing KeySet |
| 3 | Key | octstr[16] | O | 128-bit input key; only when creating new KeySet |
| 4 | UseAuxiliaryACL | bool | [LN] | requires Administer privilege if present |
| 5 | ReplaceEndpoints | bool | [LN] | replaces vs appends existing endpoints |
| 6 | McastAddrPolicy | MulticastAddrPolicyEnum | O | omit → IanaAddr |

**Effect on Receipt:**
1. Check resource space (RESOURCE_EXHAUSTED)
2. If Endpoints empty: must be Sender-only (else CONSTRAINT_ERROR)
3. If Endpoints non-empty: must be Listener; validate endpoints (UNSUPPORTED_ENDPOINT)
4. UseAuxiliaryACL requires Administer privilege (else UNSUPPORTED_ACCESS)
5. If Key provided: KeySetID must not exist yet (else ALREADY_EXISTS); derive OperationalGroupKey; do not store raw key
6. If Key omitted: KeySetID must already exist (else NOT_FOUND)
7. Update Membership attribute (replace or append endpoints)
8. If UseAuxiliaryACL provided: apply ConfigureAuxiliaryACL semantics
9. Return SUCCESS

**Key created via JoinGroup** creates a `GroupKeySetStruct` in GKM with:
- `GroupKeySetID` = KeySetID
- `GroupKeySecurityPolicy` = TrustFirst
- `EpochKey0` = Key, `EpochStartTime0` = 1
- `EpochKey1/2` = null, `EpochStartTime1/2` = null
- `GroupKeyMulticastPolicy` = MulticastPolicy field

#### `LeaveGroup` Command Fields
| ID | Name | Type | Conformance | Notes |
|----|------|------|-------------|-------|
| 0 | GroupID | group-id | M | 0 = all groups |
| 1 | Endpoints | list[endpoint-no] | O | 1–20; omit = leave completely |

**Effect on Receipt:**
- GroupID=0: affects all fabric's groups
- If Endpoints provided: remove those endpoints; if entry becomes empty (Listener-only), remove entry + AuxiliaryACL + group keys
- If Endpoints omitted: remove entire membership entry + group keys
- Returns `LeaveGroupResponse`

#### `LeaveGroupResponse` Fields
| ID | Name | Type | Conformance |
|----|------|------|-------------|
| 0 | GroupID | group-id | M |
| 1 | Endpoints | list[endpoint-no] | M | max 20 |

#### `UpdateGroupKey` Command Fields
| ID | Name | Type | Conformance |
|----|------|------|-------------|
| 0 | GroupID | group-id | M | min 1 |
| 1 | KeySetID | uint16 | M |
| 2 | Key | octstr[16] | O |

**Note**: Cannot modify an existing GroupKeySet's key via Groupcast cluster. Use GKM `KeySetWrite` for that.

#### `ConfigureAuxiliaryACL` Command Fields (Access: Administer)
| ID | Name | Type | Conformance |
|----|------|------|-------------|
| 0 | GroupID | group-id | M |
| 1 | UseAuxiliaryACL | bool | M |

**Effect**: Generates or removes AuxiliaryACL entries in Access Control cluster for all endpoints of the group. Updates `HasAuxiliaryACL` field in Membership entries.

#### `GroupcastTesting` Command Fields (Access: Administer)
| ID | Name | Type | Conformance |
|----|------|------|-------------|
| 0 | TestOperation | GroupcastTestingEnum | M |
| 1 | DurationSeconds | uint16 | O | 10–1200; fallback 60 |

**Purpose**: Enables certification/production validation. Generates `GroupcastTesting` events for each processed or failed groupcast message. Only the last fabric to enable testing "owns" the test (tracked via `FabricUnderTest`).

### 1.5 Events

| ID | Name | Priority | Access | Conformance |
|----|------|----------|--------|-------------|
| 0x00 | GroupcastTesting | INFO | A S | P, M |

#### `GroupcastTesting` Event Fields (Fabric-Sensitive)
| ID | Name | Type | Conformance |
|----|------|------|-------------|
| 0x00 | SourceIpAddress | ipv6adr | O |
| 0x01 | DestinationIpAddress | ipv6adr | O |
| 0x02 | GroupID | group-id | O |
| 0x03 | EndpointID | endpoint-id | O |
| 0x04 | ClusterID | cluster-id | O |
| 0x05 | ElementID | uint32 | O |
| 0x06 | AccessAllowed | bool | O |
| 0x07 | GroupcastTestResult | GroupcastTestResultEnum | M |

### 1.6 Key Management Integration

- KeySetID in Groupcast maps 1:1 to `GroupKeySetID` in GKM cluster
- `JoinGroup`/`UpdateGroupKey` can create new single-key KeySets; modifying existing KeySets requires GKM `KeySetWrite`
- Multiple groups MAY share the same KeySet
- Groupcast-created KeySets are visible in GKM's `GroupKeyMap` attribute
- GKM-created KeySets can be referenced by Groupcast commands

---

## 2. Access Control Cluster Changes

**Spec**: `src/data_model/ACL-Cluster.adoc`  
**Guards**: `ifdef::in-progress,groupcast[]`  
**Cluster Revision**: bumped to 3 (adds AUX feature + AuxiliaryACL attribute)

### 2.1 New Feature: Auxiliary (AUX)

| Bit | Code | Feature | Conformance | Summary |
|-----|------|---------|-------------|---------|
| 2 | AUX | Auxiliary | P, desc | Some ACL entries may be auto-generated by other features |

**Conformance note**: `desc` means the conformance is described in prose (i.e., required when Groupcast Listener feature is active on the node – see RootNodeDeviceType requirements).

### 2.2 New Data Type: `AccessControlAuxiliaryTypeEnum` (enum8)

| Value | Name | Summary |
|-------|------|---------|
| 0 | System | System reason, likely non-revocable |
| 1 | Groupcast | Synthesized via Groupcast Cluster group membership |

### 2.3 New Field in `AccessControlEntryStruct`

| ID | Name | Type | Conformance |
|----|------|------|-------------|
| 5 | AuxiliaryType | AccessControlAuxiliaryTypeEnum | P, O; marked Secret (S) |

**Rules:**
- This field **SHALL NOT** be present in entries in the regular `ACL` attribute
- Only present in `AuxiliaryACL` attribute entries
- Indicates which feature generated the entry

### 2.4 New Attribute: `AuxiliaryACL` (0x0007)

| ID | Name | Type | Constraint | Access | Conformance |
|----|------|------|------------|--------|-------------|
| 0x0007 | AuxiliaryACL | list[AccessControlEntryStruct] | max 2000 | R A F | P, AUX |

**Purpose**: Read-only (from administrator perspective) list of auto-generated ACL entries. These:
- Are NOT writable via this attribute (managed through underlying features)
- Do NOT count against `AccessControlEntriesPerFabric` limit
- Apply during the Access Control Privilege Granting algorithm
- Should be as concise as possible (share subjects/targets where possible)
- Changes must be reported as attribute change events

### 2.5 New Event: `AuxiliaryAccessUpdated` (0x03)

| ID | Name | Priority | Access | Conformance |
|----|------|----------|--------|-------------|
| 0x03 | AuxiliaryAccessUpdated | INFO | A S | P, AUX |

**Fields** (Fabric-Sensitive):
| ID | Name | Type | Conformance |
|----|------|------|-------------|
| 0 | AdminNodeID | node-id | M | nullable (null if internally initiated) |

**Generated when**: `AuxiliaryACL` attribute data changes. Should be generated once per batch of changes. NOT generated when leaving a Fabric.

---

## 3. Group Key Management Cluster Changes

**Spec**: `src/data_model/Group-Key-Management-Cluster.adoc`  
**Guards**: `ifdef::in-progress,groupcast[]`  
**Cluster Revision**: bumped to 3 (refocus on pure key management; group management moves to Groupcast)

### 3.1 New Feature: GCAST

| Bit | Code | Feature | Conformance | Summary |
|-----|------|---------|-------------|---------|
| 1 | GCAST | Groupcast | M | Device supports groups using the Groupcast cluster |

When GCAST is set:
- This cluster is used **solely for key management** (not group membership management)
- `MaxGroupsPerFabric` SHALL be set to 0 (indicating legacy group allocation is disabled)

### 3.2 Changes to `GroupKeySetStruct`

When GCAST feature is set:
- `GroupKeyMulticastPolicy` field SHALL be `null`, **unless** `GroupKeySetId == 0` (IPK)
- `FabricBinding` field SHALL be `null`, **unless** `GroupKeySetId == 0` (IPK)

### 3.3 New Data Type: `GroupcastAdoptionStruct` (Fabric-Scoped)

| ID | Name | Type | Conformance |
|----|------|------|-------------|
| 0 | GroupcastAdopted | bool | M |

**Purpose**: Indicates whether the fabric's administrators have migrated to Groupcast.

### 3.4 New Attribute: `GroupcastAdoption` (0x0004)

| ID | Name | Type | Constraint | Access | Conformance |
|----|------|------|------------|--------|-------------|
| 0x0004 | GroupcastAdoption | list[GroupcastAdoptionStruct] | desc | RW A F | GCAST |

**Behavior when `GroupcastAdopted = true` for accessing Fabric:**
- `GroupKeyMap` attribute SHALL be empty
- Any write to `GroupKeyMap` SHALL fail with `INVALID_IN_STATE`

**Behavior when `GroupcastAdopted = false` (or missing) for accessing Fabric:**
- `GroupKeyMap` SHALL contain Group Key Set mappings derived from Groupcast cluster's Membership (one mapping per group per fabric)
- Any write to `GroupKeyMap` removes all existing entries first

**Rules:**
- At most 1 entry per fabric
- Missing entry is treated as if `GroupcastAdopted = false`

### 3.5 Changes to `GroupKeyMap` Attribute

When GCAST feature is set, behavior changes per `GroupcastAdoption` state (see above).

### 3.6 Changes to `GroupTable` Attribute

When GCAST feature is set:
- If `GroupcastAdoption.GroupcastAdopted = true`: attribute SHALL be empty
- Else: attribute SHALL reflect group mappings equivalent to the Groupcast cluster's Membership attribute

### 3.7 Changes to `MaxGroupsPerFabric` Attribute

When GCAST feature is set: SHALL be set to `0`, indicating group management is done via Groupcast cluster.

---

## 4. Transport Layer Changes

**Spec**: `src/secure_channel/Group_Communication.adoc`

### 4.1 Multicast Address Selection

**When sending a group message** (step modified):
- If group data record is **sourced by the Groupcast cluster**: use IPv6 destination address per `McastAddrPolicy` field in the membership
  - `IanaAddr` → `FF05::FA` (IANA-assigned, site-scoped)
  - `PerGroup` → per-group multicast address based on Fabric ID + Group ID
- If group data record is **not** from Groupcast cluster (legacy): use PerGroup multicast address (old behavior)

### 4.2 IANA Assigned IPv6 Multicast Address

```
FF05::FA
```

Any device supporting the Groupcast cluster (Listener or Sender) SHALL support `FF05::FA`.

### 4.3 Hop Count Note

Hop counts on Thread networks are not deterministic. The supported hop count SHOULD be set to at least 10 for efficient Matter groupcast communication.

### 4.4 Resource Limits for Groupcast

If node implements Groupcast cluster:
- MUST support group memberships up to `MaxMembershipCount`
- All non-Root endpoints MAY be added in MembershipStruct entries
- MUST persist all EndpointIDs in each MembershipStruct entry

---

## 5. Migration: Groups → Groupcast (Matter 1.6)

**Spec**: `src/Ch02_Architecture.adoc` (section `ref_GroupsToGroupcastMigration`, guarded by `ifdef::in-progress,groupcast[]`)

### 5.1 Backward Compatibility for Updated Nodes

An updated node MUST continue operating with existing group communications at transport layer (group keys, multicast addressing) after upgrade to Matter 1.6.

**If device type requires Groups cluster (mandatory conformance):**
- Keep Groups cluster enabled
- `AddGroup`, `ViewGroup`, `GetGroupMembership`, `AddGroupIfIdentifying` → return `INVALID_IN_STATE`
- `RemoveGroup` → translated to Groupcast `LeaveGroup` (GroupID=received, Endpoints=[receiving endpoint])
- `RemoveAllGroups` → translated to Groupcast `LeaveGroup` (GroupID=0x0000, Endpoints=[receiving endpoint])

**If device type does NOT require Groups cluster (mandatory):**
- MAY support Groupcast without Groups cluster present

### 5.2 Device-Managed Migration into Groupcast Membership

When upgrading from legacy Groups, existing config maps to `Membership` attribute:

For each fabric, for each GroupID:
1. Compute endpoint list (excluding Endpoint 0)
2. Look up `GroupKeySetID` from GKM `GroupKeyMap`
3. Create `MembershipStruct` entry:
   - `GroupID` = GroupID
   - `Endpoints` = endpoint list
   - `KeySetID` = GroupKeySetID
   - `HasAuxiliaryACL` = **false** (legacy groups assumed to already have ACL)

After migration: Set `MaxGroupsPerFabric` = 0 in GKM.

### 5.3 Administrator/Controller Migration Perspective

- Use `Membership` attribute to discover node's group configuration
- Use Groupcast cluster commands (`JoinGroup`, `LeaveGroup`, `UpdateGroupKey`) to modify
- Group Key Sets can still be managed via GKM cluster
- To modify key material of existing KeySet: use GKM `KeySetWrite` (Groupcast doesn't support overwriting)
- When controllers set `GroupcastAdoption.GroupcastAdopted = true` on GKM, `GroupKeyMap` becomes read-only (auto-managed)

### 5.4 Resource Sizing: Legacy vs Groupcast

- **Legacy**: Per-endpoint group table, static provisioning (fabrics × endpoints)
- **Groupcast**: Explicit per-node `Membership` list, capacity defined by `MaxMembershipCount`
- Per-fabric GroupID count ≤ floor(MaxMembershipCount / 2)
- Node updating to Groupcast MUST ensure `MaxMembershipCount` accommodates all migrated memberships

---

## 6. Device Type Requirements

**Spec**: `src/device_types/RootNodeDeviceType.adoc`

### 6.1 Groupcast Conditions (Root Node)

| Condition Ref | Name | When Required |
|--------------|------|---------------|
| `ref_ConditionGroupcastListener` | GroupcastListenerCond | Node has ≥1 endpoint with a Device Type requiring Groupcast Server with Listener feature. Supported if any endpoint has Groups cluster server. |
| `ref_ConditionGroupcastSender` | GroupcastSenderCond | Node has ≥1 endpoint with a Device Type requiring Groupcast Server with Sender feature. Supported if any endpoint has Bindings cluster server. |

### 6.2 Root Node Cluster Requirements

| Cluster ID | Cluster | Side | Conformance |
|-----------|---------|------|-------------|
| 0x0065 | Groupcast | Server | `GroupcastListenerCond OR GroupcastSenderCond, O` |
| 0x001F | Access Control | Feature: AUX | `GroupcastListenerCond` |
| 0x0065 | Groupcast | Feature: Listener | `GroupcastListenerCond, O` |
| 0x0065 | Groupcast | Feature: Sender | `GroupcastSenderCond, O` |

### 6.3 Other Device Types with Groupcast Requirements

| Device Type | Root Node Requirement | Conformance |
|------------|----------------------|-------------|
| OnOffPlug-inUnit | GroupcastListenerCond | P, M |
| ControlBridge | GroupcastSenderCond | P, M |
| DimmerSwitch | GroupcastSenderCond | P, O |
| ColorDimmerSwitch | GroupcastSenderCond | P, O |
| RoomAirConditioner | GroupcastListenerCond | P, O |
| Pump | GroupcastListenerCond | P, O |
| (many others) | varies | P, O |

---

## 7. Groups Cluster Deprecation

**Spec**: `src/app_clusters/Groups.adoc`

- Starting Matter 1.6: Groupcast Cluster supersedes Groups Cluster
- Legacy groups provisioned pre-1.6 remain operational via PerGroup feature in Groupcast
- Creating/modifying groups via legacy Groups cluster is deprecated
- Groups cluster revision bumped to **5** to reflect deprecation
- `AddGroup`, `ViewGroup`, `GetGroupMembership`, `AddGroupIfIdentifying` return `INVALID_IN_STATE` on revision 5
- `RemoveGroup` → maps to Groupcast `LeaveGroup`
- `RemoveAllGroups` → maps to Groupcast `LeaveGroup` with GroupID=0x0000

---

## 8. AuxiliaryACL Handling Details

**Spec**: `src/service_device_management/Groupcast.adoc` (section `ref_GroupcastAuxiliaryACLHandling`)

For every `MembershipStruct` entry with `HasAuxiliaryACL = true`, there SHALL exist `AuxiliaryACL` entries where:
- `FabricIndex` = entry's FabricIndex
- `AuxiliaryType` = Groupcast
- `Privilege` = Operate
- `AuthMode` = Group
- `Subjects` contains the GroupID
- `Targets` contains (some of) the Endpoints

The policy is satisfied when the union of all matching AuxiliaryACL entries, expanded to (FabricIndex, SingleSubject, SingleTarget, Privilege) tuples, equals one entry per (FabricIndex, GroupID, EndpointID).

Multiple groups and endpoints can be combined in single AuxiliaryACL entries to minimize entry count (respecting `SubjectsPerAccessControlEntry` and `TargetsPerAccessControlEntry` limits).

**Important warning**: When `SoftwareVersion` or `ConfigurationVersion` changes in Basic Information cluster, administrators SHOULD re-evaluate UseAuxiliaryACL settings, as new clusters may inadvertently receive Operate privilege.

---

## 9. Implementation Notes for matter.js

### 9.1 Files That Need to Be Created/Added

1. **New cluster: Groupcast (0x0065)**
   - `packages/model/src/standard/elements/groupcast.element.ts`
   - `packages/model/src/standard/resources/groupcast.resource.ts`
   - `packages/types/src/clusters/groupcast.ts` (generated)
   - `packages/node/src/behaviors/groupcast/` (behavior implementation)

2. **Modified clusters:**
   - `packages/model/src/standard/elements/access-control.element.ts` – add AUX feature, AuxiliaryACL attribute, AuxiliaryAccessUpdated event, AuxiliaryType field in AccessControlEntryStruct, AccessControlAuxiliaryTypeEnum
   - `packages/model/src/standard/elements/group-key-management.element.ts` – add GCAST feature, GroupcastAdoption attribute, GroupcastAdoptionStruct, modify GroupKeySetStruct nullability, modify MaxGroupsPerFabric behavior

3. **Transport layer:**
   - Group message sending logic needs to check Groupcast cluster's `McastAddrPolicy` when selecting IPv6 multicast address
   - Support for `FF05::FA` (IANA-assigned address)

4. **Groups cluster compatibility layer:**
   - Revision bump to 5
   - Return `INVALID_IN_STATE` for Add/View/GetMembership/AddIfIdentifying
   - Translate RemoveGroup/RemoveAllGroups to Groupcast LeaveGroup

### 9.2 Key Implementation Concerns

- **KeySet auto-creation**: When JoinGroup receives a `Key` field, it must auto-create a `GroupKeySetStruct` in GKM
- **AuxiliaryACL engine**: Need an internal mechanism to generate/remove AuxiliaryACL entries based on `HasAuxiliaryACL` field changes; changes must be reported
- **Multicast address strategy**: Requires choosing between `FF05::FA` (IanaAddr) and per-group addresses; default should be IanaAddr
- **Migration from legacy**: On startup or after firmware update, map legacy group tables to Groupcast Membership
- **GroupcastAdoption interaction**: When `GroupcastAdopted = true`, the GKM `GroupKeyMap` and `GroupTable` must be auto-managed
- **Access control for ConfigureAuxiliaryACL**: Requires Administer privilege (not just Manage)
- **Split entries**: Large node bridges may need multi-entry splits for groups with >255 endpoints

### 9.3 Cluster Revision Dependencies

| Cluster | Old Revision | New Revision | Trigger |
|---------|-------------|-------------|---------|
| Groupcast | — | 1 | New cluster |
| Access Control | 2 | 3 | AUX feature + AuxiliaryACL |
| Group Key Management | 2 | 3 | GCAST feature + GroupcastAdoption |
| Groups | 4 | 5 | Deprecation + compatibility shim |

---

## 10. Open Questions / TODOs (from spec)

The spec itself has several `// TODO` comments:
- Test plan to check for `CONSTRAINT_ERROR` on `UseAuxiliaryACL` field with LN not supported
- Test plan must check admin vs non-admin attempt for `UseAuxiliaryACL` field
- `UseAuxiliaryACL` side-effects should apply to **all** endpoints of the group, not just those listed in JoinGroup
- Large bridges with "all off" groups and >20 endpoints per JoinGroup command may need incremental group building (TODO in spec: consider making Endpoints field `LN` with max 20)
- When removing a group, consider that many groups may share the key (key deletion needs careful handling)
- `LeaveGroup` step for removing operational group keys needs to account for shared KeySets

---

## 11. Quick Reference: Spec Search Commands

```bash
# All groupcast ifdef sections
grep -n "ifdef::in-progress,groupcast" /Users/ingof/DevCSA/connectedhomeip-spec/src/data_model/ACL-Cluster.adoc

# Full Groupcast cluster spec
cat /Users/ingof/DevCSA/connectedhomeip-spec/src/service_device_management/Groupcast.adoc

# GKM cluster groupcast changes
grep -n -A10 "ifdef::in-progress,groupcast" /Users/ingof/DevCSA/connectedhomeip-spec/src/data_model/Group-Key-Management-Cluster.adoc

# Migration section
grep -n -A80 "ref_GroupsToGroupcastMigration" /Users/ingof/DevCSA/connectedhomeip-spec/src/Ch02_Architecture.adoc

# Transport changes
grep -n -A5 "ifdef::in-progress,groupcast" /Users/ingof/DevCSA/connectedhomeip-spec/src/secure_channel/Group_Communication.adoc

# Device type requirements
grep -n "Groupcast" /Users/ingof/DevCSA/connectedhomeip-spec/src/device_types/RootNodeDeviceType.adoc
```
