# OTA Updates with matter.js – Implementation Guide

This guide explains how to implement OTA (Over-The-Air) firmware updates for Matter devices using matter.js.

## Overview

The matter.js library provides a built-in OTA Provider functionality that automatically:
1. Checks for official firmware updates from the CSA DCL (Distributed Compliance Ledger)
2. Notifies you when updates are available for a node
3. Manages the download and update process
4. Tracks progress through the update states

> **Note:** The OTA Provider requires internet access to query the CSA DCL for available firmware updates. Without internet connectivity, DCL queries will fail. You can still use locally imported OTA files (see "Test and Local OTA Images" section) when offline.

## Basic Implementation

### 1. Enable OTA Provider on Controller Creation

When creating your `CommissioningController` (current/legacy API), you need to enable the OTA provider:

```typescript
const commissioningController = new CommissioningController({
    ...
    enableOtaProvider: true,  // Enable OTA provider
});

await commissioningController.start();
```

When you enable the OTA provider, a new endpoint is added to the Controller Node, which devices use to query updates.

This step will be slightly different in the upcoming Node-based API, and we will add information about this later.
The other steps should be the same for both cases.

### 2. Subscribe to Update Availability Events

The main part you interact with for software updates is the `SoftwareUpdateManager` behavior, which is installed on the same endpoint as the OTA provider.
The `SoftwareUpdateManager` queries the DCL for available updates at a configurable interval (by default every 24 hours, and initially within a random 5–15 minute window after the controller goes online), and notifies you when new ones are available. 
This also means that on initial controller start, no update information is known and all nodes are newly notified. If you want to persist available updates over controller restarts, please do so yourself. All nodes that are connected and have an active subscription are checked for updates, because without an active subscription we cannot know if the current version information is still valid and also cannot monitor the update process. 

To receive update events, subscribe to the `SoftwareUpdateManager` events on the OTA provider after the controller starts:

```typescript
const observers = new ObserverGroup();

// Listen for update availability notifications
observers.on(
    commissioningController.otaProvider.eventsOf(SoftwareUpdateManager).updateAvailable,
    (peerAddress, info: SoftwareUpdateInfo) => {
        const nodeId = peerAddress.nodeId.toString();
        console.log(`Update available for node ${nodeId}:`);
        console.log(`  Available version (numeric): ${info.softwareVersion}`);
        console.log(`  New version: ${info.softwareVersionString} (${info.softwareVersion})`);
        console.log(`  Release notes: ${info.releaseNotesUrl || 'N/A'}`);
    }
);

// Listen for update completion notifications
observers.on(
    commissioningController.otaProvider.eventsOf(SoftwareUpdateManager).updateDone,
    (peerAddress) => {
        const nodeId = peerAddress.nodeId.toString();
        console.log(`Update completed for node ${nodeId}`);
    }
);
```

The `SoftwareUpdateInfo` object in the event for an available update contains:

```typescript
interface SoftwareUpdateInfo {
    vendorId: VendorId;            // Vendor ID of the device
    productId: number;             // Product ID of the device
    softwareVersion: number;       // Numeric version (e.g., 2)
    softwareVersionString: string; // Human-readable version (e.g., "2.0.0")
    releaseNotesUrl?: string;      // Optional URL to release notes
    specificationVersion?: number; // Optional Matter specification version
}
```

### 3. Triggering an Update

To initiate a firmware update, you have two options:

* **Option A**: Use `SoftwareUpdateManager.forceUpdate()` to trigger an update on a specific node immediately. The update starts right away and runs in parallel to other potentially queued updates.
* **Option B**: Use `SoftwareUpdateManager.addUpdateConsent()` to grant consent for the update. The update is added to a queue and executed automatically in the background.

```typescript
await commissioningController.otaProvider.act(agent => {
    return agent
        .get(SoftwareUpdateManager)
        .forceUpdate(
            PeerAddress({ nodeId, fabricIndex: FabricIndex(1) }),
            vendorId,
            productId,
            targetVersion
        );
});
```

You can check if consent has already been granted for a specific node using `hasConsent()`:

```typescript
const hasConsent = await commissioningController.otaProvider.act(agent =>
    agent.get(SoftwareUpdateManager).hasConsent(
        PeerAddress({ nodeId, fabricIndex: FabricIndex(1) }),
        targetVersion  // Optional: check for specific version
    )
);
```

