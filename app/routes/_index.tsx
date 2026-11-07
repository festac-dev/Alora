import { Landing } from "@/components/alora/Landing";

export function meta() {
  return [
    { title: "Alora - Cross-border operations made easy" },
    {
      name: "description",
      content:
        "Build customs packages, recompute the numbers, and review the evidence before human approval. Explore Alora's verified shipment workspace.",
    },
  ];
}

export default function IndexRoute() {
  return <Landing />;
}
