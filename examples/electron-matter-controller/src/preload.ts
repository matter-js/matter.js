// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    handleMatter: (
        threadNetworkNameText: string,
        threadOperationalDatasetText: string,
        matterLongDiscriminatorNumber: number,
        matterPasscodeNumber: number
    ) => ipcRenderer.invoke(
        'handle-matter',
        threadNetworkNameText,
        threadOperationalDatasetText,
        matterLongDiscriminatorNumber,
        matterPasscodeNumber)
})
