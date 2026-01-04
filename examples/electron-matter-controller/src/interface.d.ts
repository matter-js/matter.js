export interface IElectronAPI {
    handleMatter: (
        threadNetworkNameText: string,
        threadOperationalDatasetText: string,
        matterLongDiscriminatorNumber: number,
        matterPasscodeNumber: number,
    ) => Promise<void>;
}

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}
