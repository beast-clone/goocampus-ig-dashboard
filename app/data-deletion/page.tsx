// PUBLIC status page for Meta data deletion requests.
//   /data-deletion?code=<confirmation_code>
// Meta shows this link to the person who asked to be deleted, so it must render
// without a login (middleware only gates /dashboard/*, /me and /api/*).
// With no ?code it doubles as the plain-English "Data Deletion Instructions"
// page that Meta also accepts in place of a callback.
import { getDeletionRecord } from "@/lib/fb-deletion";

export const dynamic = "force-dynamic";

const CONTACT = "info@goocampus.in";

export default async function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const record = code ? await getDeletionRecord(code) : null;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Data Deletion</h1>
        <p className="mt-1 text-sm text-gray-500">GooCampus Analytics</p>

        {code && record && (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="font-medium text-green-900">
              {record.status === "completed"
                ? "Your data has been deleted."
                : "No data was held for your account."}
            </p>
            <dl className="mt-3 space-y-1 text-sm text-green-900/80">
              <div>
                <dt className="inline font-medium">Confirmation code: </dt>
                <dd className="inline font-mono">{record.confirmation_code}</dd>
              </div>
              <div>
                <dt className="inline font-medium">Completed: </dt>
                <dd className="inline">
                  {record.completed_at ? new Date(record.completed_at).toUTCString() : "—"}
                </dd>
              </div>
              <div>
                <dt className="inline font-medium">Records removed: </dt>
                <dd className="inline">
                  {record.deleted.threads + record.deleted.messages + record.deleted.queued}
                </dd>
              </div>
            </dl>
          </div>
        )}

        {code && !record && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            We couldn&apos;t find a request with that confirmation code. Please check the link, or
            email us at{" "}
            <a className="underline" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
            .
          </div>
        )}

        <section className="mt-8 space-y-4 text-sm leading-relaxed text-gray-700">
          <h2 className="text-base font-semibold text-gray-900">What we store</h2>
          <p>
            GooCampus Analytics is an internal tool our team uses to review the performance of our
            own Facebook and Instagram accounts. Almost everything it stores is aggregate — follower
            counts, post reach, advertising results — and is not linked to any individual.
          </p>
          <p>
            The one exception is Instagram direct messages. If you have messaged one of our
            Instagram accounts, we store your Instagram-scoped user ID, your username and the
            contents of that conversation, so our team can reply and follow up.
          </p>

          <h2 className="pt-2 text-base font-semibold text-gray-900">How to delete it</h2>
          <p>
            You can remove the app from{" "}
            <span className="font-medium">Facebook Settings → Apps and Websites</span>, which sends
            us an automatic deletion request. We delete your messages and identifiers as soon as we
            receive it, and the link Facebook shows you will report back here.
          </p>
          <p>
            You can also email{" "}
            <a className="underline" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>{" "}
            from the address you contacted us on, and we will delete your data and confirm.
          </p>
        </section>
      </div>
    </main>
  );
}
