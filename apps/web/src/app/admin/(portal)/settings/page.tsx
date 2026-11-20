import { formatIndianMobile } from "@toynest/core";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge, buttonClass, cardClass } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { savePhoneOtp } from "./actions";

export const metadata: Metadata = { title: "Settings · ToyNest admin", robots: { index: false } };

const timeFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Kolkata" });

export default function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Settings</h1>
      <Suspense fallback={<p className="mt-6 text-sm text-muted">Loading settings…</p>}>
        <Settings searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const savedText: Record<string, string> = {
  yes: "Saved.",
  conflict: "Someone changed this setting after you opened the page, so nothing was saved. Check the current value and try again.",
  invalid: "That didn't look right. Nothing was saved.",
};

async function Settings({ searchParams }: Pick<PageProps<"/admin/settings">, "searchParams">) {
  const { context } = await requireAdmin();
  const [settings, codes, { saved }] = await Promise.all([context.settings.get(), context.smsOutbox.recent(20), searchParams]);
  const message = typeof saved === "string" ? savedText[saved] : undefined;

  return (
    <>
      {message && (
        <p role="status" className="mt-4 rounded-xl bg-surface px-4 py-3 text-sm">
          {message}
        </p>
      )}
      <section aria-labelledby="otp-heading" className={`${cardClass} mt-6 p-5 sm:p-6`}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="otp-heading" className="font-display text-xl font-semibold">
            Mobile number sign-in
          </h2>
          <Badge tone={settings.phoneOtpEnabled ? "sage" : "neutral"}>{settings.phoneOtpEnabled ? "On" : "Off"}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted">
          Shoppers sign in with a 6-digit code sent to their mobile, on the sign-in page and at checkout. When it&apos;s off, the
          option disappears and the auth server refuses to send codes, even to someone calling it directly. Email sign-in
          isn&apos;t affected.
        </p>
        <form action={savePhoneOtp} className="mt-4">
          <input type="hidden" name="version" value={settings.version} />
          <input type="hidden" name="phoneOtpEnabled" value={settings.phoneOtpEnabled ? "off" : "on"} />
          <button className={buttonClass(settings.phoneOtpEnabled ? "secondary" : "primary")}>
            {settings.phoneOtpEnabled ? "Turn off mobile sign-in" : "Turn on mobile sign-in"}
          </button>
        </form>
      </section>

      <section aria-labelledby="outbox-heading" className={`${cardClass} mt-6 p-5 sm:p-6`}>
        <h2 id="outbox-heading" className="font-display text-xl font-semibold">
          Test SMS outbox
        </h2>
        <p className="mt-2 text-sm text-muted">
          No real text messages are sent yet: each code lands here (and in the server log). Codes expire after a few minutes.
          Treat them like passwords.
        </p>
        {codes.length === 0 ? (
          <p className="mt-4 text-sm">No codes sent yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2 pr-4 font-semibold">Sent</th>
                  <th className="py-2 pr-4 font-semibold">Mobile</th>
                  <th className="py-2 font-semibold">Code</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((sms) => (
                  <tr key={`${sms.phone}-${sms.createdAt}`} className="border-t border-border">
                    <td className="py-2 pr-4 whitespace-nowrap">{timeFormat.format(new Date(sms.createdAt))}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{formatIndianMobile(sms.phone)}</td>
                    <td className="py-2 font-mono tabular-nums">{sms.otp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
