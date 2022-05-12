/* eslint-disable @typescript-eslint/naming-convention */
import { Tools } from "../../Misc/tools";
import { AutoReleaseWorkerPool } from "../../Misc/workerPool";
import type { FloatArray, IndicesArray, Nullable } from "../../types";
import type { IDisposable } from "../../scene";
import { VertexBuffer } from "../../Buffers/buffer";
import { VertexData, IGetSetVerticesData } from "../../Meshes/mesh.vertexData";

declare let DracoDecoderModule: any;
declare let DracoEncoderModule: any;
declare let WebAssembly: any;

// WorkerGlobalScope
declare function importScripts(...urls: string[]): void;
declare function postMessage(message: any, transfer?: any[]): void;

function createDecoderAsync(wasmBinary?: ArrayBuffer): Promise<any> {
    return new Promise((resolve) => {
        DracoDecoderModule({ wasmBinary: wasmBinary }).then((module: any) => {
            resolve({ module: module });
        });
    });
}

function createEncoderAsync(wasmBinary?: ArrayBuffer): Promise<any> {
    return new Promise((resolve) => {
        DracoEncoderModule({ wasmBinary: wasmBinary }).then((module: any) => {
            resolve({ module: module });
        });
    });
}

export enum EncoderMethod {
    EDGEBREAKER = 1,
    SEQUENTIAL = 0,
}

enum AttributeEnum {
    POSITION = "POSITION",
    NORMAL = "NORMAL",
    COLOR = "COLOR",
    TEX_COORD = "TEX_COORD",
    GENERIC = "GENERIC",
}

const DEFAULT_QUANTIZATION_BITS = {
    [AttributeEnum.POSITION]: 14,
    [AttributeEnum.NORMAL]: 10,
    [AttributeEnum.COLOR]: 8,
    [AttributeEnum.TEX_COORD]: 12,
    [AttributeEnum.GENERIC]: 12,
};

export interface IDracoEncodedPrimitive {
    numVertices?: number;
    numIndices?: number;
    data: Uint8Array;
    attributeIDs: { [key: string]: number };
}

export interface IDracoEncoderOptions {
    // indicates how to tune the encoder regarding decode speed (0 gives better speed but worst quality)
    decodeSpeed?: number;
    // indicates how to tune the encoder parameters (0 gives better speed but worst quality)
    encodeSpeed?: number;
    method?: EncoderMethod;
    // indicates the presision of each type of data stored in the draco file
    quantizationBits?: { [key: string]: number };
    // indicate we should export normals if present
    exportNormals?: boolean;
    // indicate we should export texture coordinates if present
    exportUvs?: boolean;
    // indicate we should export colors if present
    exportColors?: boolean;
}

const DEFAULT_ENCODER_OPTIONS: IDracoEncoderOptions = {
    decodeSpeed: 5,
    encodeSpeed: 5,
    method: EncoderMethod.EDGEBREAKER,
    quantizationBits: DEFAULT_QUANTIZATION_BITS,
    exportNormals: true,
    exportUvs: true,
    exportColors: false,
};

function constantsFn() {
    return {
        encodeMeshMethod: "encodeMesh",
        encodeMeshResult: "encodeMeshResult",
        PositionKind: "position",
        NormalKind: "normal",
        UVKind: "uv",
        UV2Kind: "uv2",
        UV3Kind: "uv3",
        UV4Kind: "uv4",
        UV5Kind: "uv5",
        UV6Kind: "uv6",
        ColorKind: "color",
        nativeAttributeTypes: ["POSITION", "NORMAL", "COLOR", "TEX_COORD", "GENERIC"],
    };
}

const WORKER_CONSTANTS = constantsFn() ;