### 4. Monitoring Update Progress

Subscribe to the OTA Update Requestor events on the paired/client node to track progress:

```typescript
async function monitorUpdateProgress(node: PairedNode): Promise<void> {
    const observers = new ObserverGroup();

    // Get OTA events from the ClientNode
    const otaEvents = node.node.eventsOf(OtaSoftwareUpdateRequestorClient);

    // Listen for state transitions
    observers.on(otaEvents.stateTransition, async (payload, _context) => {
        const { newState, previousState, targetSoftwareVersion } = payload;
        console.log(`OTA state: ${OtaSoftwareUpdateRequestor.UpdateState[newState]}`);
        switch (newState) {
            case OtaSoftwareUpdateRequestor.UpdateState.Querying:
            case OtaSoftwareUpdateRequestor.UpdateState.DelayedOnQuery:
                console.log('Querying for update...');
                break;
            case OtaSoftwareUpdateRequestor.UpdateState.Downloading:
                console.log('Downloading update...');
                break;
            case OtaSoftwareUpdateRequestor.UpdateState.Applying:
            case OtaSoftwareUpdateRequestor.UpdateState.DelayedOnApply:
                console.log('Applying update...');
                break;
            case OtaSoftwareUpdateRequestor.UpdateState.RollingBack:
                console.log('Rolling back update...');
                break;
            case OtaSoftwareUpdateRequestor.UpdateState.Idle:
                console.log('Update complete or cancelled');
                break;
        }
    });

    // Listen for download progress updates
    observers.on(otaEvents.updateStateProgress$Changed, async (value, _oldValue, _context) => {
        if (value !== null) {
            console.log(`State step progress: ${value}%`);
        }
    });
}
```

When the update state switches to "Applying", the device applies the update and restarts. This usually takes longer than normal restarts. The controller will detect this and reconnect automatically, but this may take some extra time. The device should come back online automatically.

The `updateDone` event is triggered on a best-effort basis, based on (formally optional) events from the device and validation of software version changes on reconnect. We cannot guarantee that the `updateDone` event will always be triggered.

#### OtaUpdateStatus Enum

The `SoftwareUpdateManager` uses the following internal status values to track update progress:

```typescript
enum OtaUpdateStatus {
    Unknown,        // Initial state or state after reset
    WaitForConsent, // Update available, waiting for user consent
    Querying,       // Device is querying for update information
    Downloading,    // Firmware is being downloaded
    WaitForApply,   // Download complete, waiting for apply approval request
    Applying,       // Device is applying the update
    Done,           // Update completed successfully
    Cancelled       // Update was cancelled before completion
}
```

These status values are used internally by `onOtaStatusChange()` to track the progress of updates in the queue.

### 5. Cancelling an Update

To cancel an ongoing update (only possible during Querying/Downloading states), use `SoftwareUpdateManager.removeConsent()`. This removes the consent and removes queued entries from the update queue. It also cancels file transfers that are in progress and would decline the OTA "apply"-approval. If the update is already in the Applying state, cancellation is not possible.

```typescript
await commissioningController.otaProvider.act(agent =>
    agent
        .get(SoftwareUpdateManager)
        .removeConsent(PeerAddress({ nodeId, fabricIndex: FabricIndex(1) }))
);

```

**Important:** After cancelling an update, the device may be blocked from receiving another update attempt for approximately 5-15 minutes due to Matter protocol constraints. This is because we simply cancel the BDX session which ends in a failed update after relevant timeouts.

## Important Notes on Update Duration

**Users and developers should be aware that OTA updates can take a significant amount of time and may appear to be "stuck" at various stages.**

### Timing Expectations

- **Thread devices**: Updates can take 10-30+ minutes due to the low-bandwidth nature of Thread networks
- **WiFi devices**: Typically faster (5-15 minutes) but can still vary significantly
- **Battery-powered devices**: May take even longer as devices may only check for updates periodically when awake

### User Communication Best Practices

When implementing OTA updates in your application, always inform users:

1. **Before starting**: Display a notice that updates can take several minutes depending on device and connection type
2. **During the update**: Show a patience message alongside the progress indicator
3. **Apparent "stuck" states**: Explain that the update may appear frozen but is still progressing

