import React from "react";

const DEFAULT_HINT = "Copy and paste this code when prompted";

export default function CopyCodeBox({
    text,
    hint
}: {
    text: string;
    hint?: string;
}) {
    return (
        <div className="inline-block">
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-6 py-4 mx-auto">
                <span className="text-2xl font-mono text-gray-900 tracking-wider font-semibold">
                    {text}
                </span>
            </div>
            <p className="text-xs text-gray-500 mt-2">{hint ?? DEFAULT_HINT}</p>
        </div>
    );
}
