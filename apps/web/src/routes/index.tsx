import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

const HomeComponent = () => (
  <div className="flex h-full items-center justify-center">
    <h1 className="text-4xl font-bold">Hello World</h1>
  </div>
);
