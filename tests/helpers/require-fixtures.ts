import { verifyFixtures } from '../../scripts/verify-fixtures.mjs';

export default async function requireFixtures(): Promise<void> {
  await verifyFixtures();
}
