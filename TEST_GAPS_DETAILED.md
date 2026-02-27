# Test Coverage Gaps - Detailed File Listing

## NODEJS PACKAGE ANALYSIS

### Module Coverage Summary
```
packages/nodejs/src/
├── behavior/                     [✗ 0% tested]
├── crypto/                       [✓ 50% tested - NodeJsCrypto.ts]
├── environment/                  [✗ 0% tested]
├── log/                          [✗ 0% tested]
├── net/                          [✗ 0% tested]
├── storage/                      [✓ 100% tested]
├── time/                         [✗ 0% tested]
└── config.ts                     [✗ untested]
```

### Untested Critical Files

#### 1. ENVIRONMENT INITIALIZATION (HIGH PRIORITY)
- `/home/user/matter.js/packages/nodejs/src/environment/NodeJsEnvironment.ts` (260 lines)
  - Loads config files, environment variables, command-line arguments
  - Path resolution and storage backend initialization
  - Service registration and TTY detection
  
- `/home/user/matter.js/packages/nodejs/src/environment/ProcessManager.ts` (154 lines)
  - Signal handling (SIGINT, SIGTERM, SIGUSR2, SIGABRT)
  - Process exit code management
  - Unhandled error monitoring

#### 2. NETWORK LAYER (CRITICAL)
- `/home/user/matter.js/packages/nodejs/src/net/NodeJsNetwork.ts`
  - Interface enumeration, IPv4/IPv6 multicast
  
- `/home/user/matter.js/packages/nodejs/src/net/NodeJsUdpChannel.ts`
  - UDP socket operations
  
- `/home/user/matter.js/packages/nodejs/src/net/NodeJsHttpEndpoint.ts`
  - HTTP endpoint lifecycle
  
- `/home/user/matter.js/packages/nodejs/src/net/WsAdapter.ts`
  - WebSocket adaptation

#### 3. LOGGING (MEDIUM PRIORITY)
- `/home/user/matter.js/packages/nodejs/src/log/FileLogger.ts`
  - File-based logging, rotation, error handling

---

## GENERAL PACKAGE ANALYSIS

### Module Coverage Summary
```
packages/general/src/
├── codec/              [✓ 75% tested]
├── crypto/             [✓ 80% tested]
├── environment/        [✓ 25% tested]
├── log/                [✓ 10% tested]
├── math/               [✓ 100% tested]
├── net/                [✗ 0% tested] ← CRITICAL GAP
├── storage/            [✓ 80% tested]
├── transaction/        [✓ 100% tested]
├── time/               [✗ 0% tested] ← CRITICAL GAP
├── util/               [✓ 26% tested] ← HUGE GAP (24+ untested)
├── polyfills/          [✓ Not needed]
└── MatterError.ts      [✓ tested]
```

### CRITICAL: Untested Utility Functions (24+ files)

#### High-Impact, Small-Scope Utilities
1. **Mutex.ts** - Task queue with mutual exclusion
   - `run()`, `produce()`, `lock()` methods
   - Closed state management
   
2. **Cache.ts** - Value/async caching
   - Expiration, key-based generation
   - Callback on expiration
   
3. **Lifecycle.ts** - Lifecycle state machine
   - Status assertions
   - Dependency error types
   
4. **DataReader.ts** - Binary deserialization
   - Read integers, floats, bytes
   - Endian support
   
5. **DataWriter.ts** - Binary serialization
   - Write integers, floats, bytes
   - Endian support

#### Other Critical Utilities (Alphabetical)
- Abort.ts - Abort signal handling
- Array.ts - Array utilities (groupBy, flatten, etc.)
- Boot.ts - Bootstrap initialization hooks
- Cancelable.ts - Cancellation interface
- Construction.ts - Object construction helpers
- DataReadQueue.ts - Buffered read queue
- Entropy.ts - Entropy/randomness operations
- FormattedText.ts - Text formatting/wrapping
- Function.ts - Function composition utilities
- Introspection.ts - Object property introspection
- Map.ts - Map utilities and interfaces
- Multiplex.ts - Multiplexing utilities
- NamedHandler.ts - Named callback registry
- Number.ts - Number utilities (hex conversion, min/max)
- PromiseQueue.ts - Promise queue management
- Set.ts - Set utilities and interfaces
- Singleton.ts - Singleton pattern implementation
- Streams.ts - Stream utilities and error handling
- Type.ts - Type system utilities

