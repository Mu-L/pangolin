import maxmind, { AsnResponse, Reader } from "maxmind";
import config from "@server/lib/config";

let maxmindAsnLookup: Reader<AsnResponse> | null;
if (config.getRawConfig().server.maxmind_asn_path) {
    maxmindAsnLookup = await maxmind.open<AsnResponse>(
        config.getRawConfig().server.maxmind_asn_path!
    );
} else {
    maxmindAsnLookup = null;
}

export { maxmindAsnLookup };
