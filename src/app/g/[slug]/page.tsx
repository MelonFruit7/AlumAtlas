import { notFound } from "next/navigation";
import { GroupExperience } from "@/components/group-experience";
import { getGroupBySlug } from "@/lib/db";
import { hasSupabaseServerEnv } from "@/lib/env";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function GroupPage({ params }: Props) {
  if (!hasSupabaseServerEnv()) {
    return (
      <main className="wgeu-centered">
        <section className="wgeu-empty-card">
          <h1>Configuration Needed</h1>
          <p>Set Supabase environment variables before opening group pages.</p>
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
      <GroupExperience group={group} />
    </main>
  );
}

