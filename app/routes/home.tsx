import { redirect } from "react-router";

import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [
    { title: `${APP_TITLE} · Verified mission control` },
    {
      name: "description",
      content:
        "Alora is a verified mission control for regulated cross-border work.",
    },
  ];
}

export function loader() {
  return redirect("/control");
}

export default function HomeRedirect() {
  return null;
}
