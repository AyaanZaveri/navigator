import type { SVGProps } from "react";

// LobeHub's OpenCode icon, unavailable in the installed @lobehub/icons version.
// https://github.com/lobehub/lobe-icons/blob/master/packages/static-svg/icons/opencode.svg
export function OpenCodeIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            fillRule="evenodd"
            aria-hidden="true"
            {...props}
        >
            <path d="M16 6H8v12h8V6zm4 16H4V2h16v20z" />
        </svg>
    );
}
