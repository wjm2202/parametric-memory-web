/**
 * Minimal ambient declarations for d3-force-3d.
 * The package has no official @types — this covers the API surface we use.
 */
declare module "d3-force-3d" {
  export interface SimNode {
    x: number;
    y: number;
    z: number;
    vx?: number;
    vy?: number;
    vz?: number;
    fx?: number | null;
    fy?: number | null;
    fz?: number | null;
    [key: string]: unknown;
  }

  export interface SimLink<N extends SimNode = SimNode> {
    source: string | N;
    target: string | N;
    [key: string]: unknown;
  }

  export interface Simulation<N extends SimNode = SimNode> {
    nodes(): N[];
    nodes(nodes: N[]): this;
    force(name: string): Force | undefined;
    force(name: string, force: Force | null): this;
    alpha(): number;
    alpha(alpha: number): this;
    alphaMin(): number;
    alphaMin(min: number): this;
    alphaDecay(): number;
    alphaDecay(decay: number): this;
    alphaTarget(): number;
    alphaTarget(target: number): this;
    velocityDecay(): number;
    velocityDecay(decay: number): this;
    numDimensions(): number;
    numDimensions(n: number): this;
    restart(): this;
    stop(): this;
    tick(iterations?: number): this;
    on(typenames: string, listener: ((this: Simulation<N>) => void) | null): this;
  }

  export interface Force {
    (alpha: number): void;
    initialize?(nodes: SimNode[], numDimensions: () => number): void;
  }

  export interface LinkForce<N extends SimNode = SimNode> extends Force {
    links(): SimLink<N>[];
    links(links: SimLink<N>[]): this;
    id(): (node: N) => string;
    id(id: (node: N) => string): this;
    distance(): number | ((link: SimLink<N>) => number);
    distance(distance: number | ((link: SimLink<N>) => number)): this;
    strength(): number | ((link: SimLink<N>) => number);
    strength(strength: number | ((link: SimLink<N>) => number)): this;
    iterations(): number;
    iterations(iterations: number): this;
  }

  export interface ManyBodyForce extends Force {
    strength(): number | ((node: SimNode) => number);
    strength(strength: number | ((node: SimNode) => number)): this;
    theta(): number;
    theta(theta: number): this;
    distanceMin(): number;
    distanceMin(distance: number): this;
    distanceMax(): number;
    distanceMax(distance: number): this;
  }

  export interface CenterForce extends Force {
    x(): number;
    x(x: number): this;
    y(): number;
    y(y: number): this;
    z(): number;
    z(z: number): this;
  }

  export function forceSimulation<N extends SimNode = SimNode>(nodes?: N[]): Simulation<N>;
  export function forceLink<N extends SimNode = SimNode>(links?: SimLink<N>[]): LinkForce<N>;
  export function forceManyBody(): ManyBodyForce;
  export function forceCenter(x?: number, y?: number, z?: number): CenterForce;
  export function forceCollide(radius?: number | ((node: SimNode) => number)): Force;
}
