import { ControlShell } from "@/components/alora/ControlShell";

const views = ["shipments", "evidence", "replay", "agents", "extensions"];
export function loader({ params }: { params: { view?: string } }) {
  if (!params.view || !views.includes(params.view))
    throw new Response("Page not found", { status: 404 });
  return null;
}
export function meta({ params }: { params: { view?: string } }) {
  const view = params.view ?? "shipments";
  return [{ title: `${view[0]?.toUpperCase()}${view.slice(1)} · Alora` }];
}
export default function ControlView() {
  return <ControlShell />;
}