function encodeMesh(
    encoderModule: any,
    getIndices: () => Nullable<IndicesArray>,
    getVerticesData: (kind: string) => Nullable<FloatArray>,
    options: IDracoEncoderOptions,
    destination?: ArrayBuffer
): Nullable<IDracoEncodedPrimitive> {
    let indices = getIndices();
    const vertices = getVerticesData(WORKER_CONSTANTS.PositionKind);

    if (indices?.length && vertices?.length) {
        const encoder = new encoderModule.Encoder();
        const meshBuilder = new encoderModule.MeshBuilder();
        const dracoMesh = new encoderModule.Mesh();
        const attributeIDs: { [key: string]: number } = {};

        try {
            const verticesCount = vertices.length / 3;

            const prepareAttribute = (kind: string, attribute: any, numComponent: number, items?: Nullable<FloatArray>) => {
                items = items ?? getVerticesData(kind);
                const numItems = items?.length;
                if (numItems) {
                    if (!(items instanceof Float32Array)) {
                        items = Float32Array.from(items!);
                    }
                    // AddFloatAttributeToMesh is deprecated and call AddFloatAttribute
                    // see https://github.com/google/draco/blob/master/src/draco/javascript/emscripten/encoder_webidl_wrapper.cc
                    // According to https://github.com/google/draco/blob/ee2c2578a170324bffef38cb8a3c2e60d89d5e87/src/draco/javascript/emscripten/encoder_webidl_wrapper.h#L86
                    // the third parameter IS THE VERTICE COUNT, and must be similar for all the subsequent AddXXXAttribute call.
                    attributeIDs[kind] = meshBuilder.AddFloatAttribute(dracoMesh, attribute, verticesCount, numComponent, items);
                    const att = WORKER_CONSTANTS.nativeAttributeTypes[attribute];
                    if (options.quantizationBits && options.quantizationBits[att]) {
                        encoder.SetAttributeQuantization(attribute, options.quantizationBits[att]);
                    }
                }
            };

            prepareAttribute(WORKER_CONSTANTS.PositionKind, encoderModule.POSITION, 3, vertices);

            if (options.exportNormals) {
                prepareAttribute(WORKER_CONSTANTS.NormalKind, encoderModule.NORMAL, 3);
            }

            if (options.exportUvs) {
                prepareAttribute(WORKER_CONSTANTS.UVKind, encoderModule.TEX_COORD, 2);
                prepareAttribute(WORKER_CONSTANTS.UV2Kind, encoderModule.TEX_COORD, 2);
                prepareAttribute(WORKER_CONSTANTS.UV3Kind, encoderModule.TEX_COORD, 2);
                prepareAttribute(WORKER_CONSTANTS.UV4Kind, encoderModule.TEX_COORD, 2);
                prepareAttribute(WORKER_CONSTANTS.UV5Kind, encoderModule.TEX_COORD, 2);
                prepareAttribute(WORKER_CONSTANTS.UV6Kind, encoderModule.TEX_COORD, 2);
            }

            if (options.exportColors) {
                prepareAttribute(WORKER_CONSTANTS.ColorKind, encoderModule.COLOR, 4);
            }

            // add the triangles
            const numFaces = indices.length / 3; // 3 indices per face.
            if (!(indices instanceof Uint32Array) && !(indices instanceof Uint16Array)) {
                indices = (verticesCount > 65535 ? Uint32Array : Uint16Array).from(indices!);
            }
            meshBuilder.AddFacesToMesh(dracoMesh, numFaces, indices);

            // set the options
            if (options.method === 0 /*EncoderMethod.SEQUENTIAL*/) {
                encoder.SetEncodingMethod(encoderModule.MESH_SEQUENTIAL_ENCODING);
            } else if (options.method === 1 /*EncoderMethod.EDGEBREAKER*/) {
                encoder.SetEncodingMethod(encoderModule.MESH_EDGEBREAKER_ENCODING);
            } else {
                throw "unsuported Draco encoder method. Should be 0 for SEQUENTIAL or 1 for EDGEBREAKER";
            }

            encoder.SetSpeedOptions(options.encodeSpeed, options.decodeSpeed);

            // finally encode
            const encodedNativeBuffer = new encoderModule.DracoInt8Array();
            try {
                const encodedLength = encoder.EncodeMeshToDracoBuffer(dracoMesh, encodedNativeBuffer);

                // destination is giving us the ability to reuse the input buffer which is not longer used.
                // remember that he ArrayBuffer object is fixed-length so also ensure the provided buffer is large enought..
                const availableBytes = destination ? destination.byteLength : 0;
                const buffer = availableBytes < encodedLength ? new ArrayBuffer(encodedLength) : destination!;
                const encodedData = new Uint8Array(buffer, 0, encodedLength);

                // just copy the values from native wasm memory to worker heap.
                for (let i = 0; i < encodedLength; i++) {
                    encodedData[i] = encodedNativeBuffer.GetValue(i);
                }
                return { data: encodedData, attributeIDs: attributeIDs };
            } finally {
                encoderModule.destroy(encodedNativeBuffer);
            }
        } finally {
            encoderModule.destroy(meshBuilder);
            encoderModule.destroy(dracoMesh);
            encoderModule.destroy(encoder);
        }
    }
    return null;
}

