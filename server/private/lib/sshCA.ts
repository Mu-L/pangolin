/*
 * This file is part of a proprietary work.
 *
 * Copyright (c) 2025 Fossorial, Inc.
 * All rights reserved.
 *
 * This file is licensed under the Fossorial Commercial License.
 * You may not use this file except in compliance with the License.
 * Unauthorized use, copying, modification, or distribution is strictly prohibited.
 *
 * This file is not licensed under the AGPLv3.
 */

import * as crypto from "crypto";

/**
 * SSH CA "Server" - Pure TypeScript Implementation
 *
 * This module provides basic SSH Certificate Authority functionality using
 * only Node.js built-in crypto module. No external dependencies or subprocesses.
 *
 * Usage:
 *   1. generateCA() - Creates a new CA key pair, returns CA info including the
 *      TrustedUserCAKeys line to add to servers
 *   2. signPublicKey() - Signs a user's public key with the CA, returns a certificate
 */

// ============================================================================
// SSH Wire Format Helpers
// ============================================================================

/**
 * Encode a string in SSH wire format (4-byte length prefix + data)
 */
function encodeString(data: Buffer | string): Buffer {
    const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
    const len = Buffer.alloc(4);
    len.writeUInt32BE(buf.length, 0);
    return Buffer.concat([len, buf]);
}

/**
 * Encode a uint32 in SSH wire format (big-endian)
 */
function encodeUInt32(value: number): Buffer {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(value, 0);
    return buf;
}

/**
 * Encode a uint64 in SSH wire format (big-endian)
 */
function encodeUInt64(value: bigint): Buffer {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(value, 0);
    return buf;
}

/**
 * Decode a string from SSH wire format at the given offset
 * Returns the string buffer and the new offset
 */
function decodeString(data: Buffer, offset: number): { value: Buffer; newOffset: number } {
    const len = data.readUInt32BE(offset);
    const value = data.subarray(offset + 4, offset + 4 + len);
    return { value, newOffset: offset + 4 + len };
}

// ============================================================================
// SSH Public Key Parsing/Encoding
// ============================================================================

/**
 * Parse an OpenSSH public key line (e.g., "ssh-ed25519 AAAA... comment")
 */
function parseOpenSSHPublicKey(pubKeyLine: string): {
    keyType: string;
    keyData: Buffer;
    comment: string;
} {
    const parts = pubKeyLine.trim().split(/\s+/);
    if (parts.length < 2) {
        throw new Error("Invalid public key format");
    }

    const keyType = parts[0];
    const keyData = Buffer.from(parts[1], "base64");
    const comment = parts.slice(2).join(" ") || "";

    // Verify the key type in the blob matches
    const { value: blobKeyType } = decodeString(keyData, 0);
    if (blobKeyType.toString("utf8") !== keyType) {
        throw new Error(`Key type mismatch: ${blobKeyType.toString("utf8")} vs ${keyType}`);
    }

    return { keyType, keyData, comment };
}

/**
 * Encode an Ed25519 public key in OpenSSH format
 */
function encodeEd25519PublicKey(publicKey: Buffer): Buffer {
    return Buffer.concat([
        encodeString("ssh-ed25519"),
        encodeString(publicKey)
    ]);
}

/**
 * Format a public key blob as an OpenSSH public key line
 */
function formatOpenSSHPublicKey(keyBlob: Buffer, comment: string = ""): string {
    const { value: keyType } = decodeString(keyBlob, 0);
    const base64 = keyBlob.toString("base64");
    return `${keyType.toString("utf8")} ${base64}${comment ? " " + comment : ""}`;
}

// ============================================================================
// SSH Certificate Building
// ============================================================================

interface CertificateOptions {
    /** Serial number for the certificate */
    serial?: bigint;
    /** Certificate type: 1 = user, 2 = host */
    certType?: number;
    /** Key ID (usually username or identifier) */
    keyId: string;
    /** List of valid principals (usernames the cert is valid for) */
    validPrincipals: string[];
    /** Valid after timestamp (seconds since epoch) */
    validAfter?: bigint;
    /** Valid before timestamp (seconds since epoch) */
    validBefore?: bigint;
    /** Critical options (usually empty for user certs) */
    criticalOptions?: Map<string, string>;
    /** Extensions to enable */
    extensions?: string[];
}

/**
 * Build the extensions section of the certificate
 */
function buildExtensions(extensions: string[]): Buffer {
    // Extensions are a series of name-value pairs, sorted by name
    // For boolean extensions, the value is empty
    const sortedExtensions = [...extensions].sort();

    const parts: Buffer[] = [];
    for (const ext of sortedExtensions) {
        parts.push(encodeString(ext));
        parts.push(encodeString("")); // Empty value for boolean extensions
    }

    return encodeString(Buffer.concat(parts));
}

/**
 * Build the critical options section
 */
