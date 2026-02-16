import type { ISceneLoaderAsyncResult, ISceneLoaderPluginAsync, ISceneLoaderProgressEvent } from "core/Loading/sceneLoader";
import type { AssetContainer } from "core/assetContainer";
import type { Scene } from "core/scene";
import { TmfFileLoaderMetadata } from "./3mfFileLoader.metadata";
import { ThreeMfLoaderGlobalConfiguration } from "./3mfLoader.configuration";
import { Tools } from "core/Misc/tools";
import { Mesh } from "core/Meshes/mesh";
import { VertexData } from "core/Meshes/mesh.vertexData";
import { Matrix } from "core/Maths/math";

const RelationshipDirName = "_rels/";
const RelationshipFileName = `.rels`;

/**
 *
 */
export class ThreeMfFileLoader implements ISceneLoaderPluginAsync {
    private _babylonScene: Scene;
    /**
     * Cached promise so we only attempt to load fflate once.
     * This prevents multiple concurrent LoadScriptAsync calls.
     */
    private _fflateReadyPromise?: Promise<any>;

    /**
     * Name of the loader ("3MF")
     */
    public readonly name = TmfFileLoaderMetadata.name;

    /** @internal */
    public readonly extensions = TmfFileLoaderMetadata.extensions;

    /**
     * Import meshes into a scene.
     * @param meshesNames An array of mesh names, a single mesh name, or empty string for all meshes that filter what meshes are imported
     * @param scene The scene to import into
     * @param data The data to import
     * @param rootUrl The root url for scene and resources
     * @param onProgress The callback when the load progresses
     * @param fileName Defines the name of the file to load
     * @returns The loaded objects (e.g. meshes, particle systems, skeletons, animation groups, etc.)
     */
    public async importMeshAsync(
        meshesNames: string | readonly string[] | null | undefined,
        scene: Scene,
        data: Uint8Array,
        rootUrl: string,
        onProgress?: (event: ISceneLoaderProgressEvent) => void,
        fileName?: string
    ): Promise<ISceneLoaderAsyncResult> {
        return await new Promise<ISceneLoaderAsyncResult>(
            (v: ISceneLoaderAsyncResult) => {},
            (reason?: any) => {}
        );
    }

    /**
     * Load into a scene.
     * @param scene The scene to load into
     * @param data The data to import
     * @param rootUrl The root url for scene and resources
     * @param onProgress The callback when the load progresses
     * @param fileName Defines the name of the file to load
     * @returns Nothing
     */
    public async loadAsync(scene: Scene, data: Uint8Array, rootUrl: string, onProgress?: (event: ISceneLoaderProgressEvent) => void, fileName?: string): Promise<void> {
        this._babylonScene = scene;
        const files = await this._unzipWithFflateAsync(data);
        // here we might have at least 3 documents
        // 1 - the Open Doc Declaration, which is not really useful here.
        // 2 - the relationship where we're going to find the list of targets, i.e., the names of the model files.
        // 3 - the models themselves, which are the main interest.
        const relationships = files.get(`${RelationshipDirName}${RelationshipFileName}`);
        if (!relationships) {
            throw new Error("Invalid 3MF file. Missing relationships.");
        }
        const modelNames = Array.from(this._parseRelationships(relationships));
        for (const modelName of modelNames) {
            const modelBin = files.get(modelName);
            if (!modelBin) {
                continue;
            }
            this._parseModel(modelBin);
        }
    }

    /**
     * Load into an asset container.
     * @param scene The scene to load into
     * @param data The data to import
     * @param rootUrl The root url for scene and resources
     * @param onProgress The callback when the load progresses
     * @param fileName Defines the name of the file to load
     * @returns The loaded asset container
     */
    public async loadAssetContainerAsync(
        scene: Scene,
        data: unknown,
        rootUrl: string,
        onProgress?: (event: ISceneLoaderProgressEvent) => void,
        fileName?: string
    ): Promise<AssetContainer> {}

    private _parseModel(data: Uint8Array<ArrayBufferLike>): void {
        const xml = this._uint8ArrayToXmlString(data);
        const dom = this._parseXmlToDom(xml);

        const objects = dom.getElementsByTagName("object");
        for (const objectElement of objects) {
            this._parseObject(objectElement);
        }

        // now we may instanciate the components.
        for (const e of this._components.entries()) {
            const mesh = this._meshById.get(e[0]);
            if (!mesh) {
                continue;
            }
            const transforms = e[1];
            for (let i = 0; i != transforms.length; i++) {
                const newInstance = mesh.createInstance(`${mesh.name}.i${i}`);
                newInstance.setPreTransformMatrix(transforms[i]);
            }
        }
    }

    private _meshById = new Map<string, Mesh>();
    private _components = new Map<string, Array<Matrix>>();

    private _parseObject(el: Element): void {
        // just embbed "mesh" or "component"
        const childElement = el.firstElementChild as Element | null;
        if (childElement) {
            switch (childElement.localName) {
                case "mesh": {
                    const data = this._parseMesh(childElement);
                    if (data) {
                        const id = el.getAttribute("id");
                        if (id) {
                            const babylonMesh = new Mesh(id, this._babylonScene);
                            data.applyToMesh(babylonMesh);
                            this._meshById.set(id, babylonMesh);
                        }
                    }
                    break;
                }
                case "components": {
                    this._parseComponents(childElement);
                    break;
                }
            }
        }
    }

    private _getRequiredAttribute(el: Element, att: string): string {
        const str = el.getAttribute("x");
        if (!str) {
            throw new Error("Invalid document exception/ Missing attribute");
        }
        return str;
    }

    private _getRequiredFloatAttribute(el: Element, att: string): number {
        return Number.parseFloat(this._getRequiredAttribute(el, att));
    }

