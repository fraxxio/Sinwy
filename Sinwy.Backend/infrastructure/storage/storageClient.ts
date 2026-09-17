import appConfig from "@config";
import { localStorageClient } from "./localStorageClient";
import type { StorageClient } from "./storageClientTypes";

// keyed by STORAGE_DRIVER so adding a driver in appConfig fails here until it has a client
const clients = {
	local: localStorageClient,
} satisfies Record<(typeof appConfig)["STORAGE_DRIVER"], StorageClient>;

export const storageClient = clients[appConfig.STORAGE_DRIVER];
