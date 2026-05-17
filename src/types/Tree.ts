export interface TrunkCollider {
    x: number;
    z: number;
    r: number;
    yBot: number;
    yTop: number;
}

export interface FoliageCollider {
    x: number;
    y: number;
    z: number;
    r: number;
}

export interface TreeColliderSet {
    trunks:  TrunkCollider[];
    foliage: FoliageCollider[];
}
