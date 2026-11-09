import { createHash } from "node:crypto";

/** Lowercase hex SHA-256 of the UTF-8 bytes — matches the contract's hash format. */
export const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