function decodeMesh(
    decoderModule: any,
    dataView: ArrayBufferView,
    attributes: { [kind: string]: number } | undefined,
    onIndicesData: (data: Uint32Array) => void,
    onAttributeData: (kind: string, data: Float32Array) => void,
    dividers?: { [kind: string]: number }
): void {
    const buffer = new decoderModule.DecoderBuffer();
    buffer.Init(dataView, dataView.byteLength);

    const decoder = new decoderModule.Decoder();
    let geometry: any;
    let status: any;

    try {
        const type = decoder.GetEncodedGeometryType(buffer);
        switch (type) {
            case decoderModule.TRIANGULAR_MESH:
                geometry = new decoderModule.Mesh();
                status = decoder.DecodeBufferToMesh(buffer, geometry);
                break;
            case decoderModule.POINT_CLOUD:
                geometry = new decoderModule.PointCloud();
                status = decoder.DecodeBufferToPointCloud(buffer, geometry);
                break;
            default:
                throw new Error(`Invalid geometry type ${type}`);
        }

        if (!status.ok() || !geometry.ptr) {
            throw new Error(status.error_msg());
        }

        if (type === decoderModule.TRIANGULAR_MESH) {
            const numFaces = geometry.num_faces();
            const numIndices = numFaces * 3;
            const byteLength = numIndices * 4;

            const ptr = decoderModule._malloc(byteLength);
            try {
                decoder.GetTrianglesUInt32Array(geometry, byteLength, ptr);
                const indices = new Uint32Array(numIndices);
                indices.set(new Uint32Array(decoderModule.HEAPF32.buffer, ptr, numIndices));
                onIndicesData(indices);
            } finally {
                decoderModule._free(ptr);
            }
        }

        const processAttribute = (kind: string, attribute: any, divider = 1) => {
            const numComponents = attribute.num_components();
            const numPoints = geometry.num_points();
            const numValues = numPoints * numComponents;
            const byteLength = numValues * Float32Array.BYTES_PER_ELEMENT;

            const ptr = decoderModule._malloc(byteLength);
            try {
                decoder.GetAttributeDataArrayForAllPoints(geometry, attribute, decoderModule.DT_FLOAT32, byteLength, ptr);
                const values = new Float32Array(decoderModule.HEAPF32.buffer, ptr, numValues);
                if (kind === "color" && numComponents === 3) {
                    const babylonData = new Float32Array(numPoints * 4);
                    for (let i = 0, j = 0; i < babylonData.length; i += 4, j += numComponents) {
                        babylonData[i + 0] = values[j + 0];
                        babylonData[i + 1] = values[j + 1];
                        babylonData[i + 2] = values[j + 2];
                        babylonData[i + 3] = 1;
                    }
                    onAttributeData(kind, babylonData);
                } else {
                    const babylonData = new Float32Array(numValues);
                    babylonData.set(new Float32Array(decoderModule.HEAPF32.buffer, ptr, numValues));
                    if (divider !== 1) {
                        for (let i = 0; i < babylonData.length; i++) {
                            babylonData[i] = babylonData[i] / divider;
                        }
                    }
                    onAttributeData(kind, babylonData);
                }
            } finally {
                decoderModule._free(ptr);
            }
        };

        if (attributes) {
            for (const kind in attributes) {
                const id = attributes[kind];
                const attribute = decoder.GetAttributeByUniqueId(geometry, id);
                const divider = (dividers && dividers[kind]) || 1;
                processAttribute(kind, attribute, divider);
            }
        } else {
            const nativeAttributeTypes: { [kind: string]: string } = {
                position: "POSITION",
                normal: "NORMAL",
                color: "COLOR",
                uv: "TEX_COORD",
            };

            for (const kind in nativeAttributeTypes) {
                const id = decoder.GetAttributeId(geometry, decoderModule[nativeAttributeTypes[kind]]);
                if (id !== -1) {
                    const attribute = decoder.GetAttribute(geometry, id);
                    processAttribute(kind, attribute);
                }
            }
        }
    } finally {
        if (geometry) {
            decoderModule.destroy(geometry);
        }

        decoderModule.destroy(decoder);
        decoderModule.destroy(buffer);
    }
}

/**
 * The worker function that gets converted to a blob url to pass into a worker.
 */
