import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin-shell";
import { requireAdminUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Admin | Macro Tracker",
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const adminUser = await requireAdminUser();

  return (
    <AdminShell userEmail={adminUser.email} role={adminUser.role}>
      {children}
    </AdminShell>
  );
}
