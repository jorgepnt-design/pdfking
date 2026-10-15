"use client";

import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

/**
 * Liest einen Wert, der nur im Browser bekannt ist (z. B. URL, User-Agent),
 * ohne Hydration-Fehler: Beim Server-Rendering gilt `serverValue`, danach der
 * Browserwert. Der Getter muss bei gleichem Zustand denselben Wert liefern.
 */
export function useClientValue<T>(getClientValue: () => T, serverValue: T): T {
  return useSyncExternalStore(subscribeNever, getClientValue, () => serverValue);
}
