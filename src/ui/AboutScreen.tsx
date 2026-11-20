import type { Settings } from '../core/policy';
import { TaskTable } from './StatusBar';

const REPO = 'https://github.com/youneedgreg/Staffroom';

/**
 * The evidence page: the rule, the nine steps a judge follows, the live mode table, the limits,
 * the privacy statement, credits and the AI note. Every number here was measured on the live
 * site (docs/test-log.md). Never claim "secure", "private", "anonymous" or "compliant".
 */
export function AboutScreen({ settings }: { settings: Settings }) {
  return (
    <section className="about" data-testid="about">
      <h2>About Staffroom</h2>
      <p>
        Staffroom helps a teacher in Kenya's Competency-Based Curriculum write report remarks, plan support for a group
        that is struggling, and write notes to parents. It runs as a web app in Chrome.
      </p>

      <h3 id="about-rule">The rule</h3>
      <p data-testid="about-rule">
        <strong>Anything about a child stays on this laptop.</strong> Remarks, group summaries and parent notes are
        written by the model built into Chrome, on this laptop. If this browser has no on-device model, those tasks stop.
        They are never sent to the cloud instead, and no setting can change that. The only text that can leave is a
        curriculum question with no learner in it, which you see and can edit before it is sent.
      </p>

      <h3 id="about-steps">Try it in nine steps</h3>
      <p>
        Use Chrome on a desktop with the on-device model. Everything below uses an invented class: no real learner is in
        it.
      </p>
      <ol className="steps" data-testid="about-steps">
        <li>On <a href="#/class">Class</a>, choose "Load the invented sample class". Thirty made-up learners appear with levels and notes.</li>
        <li>Turn your wifi off.</li>
        <li>On <a href="#/reports">Reports</a>, choose "Draft all remarks". Each remark says "Written on this laptop".</li>
        <li>On <a href="#/support">Support</a>, Fractions is first, with 10 learners. Choose "Plan support", then "Sum up the difficulty". The laptop reads their notes and writes one phrase.</li>
        <li>Turn your wifi back on. Read the text that will leave the laptop, checked against the class list with 0 learner names. Choose "Ask the cloud".</li>
        <li>The plan comes back with activities for the group. Web sources aren't available on the free tier this demo runs on, so Staffroom offers to ask again without them, and marks the answer "No web sources".</li>
        <li>Choose "Write the parent notes". One note per learner is written on the laptop.</li>
        <li>Type a learner's first name, such as "Faith", into the difficulty. "Ask the cloud" switches off and says why. Nothing is sent.</li>
        <li>Open the <a href="#/ledger">Privacy ledger</a>. When I ran these steps on the live site it showed 41 runs on this laptop, 1 in the cloud, 1 sent and not answered (the request with web sources), and 0 learner tasks sent to the cloud.</li>
      </ol>
      <p>
        The <a href="#/selftest">Self-test</a> runs six of the seven tasks once and shows where each ran. In a browser with
        no on-device model, the learner tasks stop and say why. That is the rule working, not a fault.
      </p>

      <h3 id="about-modes">Which task runs where</h3>
      <TaskTable settings={settings} testPrefix="about-task" />

      <h3 id="about-limits">Limitations</h3>
      <ul data-testid="about-limits">
        <li>Desktop Chrome only. Android, iOS and other browsers are not supported in this version.</li>
        <li>English only for writing on the laptop.</li>
        <li>The on-device model needs a capable laptop, which many teachers don't have.</li>
        <li>The name check compares text with the class list. It can't catch a nickname or a misspelling it has never seen, so read the text before you send it.</li>
        <li>What is stored on this laptop is not encrypted. Anyone using the same browser profile can see it.</li>
        <li>Every remark, plan and note is a draft. The teacher reads, edits and decides.</li>
        <li>On the free tier this demo runs on, plans come without web sources.</li>
        <li>Reading a mark-sheet photo is in the table of tasks, but has no screen in this version.</li>
        <li>One class and one learning area at a time. No printing of a full report card.</li>
      </ul>

      <h3 id="about-privacy">Privacy</h3>
      <p data-testid="about-privacy">
        Staffroom keeps your class in this browser, on this laptop. Remarks, group summaries and parent notes are written
        by a model that runs inside Chrome on the same laptop. One kind of text can leave: a curriculum question with no
        learner in it, which you see and can edit before it is sent. If you share a plan, that question and the cloud's
        answer are saved to a shared library that other teachers using Staffroom can read. Staffroom has no accounts with
        names, no analytics, and no copy of your class on any server. It does not encrypt what is stored on the laptop.
      </p>
      <p>
        Running on the laptop reduces where a child's data goes. It doesn't remove a school's duties under Kenya's Data
        Protection Act, such as a parent's or guardian's consent. This is not legal advice.
      </p>
      <p>
        To delete everything Staffroom stored on this laptop, use "Remove everything from this laptop" on the{' '}
        <a href="#/class">Class</a> page.
      </p>

      <h3 id="about-credits">Credits</h3>
      <p data-testid="about-credits">
        Made by Gregory Temwa Odete in Nairobi for the #BuildHybridAI hackathon, with Firebase AI Logic hybrid inference,
        App Check, Remote Config, Firestore and Firebase Hosting. The source code is on{' '}
        <a href={REPO} target="_blank" rel="noreferrer">GitHub</a> under the Apache 2.0 licence.
      </p>

      <h3 id="about-ai">AI assistance</h3>
      <p data-testid="about-ai">
        Claude (Anthropic) helped me research the hackathon, design the routing rules, and write much of the code, the
        prompts and the tests. I set the rules, ran every test on the real on-device model, and reviewed every change.
      </p>
    </section>
  );
}