function worker(): void {
    let decoderPromise: PromiseLike<any> | undefined;
    let encoderPromise: PromiseLike<any> | undefined;

    onmessage = (event) => {
        const data = event.data;
        switch (data.id) {
            case "init": {
                const codec = data.codec;
                if (codec.urls) {
                    importScripts(codec.urls[0]);
                    decoderPromise = DracoDecoderModule({ wasmBinary: codec.wasmBinaries[0] });
                    importScripts(codec.urls[1]);
                    encoderPromise = DracoEncoderModule({ wasmBinary: codec.wasmBinaries[1] });
                }
                postMessage("done");
                break;
            }
            case "decodeMesh": {
                if (!decoderPromise) {
                    throw new Error("Draco decoder module is not available");
                }
                decoderPromise.then((decoder) => {
                    decodeMesh(
                        decoder,
                        data.dataView,
                        data.attributes,
                        (indices) => {
                            postMessage({ id: "indices", value: indices }, [indices.buffer]);
                        },
                        (kind, data) => {
                            postMessage({ id: kind, value: data }, [data.buffer]);
                        }
                    );
                    postMessage("done");
                });
                break;
            }
            case WORKER_CONSTANTS.encodeMeshMethod: {
                if (!encoderPromise) {
                    throw new Error("Draco decoder module is not available");
                }

                encoderPromise.then((encoder) => {
                    const verticesData = data.verticesData;

                    const getVerticesData = (kind: string): Nullable<FloatArray> => {
                        switch (kind) {
                            case WORKER_CONSTANTS.PositionKind:
                                return verticesData.positions;
                            case WORKER_CONSTANTS.NormalKind:
                                return verticesData.normals;
                            case WORKER_CONSTANTS.UVKind:
                                return verticesData.uvs;
                            case WORKER_CONSTANTS.UV2Kind:
                                return verticesData.uv2s;
                            case WORKER_CONSTANTS.UV3Kind:
                                return verticesData.uv3s;
                            case WORKER_CONSTANTS.UV4Kind:
                                return verticesData.uv4s;
                            case WORKER_CONSTANTS.UV5Kind:
                                return verticesData.uv5s;
                            case WORKER_CONSTANTS.UV6Kind:
                                return verticesData.uv6s;
                            case WORKER_CONSTANTS.ColorKind:
                                return verticesData.colors;
                            default:
                                return null;
                        }
                    };

                    const getIndices = (): Nullable<IndicesArray> => {
                        return verticesData.indices;
                    };
                    const result = encodeMesh(encoder, getIndices, getVerticesData, data.options, verticesData.buffer);
                    postMessage({ id: WORKER_CONSTANTS.encodeMeshResult, encodedData: result }, result ? [result.data.buffer] : undefined);
                });
                break;
            }
        }
    };
}

/**
 * Configuration for Draco codecs - either encoder or decoder
 */
export interface IDracoCompressionCodecConfiguration {
    /**
     * The url to the WebAssembly module.
     */
    wasmUrl?: string;

    /**
     * The url to the WebAssembly binary.
     */
    wasmBinaryUrl?: string;

    /**
     * The url to the fallback JavaScript module.
     */
    fallbackUrl?: string;
}

/**
 * Configuration for Draco compression
 */
export interface IDracoCompressionConfiguration {
    /**
     * Configuration for the encoder.
     */
    encoder: IDracoCompressionCodecConfiguration;
    /**
     * Configuration for the decoder.
     */
    decoder: IDracoCompressionCodecConfiguration;
}

/**
 * Draco compression (https://google.github.io/draco/)
 *
 * This class wraps the Draco module.
 *
 * By default, the configuration points to a copy of the Draco decoder files for glTF from the babylon.js preview cdn https://preview.babylonjs.com/draco_wasm_wrapper_gltf.js.
 *
 * To update the configuration, use the following code:
 * ```javascript
 *     DracoCompression.Configuration = {
 *         decoder: {
 *             wasmUrl: "<url to the WebAssembly library>",
 *             wasmBinaryUrl: "<url to the WebAssembly binary>",
 *             fallbackUrl: "<url to the fallback JavaScript library>",
 *         },
 *         encoder: {
 *             wasmUrl: "<url to the WebAssembly library>",
 *             wasmBinaryUrl: "<url to the WebAssembly binary>",
 *             fallbackUrl: "<url to the fallback JavaScript library>",
 *         }
 *     };
 * ```
 *
 * Draco has two versions, one for WebAssembly and one for JavaScript. The codecs configuration can be set to only support WebAssembly or only support the JavaScript version.
 * Encoding or Decoding will automatically fallback to the JavaScript version if WebAssembly version is not configured or if WebAssembly is not supported by the browser.
 * Use `DracoCompression.DecoderAvailable` and `DracoCompression.EncoderAvailable` to determine if the codec configuration is available for the current context.
 *
 * **Encoder**
 *
 * To encode data, create a DracoCompression object or get the default DracoCompression object and call encodeMeshAsync, passing an optional options parameter.
 * default options are :
 * ```javascript
 * options = {
 *   decodeSpeed: 5,
 *   encodeSpeed: 5,
 *   method: EncoderMethod.EDGEBREAKER,
 *   quantizationBits: {
 *      POSITION: 14,
 *      NORMAL: 10,
 *      COLOR: 8,
 *      TEX_COORD: 12,
 *      GENERIC: 12,
 *    },
 *   exportNormals: true,
 *   exportUvs: true,
 *   exportColors: false
 * }
 * ```
 * you can change all or part of the options.
 *
 * ```javascript
 *     var compressedPrimitive = await DracoCompression.Default.encodeMeshAsync(data,options);
 * ```
 *
 * **Decoder**
 *
 * To decode Draco compressed data, get the default DracoCompression object and call decodeMeshAsync:
 * ```javascript
 *     var vertexData = await DracoCompression.Default.decodeMeshAsync(data);
 * ```
 *
 * @see https://www.babylonjs-playground.com/#N3EK4B#0
 */
