import type { ISceneLoaderPluginExtensions, ISceneLoaderPluginMetadata } from "core/index";

export const ZIPMagicBase64Encoded = "UEsDBA"; // "PK\x03\x04" base64-encoded (unpadded)
export const ZIPCentralDirBase64 = "UEsC"; // "PK\x01\x02"
export const ZIPEOCDBase64 = "UEsG"; // "PK\x05\x06"

export const TmfFileLoaderMetadata = {
    name: "3MF",

    extensions: {
        ".3mf": { isBinary: true, mimeType: "model/3mf" },
    } as const satisfies ISceneLoaderPluginExtensions,

    canDirectLoad(data: string): boolean {
        return data.startsWith(ZIPMagicBase64Encoded);
    },
} as const satisfies ISceneLoaderPluginMetadata;