function buildCriticalOptions(options: Map<string, string>): Buffer {
    const sortedKeys = [...options.keys()].sort();

    const parts: Buffer[] = [];
    for (const key of sortedKeys) {
        parts.push(encodeString(key));
        parts.push(encodeString(encodeString(options.get(key)!)));
    }

    return encodeString(Buffer.concat(parts));
}

/**
 * Build the valid principals section
 */
function buildPrincipals(principals: string[]): Buffer {
    const parts: Buffer[] = [];
    for (const principal of principals) {
        parts.push(encodeString(principal));
    }
    return encodeString(Buffer.concat(parts));
}

/**
 * Extract the raw Ed25519 public key from an OpenSSH public key blob
 */
function extractEd25519PublicKey(keyBlob: Buffer): Buffer {
    const { newOffset } = decodeString(keyBlob, 0); // Skip key type
    const { value: publicKey } = decodeString(keyBlob, newOffset);
    return publicKey;
}

// ============================================================================
// CA Interface
// ============================================================================

export interface CAKeyPair {
    /** CA private key in PEM format (keep this secret!) */
    privateKeyPem: string;
    /** CA public key in PEM format */
    publicKeyPem: string;
    /** CA public key in OpenSSH format (for TrustedUserCAKeys) */
    publicKeyOpenSSH: string;
    /** Raw CA public key bytes (Ed25519) */
    publicKeyRaw: Buffer;
}

export interface SignedCertificate {
    /** The certificate in OpenSSH format (save as id_ed25519-cert.pub or similar) */
    certificate: string;
    /** The certificate type string */
    certType: string;
    /** Serial number */
    serial: bigint;
    /** Key ID */
    keyId: string;
    /** Valid principals */
    validPrincipals: string[];
    /** Valid from timestamp */
    validAfter: Date;
    /** Valid until timestamp */
    validBefore: Date;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Generate a new SSH Certificate Authority key pair.
 *
 * Returns the CA keys and the line to add to /etc/ssh/sshd_config:
 *   TrustedUserCAKeys /etc/ssh/ca.pub
 *
 * Then save the publicKeyOpenSSH to /etc/ssh/ca.pub on the server.
 *
 * @param comment - Optional comment for the CA public key
 * @returns CA key pair and configuration info
 */
export function generateCA(comment: string = "ssh-ca"): CAKeyPair {
    // Generate Ed25519 key pair
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" }
    });

    // Get raw public key bytes
    const pubKeyObj = crypto.createPublicKey(publicKey);
    const rawPubKey = pubKeyObj.export({ type: "spki", format: "der" });
    // Ed25519 SPKI format: 12 byte header + 32 byte key
    const ed25519PubKey = rawPubKey.subarray(rawPubKey.length - 32);

    // Create OpenSSH format public key
    const pubKeyBlob = encodeEd25519PublicKey(ed25519PubKey);
    const publicKeyOpenSSH = formatOpenSSHPublicKey(pubKeyBlob, comment);

    return {
        privateKeyPem: privateKey,
        publicKeyPem: publicKey,
        publicKeyOpenSSH,
        publicKeyRaw: ed25519PubKey
    };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get and decrypt the SSH CA keys for an organization.
 * 
 * @param orgId - Organization ID
 * @param decryptionKey - Key to decrypt the CA private key (typically server.secret from config)
 * @returns CA key pair or null if not found
 */
export async function getOrgCAKeys(
    orgId: string,
    decryptionKey: string
): Promise<CAKeyPair | null> {
    const { db, orgs } = await import("@server/db");
    const { eq } = await import("drizzle-orm");
    const { decrypt } = await import("@server/lib/crypto");

    const [org] = await db
        .select({
            sshCaPrivateKey: orgs.sshCaPrivateKey,
            sshCaPublicKey: orgs.sshCaPublicKey
        })
        .from(orgs)
        .where(eq(orgs.orgId, orgId))
        .limit(1);

    if (!org || !org.sshCaPrivateKey || !org.sshCaPublicKey) {
        return null;
    }

    const privateKeyPem = decrypt(org.sshCaPrivateKey, decryptionKey);

    // Extract raw public key from the OpenSSH format
    const { keyData } = parseOpenSSHPublicKey(org.sshCaPublicKey);
    const { newOffset } = decodeString(keyData, 0); // Skip key type
    const { value: publicKeyRaw } = decodeString(keyData, newOffset);

    // Get PEM format of public key
    const pubKeyObj = crypto.createPublicKey({
        key: privateKeyPem,
        format: "pem"
    });
    const publicKeyPem = pubKeyObj.export({ type: "spki", format: "pem" }) as string;

    return {
        privateKeyPem,
        publicKeyPem,
        publicKeyOpenSSH: org.sshCaPublicKey,
        publicKeyRaw
    };
}

