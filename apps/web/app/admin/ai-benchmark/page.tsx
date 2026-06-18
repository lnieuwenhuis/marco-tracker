import type { Metadata } from "next";

import { AdminAiBenchmarkClient } from "@/components/admin-ai-benchmark-client";
import { AdminSection } from "@/components/admin-ui";

export const metadata: Metadata = {
  title: "AI Benchmark | Macro Tracker Admin",
};

export default function AdminAiBenchmarkPage() {
  return (
    <div className="space-y-6">
      <AdminSection
        title="AI Model Benchmark"
        description="Compare a candidate OpenRouter vision model against the configured production food-photo model."
      >
        <AdminAiBenchmarkClient />
      </AdminSection>
    </div>
  );
}
