import { notFound } from "next/navigation";
import { AdminExperience } from "@/components/admin-experience";
import { getGroupBySlug } from "@/lib/db";
import { hasSupabaseServerEnv } from "@/lib/env";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function AdminGroupPage({ params }: Props) {
  if (!hasSupabaseServerEnv()) {
    return (
      <main className="wgeu-centered">
        <section className="wgeu-empty-card">
          <h1>Configuration Needed</h1>
          <p>Set Supabase environment variables before opening admin pages.</p>
        </section>
      </main>
    );
  }

  const { slug } = await params;
  const group = await getGroupBySlug(slug);
  if (!group) {
    notFound();
  }

  return (
    <main className="wgeu-group-page">
      <AdminExperience group={group} />
    </main>
  );
}