### CRITICAL: Network Abstractions (15 files, 0% tested)

#### Core Network Interfaces
- `/home/user/matter.js/packages/general/src/net/Network.ts`
  - Abstract network interface (getNetInterfaces, createUdpChannel)
  
- `/home/user/matter.js/packages/general/src/net/Channel.ts`
  - Abstract channel interface
  
- `/home/user/matter.js/packages/general/src/net/AppAddress.ts`
  - Address parsing (IPv4, IPv6, hostnames)
  
- `/home/user/matter.js/packages/general/src/net/ServerAddress.ts`
  - Server address representation
  
- `/home/user/matter.js/packages/general/src/net/ConnectionlessTransport.ts`
  - Connectionless transport abstraction

#### Retry & Scheduling
- `/home/user/matter.js/packages/general/src/net/RetrySchedule.ts` (3378 bytes)
  - Exponential backoff calculation
  - Retry attempt tracking

#### HTTP Layer (5 files)
- `/home/user/matter.js/packages/general/src/net/http/HttpEndpoint.ts`
- `/home/user/matter.js/packages/general/src/net/http/HttpEndpointFactory.ts`
- `/home/user/matter.js/packages/general/src/net/http/HttpEndpointGroup.ts`
- `/home/user/matter.js/packages/general/src/net/http/HttpService.ts`
- `/home/user/matter.js/packages/general/src/net/http/HttpSharedEndpoint.ts`

#### UDP Layer (3 files)
- `/home/user/matter.js/packages/general/src/net/udp/UdpChannel.ts`
- `/home/user/matter.js/packages/general/src/net/udp/UdpInterface.ts`
- `/home/user/matter.js/packages/general/src/net/udp/UdpMulticastServer.ts`

#### MQTT Support (4 files)
- `/home/user/matter.js/packages/general/src/net/mqtt/MqttEndpoint.ts`
- `/home/user/matter.js/packages/general/src/net/mqtt/MqttEndpointFactory.ts`
- `/home/user/matter.js/packages/general/src/net/mqtt/MqttService.ts`

#### Mock/Testing Infrastructure (4 files)
- `/home/user/matter.js/packages/general/src/net/mock/MockNetwork.ts`
- `/home/user/matter.js/packages/general/src/net/mock/MockRouter.ts`
- `/home/user/matter.js/packages/general/src/net/mock/MockUdpChannel.ts`
- `/home/user/matter.js/packages/general/src/net/mock/NetworkSimulator.ts`

### CRITICAL: Time Utilities (5 files, 0% tested)
- `/home/user/matter.js/packages/general/src/time/Duration.ts`
- `/home/user/matter.js/packages/general/src/time/Time.ts`
- `/home/user/matter.js/packages/general/src/time/TimeUnit.ts`
- `/home/user/matter.js/packages/general/src/time/Timespan.ts`
- `/home/user/matter.js/packages/general/src/time/Timestamp.ts`

### MEDIUM: Environment & Configuration (4 files, ~25% tested)
- `/home/user/matter.js/packages/general/src/environment/Environment.ts` - Service container
- `/home/user/matter.js/packages/general/src/environment/Environmental.ts` - Interface
- `/home/user/matter.js/packages/general/src/environment/RuntimeService.ts` - Runtime abstraction
- `/home/user/matter.js/packages/general/src/environment/ServiceBundle.ts` - Service registration

---

## PROTOCOL PACKAGE ANALYSIS

### Major Module Coverage
```
packages/protocol/src/
├── action/                [✗ 0% tested] ← 37 FILES
├── advertisement/         [✗ 0% tested] ← 15 FILES
├── bdx/                   [✓ tested]
├── ble/                   [✓ tested]
├── certificate/           [✓ tested]
├── cluster/               [✗ 0% tested] ← 6 FILES
├── codec/                 [✓ tested]
├── common/                [✓ tested]
├── dcl/                   [✗ 0% tested] ← 2 FILES
├── events/                [✗ 0% tested] ← 7 FILES
├── fabric/                [✓ tested]
├── groups/                [✓ tested]
├── interaction/           [✓ tested]
├── mdns/                  [✓ tested]
├── peer/                  [✗ 0% tested] ← 10 FILES
├── protocol/              [✓ tested]
├── securechannel/         [✗ 0% tested] ← 2 FILES
└── session/               [✓ tested]
```

