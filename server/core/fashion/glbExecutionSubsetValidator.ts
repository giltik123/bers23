type InvalidGlbFactory = (message: string) => Error;

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;
const TRIANGLES_MODE = 4;
const INDEX_COMPONENT_BYTES = Object.freeze(new Map<number, number>([
  [5121, 1],
  [5123, 2],
  [5125, 4],
]));

export function validateGlbExecutionSubset(bytes: Uint8Array, invalidGlb: InvalidGlbFactory): void {
  const { document, bin } = parseGlb(bytes, invalidGlb);
  const meshes = document.meshes as any[];
  const accessors = document.accessors as any[];
  const bufferViews = document.bufferViews as any[];
  const nodes = document.nodes as any[];
  const scenes = document.scenes as any[];

  for (const [meshIndex, mesh] of meshes.entries()) {
    for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
      if (primitive?.mode !== undefined && primitive.mode !== TRIANGLES_MODE) continue;
      const positionAccessorIndex = primitive?.attributes?.POSITION;
      const positionAccessor = accessors[positionAccessorIndex];
      const positionCount = Number(positionAccessor?.count);
      if (primitive.indices === undefined) {
        if (!Number.isSafeInteger(positionCount) || positionCount < 3 || positionCount % 3 !== 0) {
          throw invalidGlb(`GLB non-indexed triangle primitive ${meshIndex}:${primitiveIndex} must contain complete POSITION triangles`);
        }
        continue;
      }

      const indexAccessorIndex = Number(primitive.indices);
      if (!Number.isSafeInteger(indexAccessorIndex) || indexAccessorIndex < 0 || indexAccessorIndex >= accessors.length) {
        throw invalidGlb(`GLB primitive ${meshIndex}:${primitiveIndex} indices accessor reference is invalid`);
      }
      validateIndexAccessor(
        accessors[indexAccessorIndex],
        indexAccessorIndex,
        positionCount,
        bufferViews,
        bin,
        invalidGlb,
      );
    }
  }

  const parentCounts = new Array<number>(nodes.length).fill(0);
  const childrenByNode: number[][] = [];
  for (const [nodeIndex, node] of nodes.entries()) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) throw invalidGlb(`GLB node ${nodeIndex} is invalid`);
    if (node.mesh !== undefined && (!Number.isSafeInteger(node.mesh) || node.mesh < 0 || node.mesh >= meshes.length)) {
      throw invalidGlb(`GLB node ${nodeIndex} mesh reference is invalid`);
    }
    const children = node.children === undefined ? [] : node.children;
    if (!Array.isArray(children)) throw invalidGlb(`GLB node ${nodeIndex} children must be an array`);
    if (new Set(children).size !== children.length) throw invalidGlb(`GLB node ${nodeIndex} contains duplicate child references`);
    const normalizedChildren: number[] = [];
    for (const child of children) {
      if (!Number.isSafeInteger(child) || child < 0 || child >= nodes.length) throw invalidGlb(`GLB node ${nodeIndex} child reference is invalid`);
      parentCounts[child] += 1;
      if (parentCounts[child] > 1) throw invalidGlb(`GLB node ${child} has multiple parents`);
      normalizedChildren.push(child);
    }
    childrenByNode.push(normalizedChildren);
  }

  const colors = new Uint8Array(nodes.length);
  const visitForCycles = (nodeIndex: number): void => {
    if (colors[nodeIndex] === 1) throw invalidGlb('GLB node graph contains a cycle');
    if (colors[nodeIndex] === 2) return;
    colors[nodeIndex] = 1;
    for (const child of childrenByNode[nodeIndex]) visitForCycles(child);
    colors[nodeIndex] = 2;
  };
  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) visitForCycles(nodeIndex);

  const defaultScene = scenes[document.scene];
  if (!defaultScene || typeof defaultScene !== 'object' || Array.isArray(defaultScene)) throw invalidGlb('GLB default scene is invalid');
  if (!Array.isArray(defaultScene.nodes) || defaultScene.nodes.length < 1) throw invalidGlb('GLB default scene must declare at least one root node');
  if (new Set(defaultScene.nodes).size !== defaultScene.nodes.length) throw invalidGlb('GLB default scene contains duplicate root node references');
  const roots: number[] = [];
  for (const root of defaultScene.nodes) {
    if (!Number.isSafeInteger(root) || root < 0 || root >= nodes.length) throw invalidGlb('GLB default scene root node reference is invalid');
    if (parentCounts[root] !== 0) throw invalidGlb(`GLB default scene root node ${root} is not a graph root`);
    roots.push(root);
  }

  const reachable = new Uint8Array(nodes.length);
  let reachableMesh = false;
  const visitReachable = (nodeIndex: number): void => {
    if (reachable[nodeIndex] === 1) return;
    reachable[nodeIndex] = 1;
    const node = nodes[nodeIndex];
    if (Number.isSafeInteger(node.mesh) && node.mesh >= 0 && node.mesh < meshes.length && meshes[node.mesh]?.primitives?.length > 0) {
      reachableMesh = true;
    }
    for (const child of childrenByNode[nodeIndex]) visitReachable(child);
  };
  for (const root of roots) visitReachable(root);
  if (!reachableMesh) throw invalidGlb('GLB default scene does not reach an admitted mesh primitive');
}