/**
 * Sign a user's SSH public key with the CA, producing a certificate.
 *
 * The resulting certificate should be saved alongside the user's private key
 * with a -cert.pub suffix. For example:
 *   - Private key: ~/.ssh/id_ed25519
 *   - Certificate: ~/.ssh/id_ed25519-cert.pub
 *
 * @param caPrivateKeyPem - CA private key in PEM format
 * @param userPublicKeyLine - User's public key in OpenSSH format
 * @param options - Certificate options (principals, validity, etc.)
 * @returns Signed certificate
 */
export function signPublicKey(
    caPrivateKeyPem: string,
    userPublicKeyLine: string,
    options: CertificateOptions
): SignedCertificate {
    // Parse the user's public key
    const { keyType, keyData } = parseOpenSSHPublicKey(userPublicKeyLine);

    // Determine certificate type string
    let certTypeString: string;
    if (keyType === "ssh-ed25519") {
        certTypeString = "ssh-ed25519-cert-v01@openssh.com";
    } else if (keyType === "ssh-rsa") {
        certTypeString = "ssh-rsa-cert-v01@openssh.com";
    } else if (keyType === "ecdsa-sha2-nistp256") {
        certTypeString = "ecdsa-sha2-nistp256-cert-v01@openssh.com";
    } else if (keyType === "ecdsa-sha2-nistp384") {
        certTypeString = "ecdsa-sha2-nistp384-cert-v01@openssh.com";
    } else if (keyType === "ecdsa-sha2-nistp521") {
        certTypeString = "ecdsa-sha2-nistp521-cert-v01@openssh.com";
    } else {
        throw new Error(`Unsupported key type: ${keyType}`);
    }

    // Get CA public key from private key
    const caPrivKey = crypto.createPrivateKey(caPrivateKeyPem);
    const caPubKey = crypto.createPublicKey(caPrivKey);
    const caRawPubKey = caPubKey.export({ type: "spki", format: "der" });
    const caEd25519PubKey = caRawPubKey.subarray(caRawPubKey.length - 32);
    const caPubKeyBlob = encodeEd25519PublicKey(caEd25519PubKey);

    // Set defaults
    const serial = options.serial ?? BigInt(Date.now());
    const certType = options.certType ?? 1; // 1 = user cert
    const now = BigInt(Math.floor(Date.now() / 1000));
    const validAfter = options.validAfter ?? (now - 60n); // 1 minute ago
    const validBefore = options.validBefore ?? (now + 86400n * 365n); // 1 year from now

    // Default extensions for user certificates
    const defaultExtensions = [
        "permit-X11-forwarding",
        "permit-agent-forwarding",
        "permit-port-forwarding",
        "permit-pty",
        "permit-user-rc"
    ];
    const extensions = options.extensions ?? defaultExtensions;
    const criticalOptions = options.criticalOptions ?? new Map();

    // Generate nonce (random bytes)
    const nonce = crypto.randomBytes(32);

    // Extract the public key portion from the user's key blob
    // For Ed25519: skip the key type string, get the public key (already encoded)
    let userKeyPortion: Buffer;
    if (keyType === "ssh-ed25519") {
        // Skip the key type string, take the rest (which is encodeString(32-byte-key))
        const { newOffset } = decodeString(keyData, 0);
        userKeyPortion = keyData.subarray(newOffset);
    } else {
        // For other key types, extract everything after the key type
        const { newOffset } = decodeString(keyData, 0);
        userKeyPortion = keyData.subarray(newOffset);
    }

    // Build the certificate body (to be signed)
    const certBody = Buffer.concat([
        encodeString(certTypeString),
        encodeString(nonce),
        userKeyPortion,
        encodeUInt64(serial),
        encodeUInt32(certType),
        encodeString(options.keyId),
        buildPrincipals(options.validPrincipals),
        encodeUInt64(validAfter),
        encodeUInt64(validBefore),
        buildCriticalOptions(criticalOptions),
        buildExtensions(extensions),
        encodeString(""), // reserved
        encodeString(caPubKeyBlob) // signature key (CA public key)
    ]);

    // Sign the certificate body
    const signature = crypto.sign(null, certBody, caPrivKey);

    // Build the full signature blob (algorithm + signature)
    const signatureBlob = Buffer.concat([
        encodeString("ssh-ed25519"),
        encodeString(signature)
    ]);

    // Build complete certificate
    const certificate = Buffer.concat([
        certBody,
        encodeString(signatureBlob)
    ]);

    // Format as OpenSSH certificate line
    const certLine = `${certTypeString} ${certificate.toString("base64")} ${options.keyId}`;

    return {
        certificate: certLine,
        certType: certTypeString,
        serial,
        keyId: options.keyId,
        validPrincipals: options.validPrincipals,
        validAfter: new Date(Number(validAfter) * 1000),
        validBefore: new Date(Number(validBefore) * 1000)
    };
}