### CRITICAL GAPS: 88 untested files across 6 categories

#### 1. ACTION LAYER (37 files) - COMPLETE GAP
**Impact**: CRITICAL - This is the core protocol interaction layer

##### Client-Side Actions
- `/home/user/matter.js/packages/protocol/src/action/client/ClientInteraction.ts`
- `/home/user/matter.js/packages/protocol/src/action/client/InputChunk.ts`
- `/home/user/matter.js/packages/protocol/src/action/client/ReadScope.ts`
- `/home/user/matter.js/packages/protocol/src/action/client/subscription/` (6 files)
  - ClientSubscription.ts, ClientSubscriptions.ts
  - ClientSubscriptionHandler.ts, ClientSubscribe.ts
  - PeerSubscription.ts, SustainedSubscription.ts

##### Server-Side Actions (9 files)
- `/home/user/matter.js/packages/protocol/src/action/server/ServerInteraction.ts`
- `/home/user/matter.js/packages/protocol/src/action/server/AccessControl.ts`
- `/home/user/matter.js/packages/protocol/src/action/server/Subject.ts`
- `/home/user/matter.js/packages/protocol/src/action/server/DataResponse.ts`
- `/home/user/matter.js/packages/protocol/src/action/server/CommandInvokeResponse.ts`
- `/home/user/matter.js/packages/protocol/src/action/server/AttributeWriteResponse.ts`
- `/home/user/matter.js/packages/protocol/src/action/server/AttributeSubscriptionResponse.ts`
- `/home/user/matter.js/packages/protocol/src/action/server/EventReadResponse.ts`
- `/home/user/matter.js/packages/protocol/src/action/server/AttributeReadResponse.ts`

##### Request/Response Objects
- Read.ts, Write.ts, Invoke.ts, Subscribe.ts (4 files)
- ReadResult.ts, WriteResult.ts, InvokeResult.ts, SubscribeResult.ts (4 files)

##### Core Abstractions
- Interactable.ts, protocols.ts, errors.ts, Val.ts
- Specifier.ts, MalformedRequestError.ts

#### 2. ADVERTISEMENT LAYER (15 files) - COMPLETE GAP
**Impact**: CRITICAL - Device discovery and commissioning

##### Core Advertisement (5 files)
- `/home/user/matter.js/packages/protocol/src/advertisement/Advertisement.ts`
- `/home/user/matter.js/packages/protocol/src/advertisement/Advertiser.ts`
- `/home/user/matter.js/packages/protocol/src/advertisement/CommissioningMode.ts`
- `/home/user/matter.js/packages/protocol/src/advertisement/ServiceDescription.ts`
- `/home/user/matter.js/packages/protocol/src/advertisement/PairingHintBitmap.ts`

##### mDNS Advertisement (5 files)
- `/home/user/matter.js/packages/protocol/src/advertisement/mdns/MdnsAdvertisement.ts`
- `/home/user/matter.js/packages/protocol/src/advertisement/mdns/MdnsAdvertiser.ts`
- `/home/user/matter.js/packages/protocol/src/advertisement/mdns/OperationalMdnsAdvertisement.ts`
- `/home/user/matter.js/packages/protocol/src/advertisement/mdns/CommissionableMdnsAdvertisement.ts`
- `/home/user/matter.js/packages/protocol/src/advertisement/mdns/CommissionerMdnsAdvertisement.ts`

##### BLE Advertisement (2 files)
- `/home/user/matter.js/packages/protocol/src/advertisement/ble/BleAdvertisement.ts`
- `/home/user/matter.js/packages/protocol/src/advertisement/ble/BleAdvertiser.ts`

#### 3. PEER MANAGEMENT (10 files) - COMPLETE GAP
**Impact**: HIGH - Remote device interaction