## Enhanced: Query all/specific node for updates

You can use `SoftwareUpdateManager.queryUpdates()` to query all nodes, or a specific `ClientNode` instance for available updates.

```typescript
// Query all nodes for updates
const updates = await commissioningController.otaProvider.act(agent =>
    agent.get(SoftwareUpdateManager).queryUpdates()
);

// Query a specific node for updates
const updates = await commissioningController.otaProvider.act(agent =>
    agent.get(SoftwareUpdateManager).queryUpdates({ peerToCheck: clientNode })
);

// Include already-known stored updates without re-querying DCL
const updates = await commissioningController.otaProvider.act(agent =>
    agent.get(SoftwareUpdateManager).queryUpdates({ includeStoredUpdates: true })
);
```

**Options:**
* `peerToCheck`: Optional `ClientNode` to check for updates. If not specified, all connected nodes are checked.
* `includeStoredUpdates`: When `true`, returns already-known local updates without re-querying the DCL. Useful for quickly checking cached update information.

## Enhanced: Configure behavior of the `SoftwareUpdateManager`

The SoftwareUpdateManager can be configured via its state variables. The defaults are usually good and compliant with the Matter specification, but you can adjust them if needed.

* `allowTestOtaImages`: Set to true to also query/consider the CSA Test DCL or local files for OTA updates
* `updateCheckInterval`: Interval in milliseconds for checking for updates (default 24 hours should be sufficient for most cases)
* `announceAsDefaultProvider`: By default, we announce this node as the default OTA provider on startup and on new commissionings to all commissioned devices. Set to false to disable this behavior.
* `announcementInterval`: Interval in milliseconds for verifying the OTA provider on the devices (default 24 hours should be sufficient for most cases). In reality, a random portion is added to the interval as defined by the Matter specification.

## Enhanced: Extending the OtaSoftwareUpdateProviderServer

The `OtaSoftwareUpdateProviderServer` is the default implementation of the OTA Provider endpoint. It provides two extension methods you can override for custom behavior:

* `checkUpdateAvailable`: By default, this method uses the `SoftwareUpdateManager` to check for available updates from the DCL or local OTA storage. Override this method to implement vendor-specific update logic.
* `requestUserConsentForUpdate`: Override this method to gather user consent through alternative means. For example, you could implement automatic consent for certain device types (e.g., sensors and lights) while requiring manual approval for others (e.g., sockets). Consents granted through this method are applied via the update queue.

## Enhanced: Test and Local OTA Images

When enabled (see above), you can also use local OTA files for testing purposes.
For testing or providing custom firmware updates that aren't available through the DCL, you can import local files that need to be Matter OTA files.

### Importing Custom OTA Files

The `DclOtaUpdateService` allows you to import custom files from a local directory. The files are verified and all Matter-relevant information is extracted from the header.
If the file is valid, it will be stored in the internal matter.js storage with a name derived from vendor-id and product-id. Only one file is stored per vendor-id/product-id pair. If you use Matter test vendor-id/product-id values, this could lead to conflicts, so proceed with caution.

```typescript
try {
    const filePath = "..."; // Filename of the file to import in local filesystem
    console.log(`Importing OTA file: ${filePath}`);

    // Create a stream for reading header info
    const stream1 = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
    const updateInfo = await otaService.updateInfoFromStream(stream1, `file://${filePath}`);

    console.log(`OTA file "${filePath}": vendorId=${updateInfo.vid}, productId=${updateInfo.pid}, version=${updateInfo.softwareVersion}`);

    // Create another stream for storing
    const stream2 = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
    await otaService.store(stream2, updateInfo, false);

    console.log(`Successfully imported OTA file: ${filePath}`);
} catch (error) {
    console.warn(`Failed to import OTA file "${filePath}": ${error}`);
}
```

## Enhanced: More Examples

You can find more examples in the matter.js shell app (`packages/nodejs-shell`). The `ota` commands implement additional use cases:

* `ota info <file>` - Display OTA image information
* `ota verify <file>` - Verify an OTA image file
* `ota list` - List downloaded OTA images in storage
* `ota add <file>` - Add an OTA image file to storage
* `ota delete` - Delete OTA image(s) from storage
* `ota copy` - Copy OTA image from storage to filesystem
* `ota extract <file>` - Extract payload from an OTA image
