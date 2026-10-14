export const PROFILE = Object.freeze({
  version: '1-provisional', calibrated: false,
  detectorSize:640, detectorConfidence:.75, nms:.3, topK:5000,
  similarity:.55, margin:.12, reacquireSimilarity:.68, reacquireMargin:.16,
  maxScaleRatio:2.1, motionRadius:1.8, motionGrowthPerSecond:2,
  manualSize:32, manualScore:.78, manualMargin:.08, minimumTemplateVariance:64,
  manualReacquireUs:500_000, manualReacquireScore:.9, landmarkRatioLimit:2,
  manualOffsets:[-1,-.5,0,.5,1], manualScales:[.85,1,1.18], manualRolls:[-.2,0,.2],
  coveragePadding:.12, backing:'#ffd54f',
});
export async function profileHash(modelHashes: string[], runtimeVersion: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({profile:PROFILE,modelHashes,runtimeVersion})));
  return Array.from(new Uint8Array(digest),byte => byte.toString(16).padStart(2,'0')).join('');
}
