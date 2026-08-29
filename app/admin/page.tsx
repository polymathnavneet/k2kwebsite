import type { Metadata } from "next";
import { AdminConsole } from "@/components/admin-console";
export const metadata: Metadata = { title: "Private Control Room", robots: { index: false, follow: false } };
export default function AdminPage(){return <main className="admin-page"><AdminConsole /></main>}
