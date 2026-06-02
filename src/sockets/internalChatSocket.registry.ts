import type { Namespace } from "socket.io";

let _nsp: Namespace | null = null;

export function registerInternalChatNamespace(nsp: Namespace): void {
  _nsp = nsp;
}

export function getInternalChatNsp(): Namespace | null {
  return _nsp;
}
