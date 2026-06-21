import { beforeEach, vi } from "vitest";

class MockLocalStorage {
  private store: Record<string, string> = {};

  get length(): number {
    return Object.keys(this.store).length;
  }

  clear(): void {
    this.store = {};
  }

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }

  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
}

beforeEach(() => {
  const mockStorage = new MockLocalStorage();
  Object.defineProperty(window, "localStorage", {
    value: mockStorage,
    writable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: mockStorage,
    writable: true,
  });

  if (typeof globalThis.navigator === "undefined") {
    Object.defineProperty(globalThis, "navigator", {
      value: {
        userAgent: "Vitest Test Agent",
      },
      writable: true,
    });
  }

  vi.clearAllMocks();
  vi.clearAllTimers();
});
