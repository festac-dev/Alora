import { Outlet, useParams } from "react-router";

import { ControlShell } from "@/components/alora/ControlShell";

export function meta() {
  return [
    { title: "Alora · Verified mission control" },
    {
      name: "description",
      content:
        "Mission control for regulated cross-border work. Deterministic checks, SHA-256 locked deliverables, human approval and a hash-chained ledger.",
    },
  ];
}

export default function ControlRoute() {
  const { view } = useParams();
  return view ? <Outlet /> : <ControlShell />;
}
