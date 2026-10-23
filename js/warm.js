// Shader warm-up that never freezes the page. Compiling every shader a map needs at once used to block the
// page for seconds on a weak GPU (or with hardware acceleration off), long enough for browsers to offer to
// kill it. Where the browser compiles in the background (KHR_parallel_shader_compile), three's compileAsync
// just waits for that; elsewhere the shaders are compiled a few at a time, a frame apart.
const frame = () => new Promise(r => requestAnimationFrame(() => r()));

export async function compileGently(renderer, scene, camera, budget = 40) {
  const textures = new Set();
  if (renderer.getContext().getExtension('KHR_parallel_shader_compile')) {
    await renderer.compileAsync(scene, camera);
    scene.traverseVisible(o => { for (const m of o.material ? [].concat(o.material) : []) for (const v of Object.values(m)) if (v && v.isTexture) textures.add(v); });
    return uploadGently(renderer, textures, budget);
  }
  // one object per distinct set of materials (the rest share its programs)
  const objs = [], seen = new Set();
  scene.traverseVisible(o => {
    if (!o.material) return;
    const k = [].concat(o.material).map(m => m.uuid).join();
    if (!seen.has(k)) { seen.add(k); objs.push(o); }
  });
  let t = performance.now();
  for (const o of objs) {
    // compile, then wait for those programs to finish here (one by one) rather than at the first draw
    for (const m of renderer.compile(o, camera, scene)) {
      const p = renderer.properties.get(m).currentProgram;
      if (p) p.getUniforms();
      for (const v of Object.values(m)) if (v && v.isTexture) textures.add(v);
    }
    if (performance.now() - t > budget) { await frame(); t = performance.now(); }
  }
  await uploadGently(renderer, textures, budget);
}

// Textures upload on their first draw, all at once; this sends them up a few per frame instead.
export async function uploadGently(renderer, textures, budget = 40) {
  let t = performance.now();
  for (const tex of textures) {
    try { renderer.initTexture(tex); } catch (_) { /* uploads on first draw instead */ }
    if (performance.now() - t > budget) { await frame(); t = performance.now(); }
  }
}
