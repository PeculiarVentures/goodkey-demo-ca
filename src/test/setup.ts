import "reflect-metadata";
import { webcrypto } from "node:crypto";
import { setCrypto } from "@peculiar/ssh";
import { cryptoProvider } from "@peculiar/x509";
import { cleanup } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("indexedDB", new IDBFactory());
  setCrypto(crypto);
  cryptoProvider.set(crypto);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
