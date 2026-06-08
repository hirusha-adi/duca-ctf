export const SITE_PAGE_DEFINITIONS = [
  {
    slug: "rules",
    title: "General Rules",
    content: `<h2>Overview</h2>
<p>These rules apply to all participants in competitions hosted on the DUCA CTF platform, operated by the <strong>Deakin University Cybersecurity Association (DUCA)</strong>. By registering and competing, you agree to follow these rules in addition to our <a href="/terms">Terms of Service</a>.</p>
<h2>Fair play</h2>
<ul>
<li>Do not share flags, solutions, or hints with other teams or players unless the competition explicitly allows collaboration.</li>
<li>Do not attack the platform infrastructure, other users' accounts, or any systems outside the scope of a challenge.</li>
<li>Do not brute-force flags against rate limits or attempt to circumvent submission restrictions.</li>
<li>Do not use multiple accounts to gain an unfair advantage. One person, one account.</li>
<li>Do not publish or distribute challenge files, flags, or writeups before the competition has ended, unless organisers allow it.</li>
</ul>
<h2>Challenge scope</h2>
<ul>
<li>Only interact with challenge resources and targets described in the challenge description.</li>
<li>Denial-of-service attacks against challenge servers or shared infrastructure are prohibited.</li>
<li>If a challenge appears broken, report it to organisers instead of exploiting unintended behaviour for extra points.</li>
</ul>
<h2>Scoring and solves</h2>
<ul>
<li>Points are awarded for correct flag submissions as configured by organisers. Scoring is static unless otherwise stated.</li>
<li>First blood and solve order may be displayed on leaderboards and solve feeds.</li>
<li>Organisers may apply per-challenge submission limits. Failed attempts may be logged.</li>
<li>Organisers reserve the right to adjust scores, invalidate solves, or remove submissions in cases of rule violations or technical issues.</li>
</ul>
<h2>Conduct</h2>
<ul>
<li>Be respectful in any community channels linked to the event.</li>
<li>Harassment, hate speech, or disruptive behaviour may result in disqualification and account suspension.</li>
</ul>
<h2>Organiser decisions</h2>
<p>Competition organisers and platform administrators have final authority on rule interpretation, tie-breakers, and penalties. Decisions are made in good faith to keep events fair for all participants.</p>
<h2>Questions</h2>
<p>For rule clarifications during an event, contact the organisers through official competition channels. For platform issues, reach DUCA via <a href="https://duca.au" rel="noopener noreferrer" target="_blank">duca.au</a>.</p>`,
  },
  {
    slug: "terms",
    title: "Terms of Service",
    content: `<h2>1. Agreement</h2>
<p>These Terms of Service ("Terms") govern your access to and use of the DUCA CTF website and related services (the "Platform"), operated by the <strong>Deakin University Cybersecurity Association (DUCA)</strong>. By creating an account or using the Platform, you agree to these Terms and our <a href="/privacy">Privacy Policy</a>.</p>
<h2>2. Eligibility</h2>
<p>The Platform is intended for students and community members participating in DUCA cybersecurity events. You must provide accurate information during registration and keep your account details up to date. You are responsible for all activity under your account.</p>
<h2>3. Account and authentication</h2>
<p>Access is provided through passwordless email verification. You must use an email address you control. Do not share login codes or session access with others. We may suspend or disable accounts that violate these Terms or our <a href="/rules">General Rules</a>.</p>
<h2>4. Acceptable use</h2>
<p>You agree not to:</p>
<ul>
<li>Use the Platform for any unlawful purpose or in violation of university policies where applicable.</li>
<li>Attempt to gain unauthorised access to accounts, data, or systems.</li>
<li>Interfere with the operation, security, or availability of the Platform.</li>
<li>Scrape, reverse-engineer, or overload the service except as explicitly permitted by a challenge.</li>
<li>Misrepresent your identity or affiliation.</li>
</ul>
<h2>5. Competitions and content</h2>
<p>Challenges, flags, descriptions, writeups, and competition schedules are provided for educational and entertainment purposes. DUCA and competition organisers may modify, pause, or cancel events at any time. Content on the Platform may be updated without notice.</p>
<h2>6. Intellectual property</h2>
<p>Platform software, branding, and original challenge materials are owned by DUCA or respective contributors unless otherwise stated. You may not redistribute platform code or unreleased challenge materials without permission. Your submissions (e.g. flags entered) do not grant you ownership of the Platform.</p>
<h2>7. Disclaimers</h2>
<p>The Platform is provided <strong>"as is"</strong> without warranties of any kind. We do not guarantee uninterrupted access, error-free scoring, or preservation of data. Challenge environments may be ephemeral. Participate at your own risk.</p>
<h2>8. Limitation of liability</h2>
<p>To the fullest extent permitted by law, DUCA and its volunteers are not liable for any indirect, incidental, or consequential damages arising from your use of the Platform or participation in competitions.</p>
<h2>9. Termination</h2>
<p>We may suspend or terminate your access at any time for violations of these Terms, the General Rules, or for operational reasons. You may stop using the Platform at any time.</p>
<h2>10. Changes</h2>
<p>We may update these Terms from time to time. Material changes will be reflected on this page with an updated revision date. Continued use after changes constitutes acceptance.</p>
<h2>11. Contact</h2>
<p>Questions about these Terms: visit <a href="https://duca.au" rel="noopener noreferrer" target="_blank">duca.au</a> or contact DUCA organisers through official association channels.</p>`,
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    content: `<h2>1. Introduction</h2>
<p>This Privacy Policy explains how the <strong>Deakin University Cybersecurity Association (DUCA)</strong> collects, uses, stores, and protects personal information when you use the DUCA CTF platform (the "Platform"). We are committed to handling your data responsibly and transparently.</p>
<p><strong>We do not sell your personal information.</strong> Data is collected only to operate the Platform, run competitions, maintain security, and understand how the service is used for <strong>analytics and operational improvement</strong>.</p>
<h2>2. Who we are</h2>
<p>The Platform is operated by DUCA, a student association at Deakin University focused on cybersecurity education and community events. For privacy enquiries, contact us via <a href="https://duca.au" rel="noopener noreferrer" target="_blank">duca.au</a>.</p>
<h2>3. Information we collect</h2>
<h3>3.1 Account and profile data</h3>
<ul>
<li><strong>Email address</strong> — required for passwordless login (one-time codes sent to your inbox).</li>
<li><strong>Display name</strong> — shown on leaderboards and solve feeds when you complete challenges.</li>
<li><strong>Student ID</strong> — collected during onboarding where required for association or competition eligibility.</li>
<li><strong>Account role and status</strong> — e.g. user or administrator, active or disabled.</li>
</ul>
<h3>3.2 Authentication data</h3>
<ul>
<li>Hashed one-time login codes, expiry times, and verification attempt counts.</li>
<li>Encrypted session cookies that keep you signed in (see Section 6).</li>
</ul>
<h3>3.3 Competition activity</h3>
<ul>
<li><strong>Flag submissions</strong> — submitted values, success or failure, timestamps, and associated challenge.</li>
<li><strong>Solves</strong> — correct submissions, points awarded, solve time, and your user identifier.</li>
<li><strong>IP address</strong> — recorded with solves and certain submissions for abuse prevention and audit purposes.</li>
</ul>
<h3>3.4 Telemetry and analytics</h3>
<p>We log operational events to keep the Platform secure and to understand usage patterns. This may include:</p>
<ul>
<li>Action type (e.g. login, flag submit, admin action, page view events where logged).</li>
<li>Timestamp, IP address, and browser user-agent string.</li>
<li>Associated user ID when you are signed in.</li>
<li>Structured metadata relevant to the event (e.g. challenge ID, competition ID) — not used for advertising.</li>
</ul>
<p>These logs are used for <strong>security monitoring, debugging, competition administration, and aggregate analytics</strong> (such as how many users participate, which features are used, and error rates). We do not use this data for targeted advertising and we do not sell it to third parties.</p>
<h3>3.5 Technical data</h3>
<ul>
<li>Standard web server logs (requests, response codes, timestamps).</li>
<li>Uploaded images attached to writeups when administrators or authorised editors add them.</li>
</ul>
<h2>4. How we use your information</h2>
<p>We use personal information to:</p>
<ul>
<li>Authenticate you and maintain your session.</li>
<li>Operate competitions, scoring, leaderboards, and writeups.</li>
<li>Enforce rules, submission limits, and prevent abuse.</li>
<li>Provide admin tools for user and competition management.</li>
<li>Generate <strong>internal analytics</strong> on platform usage and event participation.</li>
<li>Communicate login codes and essential service-related email.</li>
<li>Comply with legal obligations where applicable.</li>
</ul>
<h2>5. Legal bases (where applicable)</h2>
<p>Depending on your jurisdiction, we rely on: performance of a contract (providing the service you signed up for), legitimate interests (security, analytics, fraud prevention), and consent where required (e.g. optional communications).</p>
<h2>6. Cookies and similar technologies</h2>
<p>We use essential session cookies to keep you logged in after email verification. These cookies are required for core functionality. We do not use third-party advertising cookies on this Platform.</p>
<h2>7. How we share information</h2>
<p><strong>We do not sell, rent, or trade your personal data.</strong></p>
<p>We may share limited data only in these circumstances:</p>
<ul>
<li><strong>Service providers</strong> — e.g. email delivery (SMTP) and hosting infrastructure, solely to operate the Platform under appropriate safeguards.</li>
<li><strong>Public leaderboards</strong> — your display name, solve times, and scores may be visible to other participants as part of the competition.</li>
<li><strong>Administrators</strong> — authorised DUCA admins can access user and activity data to run events and investigate abuse.</li>
<li><strong>Legal requirements</strong> — if required by law or to protect rights, safety, and security.</li>
</ul>
<h2>8. Data retention</h2>
<p>We retain account and competition data for as long as needed to operate the Platform and association activities. Login codes expire shortly after use or timeout. Activity logs may be retained for a limited period for security and analytics, then archived or deleted. Administrators may remove or anonymise data when no longer required.</p>
<h2>9. Security</h2>
<p>We use industry-standard measures including hashed credentials for login codes, encrypted sessions, access controls for admin functions, and rate limiting on sensitive actions. No system is perfectly secure; report concerns to DUCA promptly.</p>
<h2>10. Your rights and choices</h2>
<p>Depending on applicable law, you may have the right to access, correct, or delete your personal information, or to object to certain processing. To exercise these rights, contact DUCA via <a href="https://duca.au" rel="noopener noreferrer" target="_blank">duca.au</a>. You may request account deactivation; some competition records may be retained in anonymised or aggregated form for historical results.</p>
<h2>11. International users</h2>
<p>The Platform is operated from Australia. If you access it from elsewhere, your information may be processed in Australia and where our infrastructure providers host data.</p>
<h2>12. Children</h2>
<p>The Platform is intended for university and community participants. We do not knowingly collect data from children under 16 without appropriate consent. Contact us if you believe a minor has provided personal information.</p>
<h2>13. Changes to this policy</h2>
<p>We may update this Privacy Policy from time to time. The latest version will always be published on this page. Material changes may be communicated through the Platform or association channels.</p>
<h2>14. Contact</h2>
<p>Privacy questions or requests: <a href="https://duca.au" rel="noopener noreferrer" target="_blank">duca.au</a>.</p>`,
  },
];
