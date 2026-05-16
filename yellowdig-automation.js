// yellowdig-automation.js
// ---------------------------------------------------------------
// Prereqs (run once):
//   npm init -y
//   npm i playwright
//
// Run:
//   node yellowdig-automation.js
// ---------------------------------------------------------------

const { chromium } = require('playwright');

(async () => {
  // -------------------------------------------------------------
  // 1️⃣ Attach to the existing Edge/Chrome instance via CDP
  // -------------------------------------------------------------
  const wsEndpoint = 'ws://127.0.0.1:9222/devtools/browser';
  const browser = await chromium.connectOverCDP(wsEndpoint);
  const context = browser.contexts()[0];   // Default profile
  const page = await context.newPage();

  // -------------------------------------------------------------
  // 2️⃣ Go to Yellowdig – we assume you are already logged in
  // -------------------------------------------------------------
  const YELLOWDIG_URL = 'https://yellowdig.com'; // change if your school uses a sub‑domain
  await page.goto(YELLOWDIG_URL, { waitUntil: 'networkidle' });

  // -------------------------------------------------------------
  // 3️⃣ Helper functions – all selectors are ID‑free
  // -------------------------------------------------------------

  /** Get the current user's display name (used to skip own posts) */
  async function getMyDisplayName() {
    // Yellowdig shows the user’s name in the header/profile area.
    // Adjust the selector if the UI changes – this one uses role + accessible name.
    const nameEl = await page.locator('role=banner >> text=/your name/i').first();
    // Fallback: look for an element with aria-label containing "profile"
    if (!(await nameEl.count())) {
      const alt = page.locator('[aria-label*="profile" i] >> role=heading');
      return (await alt.innerText()).trim();
    }
    return (await nameEl.innerText()).trim();
  }

  /** Create a new post – uses button text and placeholders */
  async function createPost(title, body) {
    // Open the composer
    await page.getByRole('button', { name: /create post/i }).click();

    // Fill title & body (placeholders are stable)
    await page.getByPlaceholder(/post title/i).fill(title);
    await page.getByPlaceholder(/write something…/i).fill(body);

    // Submit
    await page.getByRole('button', { name: /post/i }).click();

    // Wait until the new post appears in the feed (by its title text)
    await page.locator(`role=article >> text=${title}`).first().waitFor({ state: 'visible' });
  }

  /** Reply to a post identified by its index in the feed (newest‑first) */
  async function replyToPost(postIndex, replyText) {
    // Get all post articles
    const posts = await page.locator('role=article').all();

    const targetPost = posts[postIndex];
    await targetPost.waitFor({ state: 'visible' });

    // Click the reply button inside that post (look for button with reply label)
    await targetPost.getByRole('button', { name: /reply/i }).click();

    // Fill the reply textarea
    await page.getByPlaceholder(/write a reply…/i).fill(replyText);

    // Submit the reply
    await page.getByRole('button', { name: /reply/i }).last().click(); // last because two buttons may share name

    // Wait for the reply to appear
    await page.locator(`role=region >> text=${replyText}`).first().waitFor({ state: 'visible' });
  }

  /** Return indices (0‑based) of posts that need a reply from me */
  async function postsNeedingMyReply(myName) {
    return await page.evaluate((myName) => {
      const posts = Array.from(document.querySelectorAll('role=article')); // using role for demo
      const need = [];

      posts.forEach((post, idx) => {
        // author name
        const authorEl = post.querySelector('[role="heading"] >> :scope, [aria-label*="author" i], .post-author');
        if (!authorEl) return;
        const author = authorEl.innerText.trim();
        if (author === myName) return; // skip my own posts

        // check if I already replied
        const replyAuthors = Array.from(post.querySelectorAll('[role="region"] >> [aria-label*="reply author" i], .reply-author'));
        const hasMyReply = replyAuthors.some(r => r.innerText.trim() === myName);
        if (!hasMyReply) need.push(idx);
      });

      return need;
    }, myName);
  }

  // -------------------------------------------------------------
  // 4️⃣ Main loop – create a post, then reply to everything that needs it
  // -------------------------------------------------------------
  const myName = await getMyDisplayName();
  console.log(`👤 Logged in as: ${myName}`);

  const SAFETY_LIMIT = 15;   // prevent infinite loops while testing
  let iteration = 0;

  while (iteration < SAFETY_LIMIT) {
    iteration++;
    console.log(`\n--- Iteration ${iteration} ---`);

    // ---- 4a. Create a new post -------------------------------------------------
    const postTitle = `Auto post #${iteration} – ${new Date().toLocaleTimeString()}`;
    const postBody  = `This post was generated by the Playwright script at ${new Date().toISOString()}.`;
    await createPost(postTitle, postBody);
    console.log('✅ Post created.');

    // ---- 4b. Find posts that need a reply from me -------------------------------
    const postsToReply = await postsNeedingMyReply(myName);
    console.log(`🔎 Found ${postsToReply.length} post(s) needing a reply.`);

    if (postsToReply.length === 0) {
      console.log('🛑 No more posts to reply to – stopping.');
      break;
    }

    // ---- 4c. Reply to each of those posts --------------------------------------
    for (const idx of postsToReply) {
      const replyText = `Thanks for sharing! This is an automated reply from iteration ${iteration}.`;
      await replyToPost(idx, replyText);
      console.log(`   ↪ Replied to post #${idx}`);
    }

    // Optional: pause a bit to look less bot‑like
    await page.waitForTimeout(4000); // 4 seconds
  }

  // -------------------------------------------------------------
  // 5️⃣ Clean up – detach but keep your Edge window open
  // -------------------------------------------------------------
  await browser.close();
  console.log('\n🏁 Automation finished.');
})();