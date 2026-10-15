import { expect, it, vi } from 'vitest';
import { waitForRegistryVersion } from '../../scripts/registry-visibility.mjs';

it('waits for an accepted publication to become visible without publishing again', async () => {
  const record = { dist: { integrity: 'sha512-expected' } };
  const read = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue(record);
  const pause = vi.fn().mockResolvedValue(undefined);
  expect(await waitForRegistryVersion(read, { pause })).toBe(record);
  expect(read).toHaveBeenCalledTimes(3);
  expect(pause.mock.calls).toEqual([[10000], [10000]]);
});

it('reports pending registry processing separately from an integrity mismatch', async () => {
  const read = vi.fn().mockResolvedValue(null), pause = vi.fn().mockResolvedValue(undefined);
  await expect(waitForRegistryVersion(read, { attempts: 3, pause })).rejects.toThrow('Archive integrity has not been verified');
  expect(read).toHaveBeenCalledTimes(3);
  expect(pause).toHaveBeenCalledTimes(2);
});

it('fails immediately for a registry lookup error instead of hiding an authentication failure', async () => {
  const read = vi.fn().mockRejectedValue(new Error('Registry lookup failed: 401'));
  const pause = vi.fn();
  await expect(waitForRegistryVersion(read, { pause })).rejects.toThrow('Registry lookup failed: 401');
  expect(read).toHaveBeenCalledOnce();
  expect(pause).not.toHaveBeenCalled();
});
