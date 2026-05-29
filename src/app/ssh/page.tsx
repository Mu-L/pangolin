import { headers } from "next/headers";
import { priv } from "@app/lib/api";
import { AxiosResponse } from "axios";
import { GetBrowserTargetResponse } from "@server/routers/resource";
import SshClient from "./SshClient";
import { SignSshKeyResponse } from "@server/private/routers/ssh";
import crypto from "crypto";
import AuthFooter from "@app/components/AuthFooter";

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
                        resource: target.niceId
                    }
                );
                signedKeyData = res.data.data;
                console.log("Received signed SSH key:", signedKeyData);
            } catch (err) {
                console.error("Error signing SSH key:", err);
                error = "Failed to sign SSH key for PAM push authentication.";
            }
        }
    } catch (error) {
        console.error("Error fetching browser target:", error);
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
