import { createToolkitAuthPlugin } from "@agent-native/toolkit/app/auth/server";

export default createToolkitAuthPlugin({
  publicPaths: ["/", "/logo.svg", "/logo-mark.svg"],
  workspaceAppPublicPaths: ["/", "/logo.svg", "/logo-mark.svg"],
  // Let React Router serve the public landing page; /control stays protected.
  rootAuth: false,
  marketing: false,
});
