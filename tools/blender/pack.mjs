// weld, dedup and quantize an exported map scene (three's GLTFLoader reads KHR_mesh_quantization natively)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, prune, quantize } from '@gltf-transform/functions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
await doc.transform(dedup({ keepUniqueNames: true }), weld(), quantize({ quantizePosition: 16, quantizeNormal: 8, quantizeTexcoord: 14 }), prune({ keepAttributes: true }));   // (the game assigns textures by material name: the UVs must stay)
await io.write(process.argv[2], doc);
