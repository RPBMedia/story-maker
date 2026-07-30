/** Public Privacy Policy and Terms of Service pages.
 *
 * Plain-language but real policies, written to match how StoryMaker actually
 * works: rendering is 100% in the browser (media never leaves the device),
 * accounts are the only stored data. Also satisfies Google's OAuth
 * consent-screen requirement for a hosted privacy policy + terms link.
 */
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

const LAST_UPDATED = "30 July 2026";
const CONTACT_EMAIL = "rui.palma.baiao@gmail.com";

function LegalLayout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="legal-page">
      <div className="bg-ambient" aria-hidden="true" />
      <div className="legal-shell">
        <header className="legal-topbar">
          <Link to="/" className="legal-brand">
            <span className="topbar__logo" aria-hidden="true">
              ▶
            </span>
            StoryMaker
          </Link>
          <Link to="/" className="btn btn--secondary">
            Back to app
          </Link>
        </header>

        <article className="legal card">
          <h1>{title}</h1>
          <p className="legal-updated">Last updated: {LAST_UPDATED}</p>
          {children}
          <hr />
          <p className="legal-footer">
            Questions? Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.{" "}
            <Link to={title.startsWith("Privacy") ? "/terms" : "/privacy"}>
              {title.startsWith("Privacy")
                ? "Read the Terms of Service"
                : "Read the Privacy Policy"}
            </Link>
            .
          </p>
        </article>
      </div>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p className="legal-lead">
        StoryMaker is a browser-based tool for turning your own audio, images,
        and video clips into a finished video. This policy explains what we
        collect and — just as importantly — what we don’t.
      </p>

      <div className="legal-callout">
        <strong>The short version.</strong> Your media never leaves your device.
        All video rendering happens locally in your browser, so we never upload,
        see, or store your audio, images, or video. The only personal data we
        keep is the basic account information needed to sign you in.
      </div>

      <h2>Who we are</h2>
      <p>
        StoryMaker (“StoryMaker”, “we”, “us”) is operated by Rui Baião. You can
        reach us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Information we collect</h2>
      <h3>Account information</h3>
      <p>
        When you create an account or sign in, we collect and store the basics
        needed to identify you:
      </p>
      <ul>
        <li>
          Your <strong>email address</strong>.
        </li>
        <li>
          If you sign in with Google or Apple, your{" "}
          <strong>name and profile picture</strong> as provided by that service.
        </li>
        <li>
          Your <strong>plan</strong> (e.g. Free, Creator, Pro) and a{" "}
          <strong>count of exports</strong>, used to apply plan limits.
        </li>
      </ul>
      <p>
        This account data is stored on our behalf by{" "}
        <strong>Supabase</strong>, our authentication and database provider.
      </p>

      <h3>Technical data</h3>
      <p>
        Our hosting provider (<strong>Vercel</strong>) automatically records
        standard request information — such as IP address and browser type — to
        deliver, secure, and troubleshoot the site. This is ordinary web-server
        logging, not profiling.
      </p>

      <h3>What we do <em>not</em> collect</h3>
      <ul>
        <li>
          <strong>Your media.</strong> Your audio, images, and video files stay
          on your device. Rendering runs entirely in your browser, so your files
          are never uploaded to or stored on our servers.
        </li>
        <li>
          <strong>No advertising or cross-site trackers.</strong> We don’t use
          third-party advertising or analytics trackers.
        </li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To create your account and sign you in.</li>
        <li>To remember your plan and apply its limits.</li>
        <li>To operate, secure, and improve the service.</li>
        <li>
          To send essential account emails (for example, email confirmation or
          password reset). We don’t send marketing email.
        </li>
      </ul>

      <h2>How your information is shared</h2>
      <p>
        We do not sell your personal data. We share data only with the service
        providers that make StoryMaker work:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> — authentication and storage of your account
          record.
        </li>
        <li>
          <strong>Google / Apple</strong> — only when you choose to sign in with
          them, to verify your identity.
        </li>
        <li>
          <strong>Vercel</strong> — hosting of the website.
        </li>
      </ul>
      <p>
        We may also disclose information if required by law or to protect the
        rights, safety, and security of our users and the service.
      </p>

      <h2>Cookies and local storage</h2>
      <p>
        We use only what’s necessary to run the app: a secure{" "}
        <strong>sign-in session token</strong> so you stay logged in, and small{" "}
        <strong>preferences</strong> stored locally in your browser. We do not
        use advertising cookies.
      </p>

      <h2>Data retention and your rights</h2>
      <p>
        We keep your account information for as long as your account exists. You
        can ask us to access, correct, or delete your personal data at any time
        by emailing <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
        we’ll delete your account and associated data on request. Depending on
        where you live (including the EU/EEA under the GDPR), you may have
        additional rights over your data, including the right to object to or
        restrict certain processing and to lodge a complaint with your local
        data-protection authority.
      </p>

      <h2>Data security</h2>
      <p>
        Access to StoryMaker is over encrypted HTTPS, and account data is held by
        Supabase with industry-standard protections. No system is perfectly
        secure, but because your media stays on your device, the most sensitive
        content never reaches us in the first place.
      </p>

      <h2>International transfers</h2>
      <p>
        Our providers (Supabase, Vercel) may process data in countries other
        than yours. Where required, appropriate safeguards are used to protect
        your information during these transfers.
      </p>

      <h2>Children</h2>
      <p>
        StoryMaker is not directed to children under 13 (or the minimum age
        required in your country), and we don’t knowingly collect their data.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy from time to time. When we do, we’ll change the
        “Last updated” date above, and significant changes will be highlighted in
        the app.
      </p>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <p className="legal-lead">
        These terms are the agreement between you and StoryMaker when you use the
        service. Please read them — using StoryMaker means you accept them.
      </p>

      <h2>1. The service</h2>
      <p>
        StoryMaker lets you combine your own audio, images, and video into a
        finished video, with the rendering performed locally in your web browser.
      </p>

      <h2>2. Your account</h2>
      <p>
        Some features (such as exporting your video) require an account. You
        agree to provide accurate information, to keep your login secure, and to
        be responsible for activity under your account. You must be old enough to
        form a binding contract in your country to use StoryMaker.
      </p>

      <h2>3. Your content</h2>
      <ul>
        <li>
          <strong>You keep ownership.</strong> You retain all rights to the media
          you use and the videos you create. Because processing happens in your
          browser, we don’t receive your content and take no license to it.
        </li>
        <li>
          <strong>You’re responsible for your content.</strong> You represent
          that you own or have the necessary rights (including music and image
          rights) to the material you use, and that your use doesn’t infringe
          anyone’s rights or break any law.
        </li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>You agree not to use StoryMaker to:</p>
      <ul>
        <li>create or distribute unlawful, infringing, or harmful material;</li>
        <li>
          violate others’ intellectual-property, privacy, or publicity rights;
        </li>
        <li>
          attempt to disrupt, reverse-engineer, overload, or gain unauthorized
          access to the service or its infrastructure.
        </li>
      </ul>

      <h2>5. Plans and payment</h2>
      <p>
        StoryMaker offers a Free plan and paid plans (Creator and Pro) with
        additional capabilities. When paid plans are enabled, subscriptions are
        billed through a third-party payment processor on a recurring basis until
        you cancel, and cancellation takes effect at the end of the current
        billing period. Plan features and prices may change; we’ll give
        reasonable notice of material changes.
      </p>

      <h2>6. Availability and “as is”</h2>
      <p>
        We work to keep StoryMaker reliable, but the service is provided “as is”
        and “as available,” without warranties of any kind. We don’t guarantee
        that it will be uninterrupted, error-free, or that a render will always
        succeed — browser-based rendering depends on your device’s memory and
        performance.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, StoryMaker and its operator will
        not be liable for any indirect, incidental, or consequential damages, or
        for any loss of data or content, arising from your use of the service.
      </p>

      <h2>8. Termination</h2>
      <p>
        You can stop using StoryMaker and delete your account at any time. We may
        suspend or terminate access if these terms are violated or to protect the
        service and its users.
      </p>

      <h2>9. Changes to these terms</h2>
      <p>
        We may update these terms from time to time. We’ll update the “Last
        updated” date above, and continued use after a change means you accept
        the updated terms.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These terms are governed by the laws of Sweden, without regard to
        conflict-of-laws rules, unless a mandatory consumer-protection law in
        your country of residence provides otherwise.
      </p>
    </LegalLayout>
  );
}