export class DracoCompression implements IDisposable {
    private static wasmBaseUrl: string = "https://preview.babylonjs.com/";

    /**
     * The configuration. Defaults are :
     * **Decoder**
     * - wasmUrl: "https://preview.babylonjs.com/draco_wasm_wrapper_gltf.js"
     * - wasmBinaryUrl: "https://preview.babylonjs.com/draco_decoder_gltf.wasm"
     * - fallbackUrl: "https://preview.babylonjs.com/draco_decoder_gltf.js"
     *
     * **Encoder**
     * - wasmUrl: "https://preview.babylonjs.com/draco_encoder_wrapper.js"
     * - wasmBinaryUrl: "https://preview.babylonjs.com/draco_encoder.wasm"
     * - fallbackUrl: "https://preview.babylonjs.com/draco_encoder.js"
     */
    public static Configuration: IDracoCompressionConfiguration = {
        decoder: {
            wasmUrl: DracoCompression.wasmBaseUrl + "draco_wasm_wrapper_gltf.js",
            wasmBinaryUrl: DracoCompression.wasmBaseUrl + "draco_decoder_gltf.wasm",
            fallbackUrl: DracoCompression.wasmBaseUrl + "draco_decoder_gltf.js",
        },
        encoder: {
            wasmUrl: DracoCompression.wasmBaseUrl + "draco_encoder_wrapper.js",
            wasmBinaryUrl: DracoCompression.wasmBaseUrl + "draco_encoder.wasm",
            fallbackUrl: DracoCompression.wasmBaseUrl + "draco_encoder.js",
        },
    };

    /**
     * Returns true if the decoder is available.
     */
    public static get DecoderAvailable(): boolean {
        return DracoCompression._isCodecAvailable(DracoCompression.Configuration.decoder);
    }

    /**
     * Returns true if the encoder is available.
     */
    public static get EncoderAvailable(): boolean {
        return DracoCompression._isCodecAvailable(DracoCompression.Configuration.encoder);
    }

    private static _isCodecAvailable(codec: IDracoCompressionCodecConfiguration) {
        return !!((codec.wasmUrl && codec.wasmBinaryUrl && typeof WebAssembly === "object") || codec.fallbackUrl);
    }

    /**
     * Default number of workers to create when creating the draco compression object.
     */
    public static DefaultNumWorkers = DracoCompression.GetDefaultNumWorkers();

    private static GetDefaultNumWorkers(): number {
        if (typeof navigator !== "object" || !navigator.hardwareConcurrency) {
            return 1;
        }

        // Use 50% of the available logical processors but capped at 4.
        return Math.min(Math.floor(navigator.hardwareConcurrency * 0.5), 4);
    }

    private static _Default: Nullable<DracoCompression> = null;

    /**
     * Default instance for the draco compression object.
     */
    public static get Default(): DracoCompression {
        if (!DracoCompression._Default) {
            DracoCompression._Default = new DracoCompression();
        }

        return DracoCompression._Default;
    }

    private _workerPoolPromise?: Promise<AutoReleaseWorkerPool>;
    private _decoderModulePromise?: Promise<any>;
    private _encoderModulePromise?: Promise<any>;

