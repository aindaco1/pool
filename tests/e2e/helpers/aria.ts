import { expect, type Locator } from '@playwright/test';

export async function expectAriaSnapshotToContain(locator: Locator, fragments: string[]) {
  // Visibility can precede the accessibility-tree update. Assert all expected
  // fragments together against the same snapshot after each update.
  await expect(async () => {
    const snapshot = await locator.ariaSnapshot();
    for (const fragment of fragments) {
      expect(snapshot).toContain(fragment);
    }
  }).toPass({ timeout: 5_000 });
}
