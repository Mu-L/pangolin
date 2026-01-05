// Curated list of major ASNs (Cloud Providers, CDNs, ISPs, etc.)
// This is not exhaustive - there are 100,000+ ASNs globally
// Users can still enter any ASN manually in the input field
export const MAJOR_ASNS = [
    {
        name: "ALL ASNs",
        code: "ALL",
        asn: 0 // Special value that will match all
    },
    // Major Cloud Providers
    {
        name: "Google LLC",
        code: "AS15169",
        asn: 15169
    },
    {
        name: "Amazon AWS",
        code: "AS16509",
        asn: 16509
    },
    {
        name: "Amazon AWS (EC2)",
        code: "AS14618",
        asn: 14618
    },
    {
        name: "Microsoft Azure",
        code: "AS8075",
        asn: 8075
    },
    {
        name: "Microsoft Corporation",
        code: "AS8068",
        asn: 8068
    },
    {
        name: "DigitalOcean",
        code: "AS14061",
        asn: 14061
    },
    {
        name: "Linode",
        code: "AS63949",
        asn: 63949
    },
    {
        name: "Hetzner Online",
        code: "AS24940",
        asn: 24940
    },
    {
        name: "OVH SAS",
        code: "AS16276",
        asn: 16276
    },
    {
        name: "Oracle Cloud",
        code: "AS31898",
        asn: 31898
    },
    {
        name: "Alibaba Cloud",
        code: "AS45102",
        asn: 45102
    },
    {
        name: "IBM Cloud",
        code: "AS36351",
        asn: 36351
    },

    // CDNs
    {
        name: "Cloudflare",
        code: "AS13335",
        asn: 13335
    },
    {
        name: "Fastly",
        code: "AS54113",
        asn: 54113
    },
    {
        name: "Akamai Technologies",
        code: "AS20940",
        asn: 20940
    },
    {
        name: "Akamai (Primary)",
        code: "AS16625",
        asn: 16625
    },

    // Mobile Carriers - US
    {
        name: "T-Mobile USA",
        code: "AS21928",
        asn: 21928
    },
    {
        name: "Verizon Wireless",
        code: "AS6167",
        asn: 6167
    },
    {
        name: "AT&T Mobility",
        code: "AS20057",
        asn: 20057
    },
    {
        name: "Sprint (T-Mobile)",
        code: "AS1239",
        asn: 1239
    },
    {
        name: "US Cellular",
        code: "AS6430",
        asn: 6430
    },

    // Mobile Carriers - Europe
    {
        name: "Vodafone UK",
        code: "AS25135",
        asn: 25135
    },
    {
        name: "EE (UK)",
        code: "AS12576",
        asn: 12576
    },
    {
        name: "Three UK",
        code: "AS29194",
        asn: 29194
    },
    {
        name: "O2 UK",
        code: "AS13285",
        asn: 13285
    },
    {
        name: "Telefonica Spain Mobile",
        code: "AS12430",
        asn: 12430
    },

    // Mobile Carriers - Asia
    {
        name: "NTT DoCoMo (Japan)",
        code: "AS9605",
        asn: 9605
    },
    {
        name: "SoftBank Mobile (Japan)",
        code: "AS17676",
        asn: 17676
    },
    {
        name: "SK Telecom (Korea)",
        code: "AS9318",
        asn: 9318
    },
    {
        name: "KT Corporation Mobile (Korea)",
        code: "AS4766",
        asn: 4766
    },
    {
        name: "Airtel India",
        code: "AS24560",
        asn: 24560
    },
    {
        name: "China Mobile",
        code: "AS9808",
        asn: 9808
    },

    // Major US ISPs
    {
        name: "AT&T Services",
        code: "AS7018",
        asn: 7018
    },
    {
        name: "Comcast Cable",
        code: "AS7922",
        asn: 7922
    },
    {
        name: "Verizon",
        code: "AS701",
        asn: 701
    },
    {
        name: "Cox Communications",
        code: "AS22773",
        asn: 22773
    },
    {
        name: "Charter Communications",
        code: "AS20115",
        asn: 20115
    },
    {
        name: "CenturyLink",
        code: "AS209",
        asn: 209
    },

    // Major European ISPs
    {
        name: "Deutsche Telekom",
        code: "AS3320",
        asn: 3320
    },
    {
        name: "Vodafone",
        code: "AS1273",
        asn: 1273
    },
    {
        name: "British Telecom",
        code: "AS2856",
        asn: 2856
    },
    {
        name: "Orange",
        code: "AS3215",
        asn: 3215
    },
    {
        name: "Telefonica",
        code: "AS12956",
        asn: 12956
    },

    // Major Asian ISPs
    {
        name: "China Telecom",
        code: "AS4134",
        asn: 4134
    },
    {
        name: "China Unicom",
        code: "AS4837",
        asn: 4837
    },
    {
        name: "NTT Communications",
        code: "AS2914",
        asn: 2914
    },
    {
        name: "KDDI Corporation",
        code: "AS2516",
        asn: 2516
    },
    {
        name: "Reliance Jio (India)",
        code: "AS55836",
        asn: 55836
    },

    // VPN/Proxy Providers
    {
        name: "Private Internet Access",
        code: "AS46562",
        asn: 46562
    },
    {
        name: "NordVPN",
        code: "AS202425",
        asn: 202425
    },
    {
        name: "Mullvad VPN",
        code: "AS213281",
        asn: 213281
    },

    // Social Media / Major Tech
    {
        name: "Facebook/Meta",
        code: "AS32934",
        asn: 32934
    },
    {
        name: "Twitter/X",
        code: "AS13414",
        asn: 13414
    },
    {
        name: "Apple",
        code: "AS714",
        asn: 714
    },
    {
        name: "Netflix",
        code: "AS2906",
        asn: 2906
    },

    // Academic/Research
    {
        name: "MIT",
        code: "AS3",
        asn: 3
    },
    {
        name: "Stanford University",
        code: "AS32",
        asn: 32
    },
    {
        name: "CERN",
        code: "AS513",
        asn: 513
    }
];
