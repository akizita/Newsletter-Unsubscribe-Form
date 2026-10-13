import { randomBytes } from 'node:crypto';

// Run once per recipient and campaign. Store the output in the restricted
// Recipients sheet; never commit generated tokens to this repository.
process.stdout.write(`${randomBytes(32).toString('base64url')}\n`);
