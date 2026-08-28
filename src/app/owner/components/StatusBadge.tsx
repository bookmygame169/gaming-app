import React from 'react';

type StatusBadgeProps = {
    status: string;
};

export default function StatusBadge({ status }: StatusBadgeProps) {
    const statusLower = status?.toLowerCase() || '';
    let background = "rgba(255, 165, 60, 0.12)";
    let color = "#ffa53c";
    let edge = "#ffa53c";

    if (statusLower === "confirmed" || statusLower === "in-progress") {
        background = "rgba(216, 255, 60, 0.12)";
        color = "#d8ff3c";
        edge = "#d8ff3c";
    } else if (statusLower === "cancelled") {
        background = "rgba(255, 92, 43, 0.12)";
        color = "#ff5c2b";
        edge = "#ff5c2b";
    } else if (statusLower === "completed") {
        background = "rgba(242, 240, 234, 0.06)";
        color = "rgba(242, 240, 234, 0.55)";
        edge = "rgba(242, 240, 234, 0.22)";
    }

    return (
        <span
            style={{
                padding: "4px 10px",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.12em",
                fontFamily: "ui-monospace, monospace",
                background,
                color,
                border: `1px solid ${edge}`,
                textTransform: "uppercase",
            }}
        >
            {status}
        </span>
    );
}
