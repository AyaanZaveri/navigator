"use client";

import { createContext } from "react";

// Lists own reveal timing; standalone action cards retain their entrance.
export const ResultCardEntranceContext = createContext(true);
