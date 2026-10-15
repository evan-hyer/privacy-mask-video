// npm may acknowledge a publication before its public metadata is available.
// Only an absent version is retried. Authentication/network failures propagate,
// and the caller must still compare the returned archive's exact integrity.
export async function waitForRegistryVersion(readVersion, {
  attempts = 31,
  delayMs = 10_000,
  pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const version = await readVersion();
    if (version !== null) return version;
    if (attempt + 1 < attempts) await pause(delayMs);
  }
  throw new Error('npm accepted the publication, but registry metadata is still processing. Wait for it to appear before rerunning verification. Archive integrity has not been verified.');
}
