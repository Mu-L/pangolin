export function validateLocalPath(value: string) {
    try {
        const url = new URL("https://pangoling.net" + value);
        if (
            url.pathname !== value ||
            value.includes("..") ||
            value.includes("*")
        ) {
            throw new Error("Invalid Path");
        }
    } catch {
        throw new Error(
            "should be a valid pathname starting with `/` and not containing query parameters, `..` or `*`"
        );
    }
}