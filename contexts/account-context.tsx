"use client";

import { createContext, useContext } from "react";

// Standalone player consumers retain their existing behavior. The app shell
// always supplies its server-verified account state through AccountProvider.
export const AccountContext = createContext({ authenticated: true, requestSignIn: () => {} });

export function useAccountAccess() {
    return useContext(AccountContext);
}
