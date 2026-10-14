// Minimal read-only protobuf parser for ONNX ModelProto -> GraphProto -> ValueInfoProto.
// Avoids loading an inference engine just to verify the shipped tensor metadata.
function fields(bytes) {
  const result = [];
  let offset = 0;
  const varint = () => {
    let value = 0n;
    let shift = 0n;
    while (offset < bytes.length && shift <= 63n) {
      const byte = bytes[offset++];
      value |= BigInt(byte & 127) << shift;
      if (!(byte & 128)) return value;
      shift += 7n;
    }
    throw new Error('Invalid ONNX protobuf varint');
  };
  while (offset < bytes.length) {
    const tag = Number(varint());
    const wire = tag & 7;
    const number = tag >>> 3;
    let value;
    if (number === 0) throw new Error('Invalid ONNX field');
    if (wire === 0) value = varint();
    else if (wire === 2) {
      const length = Number(varint());
      if (!Number.isSafeInteger(length) || offset + length > bytes.length) throw new Error('Truncated ONNX field');
      value = bytes.subarray(offset, offset + length);
      offset += length;
    } else if (wire === 1 || wire === 5) {
      const length = wire === 1 ? 8 : 4;
      if (offset + length > bytes.length) throw new Error('Truncated ONNX field');
      offset += length;
    } else throw new Error('Unsupported ONNX wire type');
    result.push({ number, value });
  }
  return result;
}

const one = (list, number) => list.find(field => field.number === number)?.value;
function tensorInfo(bytes) {
  const info = fields(bytes);
  const tensor = fields(one(fields(one(info, 2)), 1));
  const shape = fields(one(tensor, 2)).filter(field => field.number === 1).map(field => {
    const dimension = fields(field.value);
    const fixed = one(dimension, 1);
    return fixed === undefined ? Buffer.from(one(dimension, 2)).toString('utf8') : Number(fixed);
  });
  return { name: Buffer.from(one(info, 1)).toString('utf8'), dataType: Number(one(tensor, 1)), shape };
}

export function onnxSignature(bytes) {
  const graphBytes = one(fields(bytes), 7);
  if (!graphBytes) throw new Error('ONNX graph is missing');
  const graph = fields(graphBytes);
  // Older models expose weights as graph inputs too. Runtime feeds exclude
  // initializer-backed inputs; they are not additional image tensors.
  const initializers = new Set(graph.filter(field => field.number === 5).map(field =>
    Buffer.from(one(fields(field.value), 8)).toString('utf8')));
  return {
    inputs: graph.filter(field => field.number === 11).map(field => tensorInfo(field.value)).filter(info => !initializers.has(info.name)),
    outputs: graph.filter(field => field.number === 12).map(field => tensorInfo(field.value)),
  };
}
