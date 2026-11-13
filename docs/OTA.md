# OTA Updates with matter.js – Implementation Guide

This guide explains how to implement OTA (Over-The-Air) firmware updates for Matter devices using matter.js.

## Overview

The matter.js library provides a built-in OTA Provider functionality that automatically:
1. Checks for official firmware updates from the CSA DCL (Distributed Compliance Ledger)
2. Notifies you when updates are available for a node
3. Manages the download and update process
4. Tracks progress through the update states

> **Note:** The OTA Provider requires internet access to query the CSA DCL for available firmware updates. Without internet connectivity, DCL queries will fail. Locally imported OTA files (see "Test and Local OTA Images" section) work offline, but only with `allowTestOtaImages` enabled.

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
The `SoftwareUpdateManager` queries the DCL for available updates at a configurable interval (by default every 24 hours, and initially within a random 5–10 minute window after the controller goes online), and notifies you when new ones are available. 
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
    source: OtaUpdateSource;       // Where the image comes from: "local", "dcl-prod" or "dcl-test"
}
```

### 3. Triggering an Update

To initiate a firmware update, you have two options:

* **Option A**: Use `SoftwareUpdateManager.forceUpdate()` to trigger an update on a specific node immediately. The node is announced right away, also while other queued updates run. The call does not wait for the announcement; once the node takes the update, the outcome is reported via the `updateDone` and `updateFailed` events. It does not say whether an announcement started; use `queuedUpdates` and the events for that. It throws `OtaUpdateError` when the node cannot get the target now; see the JSDoc of `forceUpdate()` for the full list of cases.
* **Option B**: Use `SoftwareUpdateManager.addUpdateConsent()` to grant consent for the update. The update is added to a queue and executed automatically in the background.

```typescript
// `node` is the ClientNode to update
await commissioningController.otaProvider.act(agent => {
    return agent
        .get(SoftwareUpdateManager)
        .forceUpdate(node.peerAddress!, {
            vendorId,
            productId,
            targetSoftwareVersion: targetVersion,
        });
});
```

A consent is for exactly one version, and a node has one consent: a new consent replaces the previous one. The node is offered that version and may apply it. A consent for a version at or below the one the node runs is not stored, and `addUpdateConsent()` returns false. `forceUpdate()` replaces the consent the same way; it throws `OtaUpdateError` when the node already runs the target or a higher version, or while a BDX transfer of another or an unknown version of the node runs. `addUpdateConsent()` and `forceUpdate()` throw `OtaUpdateError` for a peer address no node has, as for a node removed meanwhile, and `ImplementationError` when an applicable node does not match the vendor or product ID. For a node that is not applicable for updates, `addUpdateConsent()` stores the consent and returns false, and `forceUpdate()` throws `OtaUpdateError`. When the peer of a node is deleted, as by a decommission or a delete, its consent and its queued update are dropped without an event. Consents are not persisted, so they are not kept across a restart of the controller. When the consented version is not stored, or stored only as a local or test-net image while `allowTestOtaImages` is off, the node is offered nothing. With `delegateConsentToRequestor` set, a node that can obtain consent itself is offered the newest applicable stored image instead, and it should ask its user before it downloads it.

You can check if consent has already been granted for a specific node using `hasConsent()`:

```typescript
const hasConsent = await commissioningController.otaProvider.act(agent =>
    agent.get(SoftwareUpdateManager).hasConsent(
        node.peerAddress!,
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

When the update state switches to "Applying", the device applies the update and restarts. This usually takes longer than normal restarts. The controller will detect this and reconnect automatically, but this may take some extra time. The device should come back online automatically. If the device still reports its previous software version when the controller resubscribes later than three minutes after the apply delay, or when it queries for an update again, the update is reported as failed via the `updateFailed` event. `updateFailed` is also emitted when the node finds no stored image for its queued update; see `SoftwareUpdateManager.dropUndeliverableUpdate()` for the exact condition. A failed update keeps its consent for 24 hours. During that time it is not announced to the node again, and a later update check does not announce it again, but the node may still query and apply it on its own; some devices need several attempts. A new consent queues the update again; it is announced once no other update is underway. `forceUpdate()` announces it again at once. A consent given while the node cannot be updated is stored, and a later update check queues it. A consent given while the node follows an update to another version takes effect when that update ends. A node that restarts with its old version after the download but before it asks to apply is announced the update again; a restart with its old version while it applies fails the update, as do the cases above. `updateFailed` is emitted at the first failure since the consent was given; a new consent starts over. An update cancelled with `removeConsent()` (see below) loses its consent. The events are emitted once the state of the `SoftwareUpdateManager` is final, so a listener may add or remove consents or force an update.

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

The OTA provider reports these status values for each QueryImage flow of a node. A status moves a queued update only when it belongs to the offer of that update's version that the provider answered the query with; while the node follows that offer, `queuedUpdates` shows the last status as `lastProgressStatus`. A `NotifyUpdateApplied` with a version at or above the target completes the update from any offer, as it reports the version the node runs. An apply of the update's version under an update token the provider does not know also links the update to the node's new offer.

### 5. Cancelling an Update

To cancel an update, use `SoftwareUpdateManager.removeConsent()`. Without a version, this removes the node's consent and, unless its update already applies, cancels the queued update and any BDX transfer of the node. With a version, the consent is removed only when it is for that version; a queued update to that version is cancelled, with its BDX transfer when the node was announced for it or follows it, and an update to another version continues. A cancelled update is reported via `updateFailed`, unless its failure was already reported. An update in the Applying state can no longer be cancelled: its consent is removed, but the node may still finish that apply. While the attempt of an update token runs, the token no longer allows the apply of a removed version. Once the attempt ended, as after a failure, the token is unknown, and an apply of a version above 0 under it is allowed as described below. `removeConsent()` ends the node's queries that made no offer yet, whether or not a consent was stored, so the provider answers them "not available". Nothing is remembered after the call: a later query is decided by the consent and the settings of that moment. An apply under an update token the provider does not know, as after a restart of the controller, is allowed for a version above 0, also without a consent, because consents are not persisted and the specification does not let a provider keep refusing an apply for an unknown token. Version 0 names the version offered under the update token, so under an unknown token it is declined.

```typescript
await commissioningController.otaProvider.act(agent =>
    agent
        .get(SoftwareUpdateManager)
        .removeConsent(node.peerAddress!)
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

// Also consider the update images already stored
const updates = await commissioningController.otaProvider.act(agent =>
    agent.get(SoftwareUpdateManager).queryUpdates({ includeStoredUpdates: true })
);
```

**Options:**
* `peerToCheck`: Optional `ClientNode` to check for updates. If not specified, all connected nodes are checked.
* `includeStoredUpdates`: When `true`, also considers the update images already stored, including local images while `allowTestOtaImages` is set.

## Enhanced: Configure behavior of the `SoftwareUpdateManager`

The SoftwareUpdateManager can be configured via its state variables. The defaults are usually good and compliant with the Matter specification, but you can adjust them if needed.

* `allowTestOtaImages`: Set to true to also query the CSA Test DCL and to offer stored test-net and local images. Without it, only production images are offered
* `updateCheckInterval`: Interval in milliseconds for checking for updates (default 24 hours should be sufficient for most cases)
* `announceAsDefaultProvider`: Set to true to announce this node as the default OTA provider to all commissioned devices: first 10 to 15 minutes after the controller goes online, then every `announcementInterval`. A newly commissioned device is not announced at once. Default is false, so a node is announced only when it has a queued update.
* `announcementInterval`: Interval in milliseconds for verifying the OTA provider on the devices (default 24 hours should be sufficient for most cases). In reality, a random portion is added to the interval as defined by the Matter specification.
* `delegateConsentToRequestor`: Set to true to offer a node that can obtain user consent itself the newest applicable stored image without a consent given to the `SoftwareUpdateManager`, and to let it apply that image. Default is false. A node with `LocalConfigDisabled` set is never asked to obtain consent itself. Such an update has no queue entry unless the node also has a consent, so it is usually not reported via `updateDone` or `updateFailed`.

The `OtaSoftwareUpdateProviderServer` state has one setting of its own:

* `applyDelay`: How long a device allowed to apply an update waits before it applies (`DelayedActionTime`, sent in whole seconds, at most a day). Default is no delay. The controller expects the device's restart only after this delay.

## Enhanced: Extending the OtaSoftwareUpdateProviderServer

The `OtaSoftwareUpdateProviderServer` is the default implementation of the OTA Provider endpoint. It provides two extension methods you can override for custom behavior:

* `checkUpdateAvailable`: By default, this method uses the `SoftwareUpdateManager` to find a stored update for the querying node: the stored version it has a consent for, or, with `delegateConsentToRequestor` set, the newest applicable stored image for a node that can obtain consent itself. When it finds nothing, it calls `SoftwareUpdateManager.dropUndeliverableUpdate()`. Override this method to implement vendor-specific update logic. Returning `undefined` answers "not available"; an override decides itself whether to call `dropUndeliverableUpdate()`. An offer without `consentRequired` is the consent of the override itself, as the specification lets the node assume, and the provider trusts it. The node may apply the offered version under the update token of that offer while the attempt of that token runs, unless a consent for that version is removed.
* `requestUserConsentForUpdate`: Override this method to gather user consent through alternative means. For example, you could implement automatic consent for certain device types (e.g., sensors and lights) while requiring manual approval for others (e.g., sockets). When this method grants the consent, the node may apply the offered version under the update token of that query while the attempt of that token runs, unless a consent for that version is removed. The method is asked only for an offer with `consentRequired` that is not delegated to the node; the default `checkUpdateAvailable` makes no such offer, so this needs an override of `checkUpdateAvailable` too.

## Enhanced: Test and Local OTA Images

For testing or providing custom firmware updates that aren't available through the DCL, you can import local files that need to be Matter OTA files. Local images are offered only while `allowTestOtaImages` is set. A local image is preferred over a test-net or production image of the same version.

### Importing Custom OTA Files

The `DclOtaUpdateService` allows you to import custom files from a local directory. The files are verified and all Matter-relevant information is extracted from the header.
If the file is valid, it will be stored in the internal matter.js storage with a name derived from vendor-id and product-id. A file is stored per vendor-id/product-id pair, mode and version. If you use Matter test vendor-id/product-id values, this could lead to conflicts, so proceed with caution.

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
