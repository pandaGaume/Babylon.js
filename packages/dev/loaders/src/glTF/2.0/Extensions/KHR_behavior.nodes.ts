/* eslint-disable @typescript-eslint/naming-convention */
import type {IProperty} from "babylonjs-gltf2interface";

export class KHR_behaviorItem implements IProperty {
    /**
     * Dictionary object with extension-specific objects
     */
    extensions?: {
        [key: string]: any;
    };
    /**
     * Application-Specific data
     */
    extras?: any;
}

export class KHR_behaviorComponent extends KHR_behaviorItem {
    public name: string;
}

export enum KHR_behaviorOperator {
    NOT,
    OR,
    AND,
    EQUAL,
    UNEQUAL,
    LESS,
    LARGER,
    LESSEQUAL,
    LARGEREQUAL,
    string
}

export class KHR_behaviorConditionNode extends KHR_behaviorComponent {
    public operator : KHR_behaviorOperator;
    public variablesNodes : [number] | [number,number] ; // The indices of variable nodes. The number of array elements **MUST** match the required arguments which is 1 for `NOT` and 2 for the other operators.
} 


export enum KHR_behaviorEventType {
    OnStart = "OnStart",
    OnUpdate = "OnUpdate",
    OnValueChanged = "OnValueChanged",
    OnDemand = "OnDemand",
    OnInteraction = "OnInteraction",
    string = "string",
}

export class KHR_behaviorEventOnInteraction extends KHR_behaviorItem {
    public node: number; // The index of the node.
    public boundingSphere?: number; // The radius of the bounding sphere. This property **MUST NOT** be defined when `boundingBox` is defined.
    public boundingBox?: [number, number, number]; // The vector of the bounding box. This property **MUST NOT** be defined when `boundingSphere` is defined.
}

export class KHR_behaviorEventOnValueChanged extends KHR_behaviorItem {
    public pointer: string; // JSON pointer of the value to track.
}

export class KHR_behaviorEventNode extends KHR_behaviorComponent {
    public type: KHR_behaviorEventType;
    public flowNode: number;
    public OnInteraction?: KHR_behaviorEventOnInteraction;
    public OnValueChanged?: KHR_behaviorEventOnValueChanged;
}

export enum KHR_behaviorFlowNodeType {
    control = "control",
    set = "set",
    string = "string",
}

export enum KHR_behaviorFlowNodeBranch {
    if = "if",
    string = "string",
}

export class KHR_behaviorFlowNodeControlIf extends KHR_behaviorComponent {
    public condition: number; // The index of the condition node.
    public then: number; // The index of the flow node to be executed in the true condition case..
    public else?: number; // The index of the flow node to be executed in the false condition case..
}

export class KHR_behaviorFlowNodeControl extends KHR_behaviorItem {
    public if: KHR_behaviorFlowNodeControlIf;
    public branch?: KHR_behaviorFlowNodeBranch; // Allowed branching conditions.
}

export class KHR_behaviorFlowNodeSet extends KHR_behaviorComponent {
    public pointer: number; // JSON pointer of the property to write to.
    public variableNode: number; // The index of the variable node the written values are taken from.
}

export class KHR_behaviorFlowNode extends KHR_behaviorComponent {
    public group: KHR_behaviorFlowNodeType; // The allowed nodes in a flow graph.
    public control?: KHR_behaviorFlowNodeControl;
    public set?: any;
}

export class KHR_behaviorGetNode extends KHR_behaviorComponent {
    public pointer: number; // JSON pointer of the property to read from.
}

export enum KHR_behaviorVariableType {
    integer = "integer",
    float = "float",
    boolean = "boolean",
    string = "string",
}

export class KHR_behaviorVariableNode extends KHR_behaviorComponent {
    public type: KHR_behaviorVariableType;
    public values?: Array<number | boolean>;
    public getNode?: number; // he index of the get node.
}