    /**
     * Constructor
     * @param numWorkers The number of workers for async operations. Specify `0` to disable web workers and run synchronously in the current context.
     */
    constructor(numWorkers = DracoCompression.DefaultNumWorkers) {
        // decoder configuration
        const decoder = DracoCompression.Configuration.decoder;
        const decoderInfo: { url: string | undefined; wasmBinaryPromise: Promise<ArrayBuffer | string | undefined> } =
            decoder.wasmUrl && decoder.wasmBinaryUrl && typeof WebAssembly === "object"
                ? {
                      url: Tools.GetAbsoluteUrl(decoder.wasmUrl),
                      wasmBinaryPromise: Tools.LoadFileAsync(Tools.GetAbsoluteUrl(decoder.wasmBinaryUrl)),
                  }
                : {
                      url: Tools.GetAbsoluteUrl(decoder.fallbackUrl!),
                      wasmBinaryPromise: Promise.resolve(undefined),
                  };

        // encoder configuration
        const encoder = DracoCompression.Configuration.encoder;
        const encoderInfo: { url: string | undefined; wasmBinaryPromise: Promise<ArrayBuffer | string | undefined> } =
            encoder.wasmUrl && encoder.wasmBinaryUrl && typeof WebAssembly === "object"
                ? {
                      url: Tools.GetAbsoluteUrl(encoder.wasmUrl),
                      wasmBinaryPromise: Tools.LoadFileAsync(Tools.GetAbsoluteUrl(encoder.wasmBinaryUrl)),
                  }
                : {
                      url: Tools.GetAbsoluteUrl(encoder.fallbackUrl!),
                      wasmBinaryPromise: Promise.resolve(undefined),
                  };

        // may we use worker ??
        if (numWorkers && typeof Worker === "function") {
            // push the infos into an array to process a single worker initialization
            const codecInfos: { urls: Array<string | undefined>; wasmBinaryPromises: Array<Promise<ArrayBuffer | string | undefined>> } = {
                urls: [decoderInfo.url, encoderInfo.url],
                wasmBinaryPromises: [decoderInfo.wasmBinaryPromise, encoderInfo.wasmBinaryPromise],
            };

            this._workerPoolPromise = Promise.all(codecInfos.wasmBinaryPromises).then((codecWasmBinaries) => {
                const workerContent = `const WORKER_CONSTANTS=(${constantsFn})();${encodeMesh}${decodeMesh}(${worker})()`;
                const workerBlobUrl = URL.createObjectURL(new Blob([workerContent], { type: "application/javascript" }));

                return new AutoReleaseWorkerPool(numWorkers, () => {
                    return new Promise((resolve, reject) => {
                        const worker = new Worker(workerBlobUrl);
                        const onError = (error: ErrorEvent) => {
                            worker.removeEventListener("error", onError);
                            worker.removeEventListener("message", onMessage);
                            reject(error);
                        };

                        const onMessage = (message: MessageEvent) => {
                            if (message.data === "done") {
                                worker.removeEventListener("error", onError);
                                worker.removeEventListener("message", onMessage);
                                resolve(worker);
                            }
                        };

                        worker.addEventListener("error", onError);
                        worker.addEventListener("message", onMessage);

                        // we post initialization message with the array of url and wasm binary
                        worker.postMessage({
                            id: "init",
                            codec: {
                                urls: codecInfos.urls,
                                wasmBinaries: codecWasmBinaries,
                            },
                        });
                    });
                });
            });
        } else {
            // note: duplicate the code for better reading.
            this._decoderModulePromise = decoderInfo.wasmBinaryPromise.then((decoderWasmBinary) => {
                if (!decoderInfo.url) {
                    throw new Error("Draco decoder module is not available");
                }
                return Tools.LoadScriptAsync(decoderInfo.url).then(() => {
                    return createDecoderAsync(decoderWasmBinary as ArrayBuffer);
                });
            });
            this._encoderModulePromise = encoderInfo.wasmBinaryPromise.then((encoderWasmBinary) => {
                if (!encoderInfo.url) {
                    throw new Error("Draco encoder module is not available");
                }
                return Tools.LoadScriptAsync(encoderInfo.url).then(() => {
                    return createEncoderAsync(encoderWasmBinary as ArrayBuffer);
                });
            });
        }
    }

    /**
     * Stop all async operations and release resources.
     */
    public dispose(): void {
        if (this._workerPoolPromise) {
            this._workerPoolPromise.then((workerPool) => {
                workerPool.dispose();
            });
        }

        delete this._workerPoolPromise;
        delete this._decoderModulePromise;
        delete this._encoderModulePromise;
    }

    /**
     * Returns a promise that resolves when ready. Call this manually to ensure draco compression is ready before use.
     * @returns a promise that resolves when ready
     */
    public whenReadyAsync(): Promise<void> {
        if (this._workerPoolPromise) {
            return this._workerPoolPromise.then(() => {});
        }

        if (this._decoderModulePromise) {
            return this._decoderModulePromise.then(() => {});
        }

        if (this._encoderModulePromise) {
            return this._encoderModulePromise.then(() => {});
        }

        return Promise.resolve();
    }