- `/home/user/matter.js/packages/protocol/src/peer/OperationalPeer.ts`
- `/home/user/matter.js/packages/protocol/src/peer/PeerSet.ts`
- `/home/user/matter.js/packages/protocol/src/peer/ControllerDiscovery.ts`
- `/home/user/matter.js/packages/protocol/src/peer/ControllerCommissioner.ts`
- `/home/user/matter.js/packages/protocol/src/peer/ControllerCommissioningFlow.ts`
- `/home/user/matter.js/packages/protocol/src/peer/InteractionQueue.ts`
- `/home/user/matter.js/packages/protocol/src/peer/PeerAddressStore.ts`
- `/home/user/matter.js/packages/protocol/src/peer/PeerAddress.ts`
- `/home/user/matter.js/packages/protocol/src/peer/PhysicalDeviceProperties.ts`

#### 4. CLUSTER CLIENT (6 files) - COMPLETE GAP
**Impact**: HIGH - Cluster-level operations

- `/home/user/matter.js/packages/protocol/src/cluster/client/AttributeClient.ts`
- `/home/user/matter.js/packages/protocol/src/cluster/client/ClusterClient.ts`
- `/home/user/matter.js/packages/protocol/src/cluster/client/EventClient.ts`
- `/home/user/matter.js/packages/protocol/src/cluster/client/ClusterClientTypes.ts`

#### 5. EVENT SYSTEM (7 files) - COMPLETE GAP
**Impact**: MEDIUM - Event storage and subscription

- `/home/user/matter.js/packages/protocol/src/events/EventStore.ts`
- `/home/user/matter.js/packages/protocol/src/events/VolatileEventStore.ts`
- `/home/user/matter.js/packages/protocol/src/events/NonvolatileEventStore.ts`
- `/home/user/matter.js/packages/protocol/src/events/BaseEventStore.ts`
- `/home/user/matter.js/packages/protocol/src/events/OccurrenceManager.ts`
- `/home/user/matter.js/packages/protocol/src/events/Occurrence.ts`

#### 6. OTHER CRITICAL GAPS

##### Secure Channel (2 files)
- `/home/user/matter.js/packages/protocol/src/securechannel/SecureChannelMessenger.ts`
- `/home/user/matter.js/packages/protocol/src/securechannel/SecureChannelStatusMessageSchema.ts`

##### DCL - Device Credential List (2 files)
- `/home/user/matter.js/packages/protocol/src/dcl/DclRestApiTypes.ts`
- `/home/user/matter.js/packages/protocol/src/dcl/DclClient.ts`

---

## RECOMMENDED TEST IMPLEMENTATION ORDER

### Phase 1: Foundation (Low-hanging fruit)
1. **Mutex.ts** (150 lines) - Synchronization primitive
   - run(), produce(), lock() methods
   - Closed state behavior
   
2. **Cache.ts** (113 lines) - Caching utility
   - get(), delete(), clear()
   - Expiration callbacks
   
3. **DataReader.ts** + **DataWriter.ts** - Binary I/O pair
   - Endian handling
   - Type serialization

### Phase 2: Node.js Integration (Medium complexity)
4. **ProcessManager.ts** - Signal handling
5. **NodeJsNetwork.ts** - Network interface discovery
6. **RetrySchedule.ts** - Exponential backoff

### Phase 3: Protocol Core (High complexity)
7. Basic **action/request/** (Read, Write, Invoke, Subscribe)
8. Basic **action/response/** types
9. **peer/PeerAddress.ts** - Address management

### Phase 4: Discovery & Commissioning (High complexity)
10. **advertisement/** layer basics
11. **cluster/client/** basics

---

## Test Effort Estimation

| Category | Files | Est. Tests | Priority |
|----------|-------|------------|----------|
| Mutex | 1 | 4-6 | HIGH |
| Cache | 1 | 5-8 | HIGH |
| DataReader/Writer | 2 | 6-10 | HIGH |
| Lifecycle | 1 | 4-6 | HIGH |
| ProcessManager | 1 | 6-8 | HIGH |
| NodeJsNetwork | 4 | 8-12 | HIGH |
| action/* | 37 | 20-30 | CRITICAL |
| advertisement/* | 15 | 15-20 | CRITICAL |
| peer/* | 10 | 10-15 | HIGH |
| Network abstractions | 15 | 12-18 | MEDIUM |
| Time utilities | 5 | 8-12 | MEDIUM |
| Event system | 7 | 8-12 | MEDIUM |
| **TOTAL** | **99+** | **105-167** | - |

