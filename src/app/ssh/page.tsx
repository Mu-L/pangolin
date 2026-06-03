import { headers } from "next/headers";
import { priv } from "@app/lib/api";
import { AxiosResponse } from "axios";
import { GetBrowserTargetResponse } from "@server/routers/browserGatewayTarget";
import SshClient from "./SshClient";
import crypto from "crypto";
import AuthFooter from "@app/components/AuthFooter";
import type { SignSshKeyResponse } from "@server/routers/ssh/types";

const pollInitialDelayMs = 250;
const pollStartIntervalMs = 250;
const pollBackoffSteps = 6;

type RoundTripMessageResponse = {
    messageId: number;
    complete: boolean;
    sentAt: number | string;
    receivedAt: number | string | null;
    error: string | null;
};

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRoundTripCompletion(
    messageIds: number[],
    cookieHeader: string
): Promise<void> {
    if (messageIds.length === 0) {
        return;
    }

    await sleep(pollInitialDelayMs);

    let interval = pollStartIntervalMs;
    for (let i = 0; i <= pollBackoffSteps; i++) {
        for (const messageId of messageIds) {
            const res = await priv.get<AxiosResponse<RoundTripMessageResponse>>(
                `/ws/round-trip-message/${messageId}`,
                {
                    headers: {
                        Cookie: cookieHeader
                    }
                }
            );

            const message = res.data.data;
            if (message.complete) {
                if (message.error) {
                    throw new Error(message.error);
                }
                return;
            }
        }

        if (i < pollBackoffSteps) {
            await sleep(interval);
            interval *= 2;
        }
    }

    throw new Error("Timed out waiting for round-trip message completion");
}

function generateEphemeralKeyPair(): {
    privateKeyPem: string;
    publicKeyOpenSSH: string;
} {
    const { publicKey: pubKeyObj, privateKey: privKeyObj } =
        crypto.generateKeyPairSync("ed25519");

    const privateKeyPem = privKeyObj.export({
        type: "pkcs8",
        format: "pem"
    }) as string;

    // Build OpenSSH wire format: uint32-length-prefixed strings
    const pubKeyDer = pubKeyObj.export({
        type: "spki",
        format: "der"
    }) as Buffer;
    const rawPubKey = pubKeyDer.subarray(pubKeyDer.length - 32); // last 32 bytes are the Ed25519 key

    function encodeField(b: Buffer): Buffer {
        const len = Buffer.allocUnsafe(4);
        len.writeUInt32BE(b.length, 0);
        return Buffer.concat([len, b]);
    }

    const keyBlob = Buffer.concat([
        encodeField(Buffer.from("ssh-ed25519")),
        encodeField(rawPubKey)
    ]);
    const publicKeyOpenSSH = `ssh-ed25519 ${keyBlob.toString("base64")}`;

    return { privateKeyPem, publicKeyOpenSSH };
}

export const dynamic = "force-dynamic";

export const metadata = {
    title: "SSH"
};

export default async function SshPage() {
    const headersList = await headers();
    const host = headersList.get("host") || "";
    const hostname = host.split(":")[0];
    const cookieHeader = headersList.get("cookie") || "";

    let target: GetBrowserTargetResponse | null = null;
    let signedKeyData: SignSshKeyResponse | null = null;
    let privateKey: string | null = null;
    let error: string | null = null;

    try {
        const res = await priv.get<AxiosResponse<GetBrowserTargetResponse>>(
            `/resource/browser-target?fullDomain=${encodeURIComponent(hostname)}`
        );
        target = res.data.data;

        if (target.pamMode === "push") {
            try {
                const { privateKeyPem, publicKeyOpenSSH } =
                    generateEphemeralKeyPair();
                privateKey = privateKeyPem;
                const res = await priv.post<AxiosResponse<SignSshKeyResponse>>(
                    `/org/${target.orgId}/ssh/sign-key`,
                    {
                        publicKey: publicKeyOpenSSH,
                        resourceId: target.resourceId,
                        type: "public"
                    },
                    {
                        headers: {
                            Cookie: cookieHeader
                        }
                    }
                );
                signedKeyData = res.data.data;

                const messageIds =
                    signedKeyData.messageIds.length > 0
                        ? signedKeyData.messageIds
                        : signedKeyData.messageId
                          ? [signedKeyData.messageId]
                          : [];

                await waitForRoundTripCompletion(messageIds, cookieHeader);
            } catch (err) {
                console.error("Error signing SSH key:", err);
                error = "Failed to sign SSH key for PAM push authentication.";
            }
        }
    } catch (err) {
        console.error("Error fetching browser target:", err);
        error = "No resource found for this domain";
    }

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 flex md:items-center justify-center">
                <div className="w-full max-w-md p-3">
                    <SshClient
                        target={target}
                        error={error}
                        signedKeyData={signedKeyData}
                        privateKey={privateKey}
                    />
                </div>
            </div>
            <AuthFooter />
        </div>
    );
}