    /**
     * Encode vertex data with Draco .
     * @param input The vertex data to be compressed
     * @param options The encoding options
     * @param avoidWorker tell the codec to do not use the worker pool to perform the encoding. Default is false.
     * @returns A promise that resolves with the encoded primitives
     */
    public encodeMeshAsync(input: IGetSetVerticesData, options?: IDracoEncoderOptions, avoidWorker: boolean = false): Promise<Nullable<IDracoEncodedPrimitive>> {
        const o = { ...DEFAULT_ENCODER_OPTIONS, ...options } as Required<IDracoEncoderOptions>;
        o.quantizationBits = { ...DEFAULT_QUANTIZATION_BITS, ...o.quantizationBits };

        if (this._workerPoolPromise && !avoidWorker) {
            return this._workerPoolPromise.then((workerPool) => {
                return new Promise<Nullable<IDracoEncodedPrimitive>>((resolve, reject) => {
                    workerPool.push((worker, onComplete) => {
                        const onError = (error: ErrorEvent) => {
                            // this is where we gona call reject
                            worker.removeEventListener("error", onError);
                            worker.removeEventListener("message", onMessage);
                            reject(error);
                            onComplete();
                        };

                        const onMessage = (message: MessageEvent) => {
                            if (message.data.id === WORKER_CONSTANTS.encodeMeshResult) {
                                // this is where we gona call resolve
                                worker.removeEventListener("error", onError);
                                worker.removeEventListener("message", onMessage);
                                resolve(message.data.encodedData);
                                onComplete();
                            }
                        };

                        worker.addEventListener("error", onError);
                        worker.addEventListener("message", onMessage);

                        // we build a dedicated copy of indices and verticesData backed by a Transferable buffer
                        const inputCopy = VerticesDataTransferable.from(input);
                        worker.postMessage({ id: WORKER_CONSTANTS.encodeMeshMethod, verticesData: inputCopy, options: o }, [inputCopy.buffer]);
                    });
                });
            });
        }

        // If worker are not supported
        if (this._encoderModulePromise) {
            return this._encoderModulePromise.then((encoder) => {
                return encodeMesh(
                    encoder.module,
                    () => input.getIndices(),
                    (kind: string) => input.getVerticesData(kind),
                    o
                );
            });
        }

        throw new Error("Draco encoder module is not available");
    }

    /**
     * Decode Draco compressed mesh data to vertex data.
     * @param data The ArrayBuffer or ArrayBufferView for the Draco compression data
     * @param attributes A map of attributes from vertex buffer kinds to Draco unique ids
     * @param dividers a list of optional dividers for normalization
     * @returns A promise that resolves with the decoded vertex data
     */
    public decodeMeshAsync(data: ArrayBuffer | ArrayBufferView, attributes?: { [kind: string]: number }, dividers?: { [kind: string]: number }): Promise<VertexData> {
        const dataView = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

        if (this._workerPoolPromise) {
            return this._workerPoolPromise.then((workerPool) => {
                return new Promise<VertexData>((resolve, reject) => {
                    workerPool.push((worker, onComplete) => {
                        const vertexData = new VertexData();

                        const onError = (error: ErrorEvent) => {
                            worker.removeEventListener("error", onError);
                            worker.removeEventListener("message", onMessage);
                            reject(error);
                            onComplete();
                        };

                        const onMessage = (message: MessageEvent) => {
                            if (message.data === "done") {
                                worker.removeEventListener("error", onError);
                                worker.removeEventListener("message", onMessage);
                                resolve(vertexData);
                                onComplete();
                            } else if (message.data.id === "indices") {
                                vertexData.indices = message.data.value;
                            } else {
                                // check normalization
                                const divider = dividers && dividers[message.data.id] ? dividers[message.data.id] : 1;
                                if (divider !== 1) {
                                    // normalize
                                    for (let i = 0; i < message.data.value.length; i++) {
                                        message.data.value[i] = message.data.value[i] / divider;
                                    }
                                }
                                vertexData.set(message.data.value, message.data.id);
                            }
                        };

                        worker.addEventListener("error", onError);
                        worker.addEventListener("message", onMessage);

                        const dataViewCopy = new Uint8Array(dataView.byteLength);
                        dataViewCopy.set(new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength));

                        worker.postMessage({ id: "decodeMesh", dataView: dataViewCopy, attributes: attributes }, [dataViewCopy.buffer]);
                    });
                });
            });
        }

        if (this._decoderModulePromise) {
            return this._decoderModulePromise.then((decoder) => {
                const vertexData = new VertexData();
                decodeMesh(
                    decoder.module,
                    dataView,
                    attributes,
                    (indices) => {
                        vertexData.indices = indices;
                    },
                    (kind, data) => {
                        vertexData.set(data, kind);
                    },
                    dividers
                );
                return vertexData;
            });
        }