function validateIndexAccessor(
  accessor: any,
  accessorIndex: number,
  positionCount: number,
  bufferViews: any[],
  bin: Uint8Array,
  invalidGlb: InvalidGlbFactory,
): void {
  const componentBytes = INDEX_COMPONENT_BYTES.get(Number(accessor?.componentType));
  if (!accessor || accessor.type !== 'SCALAR' || componentBytes === undefined || accessor.sparse !== undefined || accessor.normalized === true ||
      !Number.isSafeInteger(accessor.count) || accessor.count < 3 || accessor.count % 3 !== 0 ||
      !Number.isSafeInteger(accessor.bufferView) || accessor.bufferView < 0 || accessor.bufferView >= bufferViews.length) {
    throw invalidGlb(`GLB indices accessor ${accessorIndex} must be dense unsigned SCALAR triangle-list data`);
  }
  if (!Number.isSafeInteger(positionCount) || positionCount < 3) throw invalidGlb('GLB POSITION accessor count is invalid for indexed geometry');

  const bufferView = bufferViews[accessor.bufferView];
  if (bufferView?.byteStride !== undefined) throw invalidGlb(`GLB indices accessor ${accessorIndex} must use tightly packed index data`);
  const bufferViewByteOffset = bufferView?.byteOffset === undefined ? 0 : Number(bufferView.byteOffset);
  const bufferViewByteLength = Number(bufferView?.byteLength);
  const accessorByteOffset = accessor.byteOffset === undefined ? 0 : Number(accessor.byteOffset);
  if (!Number.isSafeInteger(bufferViewByteOffset) || bufferViewByteOffset < 0 ||
      !Number.isSafeInteger(bufferViewByteLength) || bufferViewByteLength < 1 ||
      !Number.isSafeInteger(accessorByteOffset) || accessorByteOffset < 0 ||
      (bufferViewByteOffset + accessorByteOffset) % componentBytes !== 0 ||
      accessorByteOffset + accessor.count * componentBytes > bufferViewByteLength) {
    throw invalidGlb(`GLB indices accessor ${accessorIndex} range or alignment is invalid`);
  }

  const absoluteOffset = bufferViewByteOffset + accessorByteOffset;
  const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  for (let index = 0; index < accessor.count; index += 1) {
    const offset = absoluteOffset + index * componentBytes;
    let vertexIndex: number;
    if (accessor.componentType === 5121) vertexIndex = data.getUint8(offset);
    else if (accessor.componentType === 5123) vertexIndex = data.getUint16(offset, true);
    else vertexIndex = data.getUint32(offset, true);
    if (vertexIndex >= positionCount) throw invalidGlb(`GLB indices accessor ${accessorIndex} references POSITION vertex ${vertexIndex} outside count ${positionCount}`);
  }
}

function parseGlb(bytes: Uint8Array, invalidGlb: InvalidGlbFactory): Readonly<{ document: any; bin: Uint8Array }> {
  if (bytes.byteLength < 28) throw invalidGlb('GLB is too small for strict execution validation');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) {
    throw invalidGlb('GLB header is invalid for strict execution validation');
  }
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== GLB_JSON_CHUNK || jsonLength < 1 || 20 + jsonLength + 8 > bytes.byteLength) {
    throw invalidGlb('GLB JSON chunk is invalid for strict execution validation');
  }
  const binHeader = 20 + jsonLength;
  const binLength = view.getUint32(binHeader, true);
  if (view.getUint32(binHeader + 4, true) !== GLB_BIN_CHUNK || binLength < 1 || binHeader + 8 + binLength !== bytes.byteLength) {
    throw invalidGlb('GLB BIN chunk is invalid for strict execution validation');
  }
  let document: any;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(20, 20 + jsonLength)).replace(/[\u0000\u0020]+$/u, '');
    document = JSON.parse(text);
  } catch {
    throw invalidGlb('GLB JSON chunk is invalid for strict execution validation');
  }
  if (!document || typeof document !== 'object' || Array.isArray(document) ||
      !Array.isArray(document.meshes) || !Array.isArray(document.accessors) || !Array.isArray(document.bufferViews) ||
      !Array.isArray(document.nodes) || !Array.isArray(document.scenes) || !Number.isSafeInteger(document.scene) ||
      document.scene < 0 || document.scene >= document.scenes.length) {
    throw invalidGlb('GLB strict execution document structure is invalid');
  }
  return Object.freeze({ document, bin: bytes.subarray(binHeader + 8, binHeader + 8 + binLength) });
}
