import type { IGLTFLoaderExtension } from "../glTFLoaderExtension";
import { GLTFLoader } from "../glTFLoader";
import type * as NODES from "./KHR_behavior.nodes";

const NAME = "KHR_behavior";

// eslint-disable-next-line @typescript-eslint/naming-convention
export class KHR_behavior implements IGLTFLoaderExtension {
    private _loader: GLTFLoader;

    /**
     * The name of this extension.
     */
    public readonly name = NAME;

    public conditionNodes: Array<NODES.KHR_behaviorConditionNode>;
    public eventNodes: Array<NODES.KHR_behaviorEventNode>;
    public flowNodes: Array<NODES.KHR_behaviorFlowNode>;
    public getNodes: Array<NODES.KHR_behaviorGetNode>;
    public variablesNodes: Array<NODES.KHR_behaviorVariableNode>;

    /**
     * @param loader
     * @hidden
     */
    constructor(loader: GLTFLoader) {
        this._loader = loader;
    }

    /**
     * Defines whether this extension is enabled.
     */
    public get enabled(): boolean {
        return this._loader.isExtensionUsed(NAME);
    }

    /** @hidden */
    public dispose() {
        (this._loader as any) = null;
    }
}

GLTFLoader.RegisterExtension(NAME, (loader) => new KHR_behavior(loader));
