import { randomBytes, randomUUID } from "node:crypto";

export const newUid = () => randomUUID();

export function randomHex(bytes = 16) {
  return randomBytes(bytes).toString("hex");
}
