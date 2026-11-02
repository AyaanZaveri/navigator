// This project uses legacy Node resolution; Skullet declares subpath types only
// through package exports. Reuse its shipped types without changing resolution
// for the rest of the application. Runtime imports still use skullet/react.
declare module "skullet/react" {
  export { SkeletonSuspense, SkulletProvider } from "skullet/dist/react";
}