    private _parseMesh(el: Element): VertexData | undefined {
        const verticesEl = el.getElementsByTagName("vertices")[0];
        if (!verticesEl) {
            return;
        }

        const pos = new Float32Array(verticesEl.children.length * 3);
        let k = 0;
        for (let i = 0; i < verticesEl.children.length; i++) {
            const child = verticesEl.children[i]; // in XML order
            pos[k++] = this._getRequiredFloatAttribute(child, "x");
            pos[k++] = this._getRequiredFloatAttribute(child, "y");
            pos[k++] = this._getRequiredFloatAttribute(child, "z");
        }

        const trianglesEl = el.getElementsByTagName("triangles")[0];
        if (!trianglesEl) {
            return;
        }
        const indices = new Uint32Array(trianglesEl.children.length * 3);
        k = 0;
        for (let i = 0; i < trianglesEl.children.length; i++) {
            const child = trianglesEl.children[i]; // in XML order
            indices[k++] = this._getRequiredFloatAttribute(child, "v1");
            indices[k++] = this._getRequiredFloatAttribute(child, "v2");
            indices[k++] = this._getRequiredFloatAttribute(child, "v3");
        }
        const vertexData = new VertexData();

        vertexData.positions = pos;
        vertexData.indices = indices;
        return vertexData;
    }

    private _parseComponents(el: Element): void {
        const childs = el.getElementsByTagName("component");
        for (const c of childs) {
            const objectId = c.getAttribute("objectId");
            if (!objectId) {
                continue;
            }
            const m = this._parseTransform(c.getAttribute("transform"));
            if (m) {
                let stack = this._components.get(objectId);
                if (!stack) {
                    stack = [];
                    this._components.set(objectId, stack);
                }
                stack.push(m);
            }
        }
    }

    private _parseTransform(str: string | null): Matrix | undefined {
        if (!str) {
            return undefined;
        }
        const parts = str.trim().split(/\s+/);
        if (parts.length != 12) {
            return undefined;
        }
        try {
            const nums = parts.map((p) => {
                const n = Number(p);
                if (!Number.isFinite(n)) {
                    throw new Error(`Invalid number: "${p}"`);
                }
                return n;
            });
            return Matrix.FromValues(nums[0], nums[1], nums[2], 0, nums[3], nums[4], nums[5], 0, nums[6], nums[7], nums[8], 0, nums[9], nums[10], nums[11], 1);
        } catch {
            return undefined;
        }
    }

    private *_parseRelationships(data: Uint8Array<ArrayBufferLike>): IterableIterator<string> {
        const xml = this._uint8ArrayToXmlString(data);
        const dom = this._parseXmlToDom(xml);
        const wantedType = "http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel";

        // Namespace on <Relationships> does not affect getElementsByTagName in most DOM impls,
        // but this works reliably with DOMParser (browser) and @xmldom/xmldom (node).
        const rels = dom.getElementsByTagName("relationship");

        for (let i = 0; i < rels.length; i++) {
            const el = rels[i];
            if (el.getAttribute("type") === wantedType) {
                const target = el.getAttribute("target");
                if (target) {
                    yield target;
                }
            }
        }
    }

    private async _unzipWithFflateAsync(data: Uint8Array): Promise<Map<string, Uint8Array>> {
        const fflate = await this._ensureZipLibReadyAsync();

        const { unzipSync } = fflate;

        const unzipped = unzipSync(data) as Record<string, Uint8Array>; // { [filename: string]: Uint8Array }

        const files = new Map<string, Uint8Array>();
        for (const [name, content] of Object.entries(unzipped)) {
            files.set(name, content);
        }
        return files;
    }

    /**
     * Ensure the zip library (fflate) is available in the current runtime.
     *
     * Host assumptions:
     * - This implementation relies on fflate being exposed on globalThis.fflate.
     * - If it is not present, it loads a script from ThreeMfSerializerGlobalConfiguration.FFLATEUrl using Babylon Tools.LoadScriptAsync.
     * @returns
     */
    private async _ensureZipLibReadyAsync(): Promise<any> {
        if (this._fflateReadyPromise) {
            return await this._fflateReadyPromise;
        }

        this._fflateReadyPromise = (async () => {
            // globalThis is the global object in all modern JS runtimes (browser, workers, Node, etc.).
            const g = globalThis as any;

            // If fflate is not already present, load it dynamically.
            // This assumes the loaded script sets globalThis.fflate.
            if (!g.fflate) {
                await Tools.LoadScriptAsync(ThreeMfLoaderGlobalConfiguration.FFLATEUrl);
            }

            return g.fflate;
        })();

        return await this._fflateReadyPromise;
    }

    // parse-xml.ts
    private _uint8ArrayToXmlString(bytes: Uint8Array, encoding: string = "utf-8"): string {
        // Browser et Node 18+ ont TextDecoder globalement.
        // Si besoin Node < 18: import { TextDecoder } from "node:util"
        const decoder = new TextDecoder(encoding);
        return decoder.decode(bytes);
    }

    private _parseXmlToDom(xml: string): Document {
        // Browser
        if (typeof DOMParser !== "undefined") {
            const doc = new DOMParser().parseFromString(xml, "application/xml");

            // Detecte les erreurs de parsing (Firefox/Chrome mettent un <parsererror>)
            const parserError = doc.getElementsByTagName("parsererror")[0];
            if (parserError) {
                throw new Error("XML parse error: " + (parserError.textContent ?? "unknown"));
            }
            return doc;
        }

        // Node
        // Option A (leger): xmldom
        // npm i @xmldom/xmldom

        const { DOMParser: NodeDomParser } = require("@xmldom/xmldom");
        return new NodeDomParser().parseFromString(xml, "application/xml");
    }
}