        throw new Error("Draco decoder module is not available");
    }
}

/**
 * utility class used to transfert the necessary data to the worker,
 * avoiding copy by using a unique Transferable buffer
 */
class VerticesDataTransferable {
    public static from(input: IGetSetVerticesData) {
        const target = new VerticesDataTransferable();

        const indices = input.getIndices();
        const il = indices ? indices.length : 0;

        const positions = input.getVerticesData(VertexBuffer.PositionKind);
        const pl = positions ? positions.length : 0;

        const normals = input.getVerticesData(VertexBuffer.NormalKind);
        const nl = normals ? normals.length : 0;

        const uvs = input.getVerticesData(VertexBuffer.UVKind);
        const uvl = uvs ? uvs.length : 0;

        const uv2s = input.getVerticesData(VertexBuffer.UV2Kind);
        const uv2l = uv2s ? uv2s.length : 0;

        const uv3s = input.getVerticesData(VertexBuffer.UV3Kind);
        const uv3l = uv3s ? uv3s.length : 0;

        const uv4s = input.getVerticesData(VertexBuffer.UV4Kind);
        const uv4l = uv4s ? uv4s.length : 0;

        const uv5s = input.getVerticesData(VertexBuffer.UV5Kind);
        const uv5l = uv5s ? uv5s.length : 0;

        const uv6s = input.getVerticesData(VertexBuffer.UV6Kind);
        const uv6l = uv6s ? uv6s.length : 0;

        const cs = input.getVerticesData(VertexBuffer.ColorKind);
        const cl = cs ? cs.length : 0;

        const attByteSize = Float32Array.BYTES_PER_ELEMENT;
        const indiceByteSize = pl < 65535 ? Uint16Array.BYTES_PER_ELEMENT : Uint32Array.BYTES_PER_ELEMENT;

        const byteSize = il * indiceByteSize + (pl + nl + uvl + uv2l + uv3l + uv4l + uv5l + uv6l + cl) * attByteSize;
        target.buffer = new ArrayBuffer(byteSize);

        let offsetBytes = 0;
        if (indices) {
            target.indices = pl < 65535 ? new Uint16Array(target.buffer, 0, il) : new Uint32Array(target.buffer, 0, il);
            target.indices.set(indices);
            offsetBytes += il * indiceByteSize;
        }
        if (positions) {
            target.positions = new Float32Array(target.buffer, offsetBytes, pl);
            target.positions.set(positions);
            offsetBytes += pl * attByteSize;
        }
        if (normals) {
            target.normals = new Float32Array(target.buffer, offsetBytes, nl);
            target.normals.set(normals);
            offsetBytes += nl * attByteSize;
        }
        if (uvs) {
            target.uvs = new Float32Array(target.buffer, offsetBytes, uvl);
            target.uvs.set(uvs);
            offsetBytes += uvl * attByteSize;
        }
        if (uv2s) {
            target.uv2s = new Float32Array(target.buffer, offsetBytes, uv2l);
            target.uv2s.set(uv2s);
            offsetBytes += uv2l * attByteSize;
        }
        if (uv3s) {
            target.uv3s = new Float32Array(target.buffer, offsetBytes, uv3l);
            target.uv3s.set(uv3s);
            offsetBytes += uv3l * attByteSize;
        }
        if (uv4s) {
            target.uv4s = new Float32Array(target.buffer, offsetBytes, uv4l);
            target.uv4s.set(uv4s);
            offsetBytes += uv4l * attByteSize;
        }
        if (uv5s) {
            target.uv5s = new Float32Array(target.buffer, offsetBytes, uv5l);
            target.uv5s.set(uv5s);
            offsetBytes += uv5l * attByteSize;
        }
        if (uv6s) {
            target.uv6s = new Float32Array(target.buffer, offsetBytes, uv6l);
            target.uv6s.set(uv6s);
            offsetBytes += uv6l * attByteSize;
        }
        if (cs) {
            target.colors = new Float32Array(target.buffer, offsetBytes, cl);
            target.colors.set(cs);
        }
        return target;
    }

    buffer: ArrayBuffer;
    positions: Float32Array;
    indices: Uint32Array | Uint16Array;
    normals: Nullable<Float32Array>;
    uvs: Nullable<Float32Array>;
    uv2s: Nullable<Float32Array>;
    uv3s: Nullable<Float32Array>;
    uv4s: Nullable<Float32Array>;
    uv5s: Nullable<Float32Array>;
    uv6s: Nullable<Float32Array>;
    colors: Nullable<Float32Array>;
}
