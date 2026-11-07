// The public root uses the same React Router renderer as the workspace.
// Nitro's named catch-all handles non-empty paths; register / explicitly.
export { default } from "./[...page].get.js";
