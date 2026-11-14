// Visitors: the marketing site, pricing and getting to sign-in. Needs no accounts.
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("marketing site", () => {
  test("shows every section with working navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Prototype it. Get it reviewed. Fix it in one build.",
    );
    for (const name of [
      "From prompt to approved, in one place",
      "Built for the people who never write a prompt",
      "Everything a prototype needs to get to yes",
      "Pay for builders. Reviewers are free.",
      "Questions",
    ])
      await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(
      page.getByText("Reviewers are free on every plan"),
    ).toBeVisible();
  });

  test("toggles pricing between annual and monthly", async ({ page }) => {
    await page.goto("/#pricing");
    const pro = page.getByTestId("price-pro");
    await expect(pro).toHaveText("$200");
    await expect(page.getByText("Works out to $16.67 a month")).toBeVisible();
    await page.getByRole("radio", { name: "Monthly" }).click();
    await expect(pro).toHaveText("$20");
    await expect(page.getByTestId("price-team")).toHaveText("$20");
    await expect(page.getByTestId("price-free")).toHaveText("$0");
  });

  test("answers questions in the FAQ", async ({ page }) => {
    await page.goto("/#faq");
    await page.getByText("Who needs a paid seat?").click();
    await expect(page.getByText(/Only people who build/)).toBeVisible();
  });

  test("sends a sign-in link from the hero", async ({ page }) => {
    let sent: unknown = null;
    await page.route("**/auth/v1/otp**", async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    });
    await page.goto("/");
    await page.getByLabel("Work email").fill("new@acme.co");
    await page.getByRole("button", { name: "Start free" }).click();
    await expect(page.getByText("Check your inbox.")).toBeVisible();
    expect(sent).toMatchObject({ email: "new@acme.co", create_user: true });
  });

  test("has a standalone pricing page", async ({ page }) => {
    await page.goto("/pricing");
    await expect(
      page.getByRole("heading", { level: 1, name: /Reviewers are free/ }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Get Pro" }).click();
    await expect(page).toHaveURL(
      /\/login\?next=%2Fbilling|\/login\?next=\/billing/,
    );
  });

  test("has no detectable accessibility problems", async ({ page }) => {
    // Check the settled page: no fade-ins mid-way (the app honours reduced motion) and
    // web fonts loaded, so contrast is measured on what people actually see.
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const path of [
      "/",
      "/pricing",
      "/faq",
      "/privacy",
      "/terms",
      "/login",
    ]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      // On failure, name each element and why, so the fix is obvious from the CI log.
      expect(
        results.violations.flatMap((v) =>
          v.nodes.map(
            (n) =>
              `${path}: ${v.id} at ${n.target.join(" ")} — ${n.any[0]?.message ?? n.failureSummary ?? ""}`,
          ),
        ),
      ).toEqual([]);
    }
  });
});

test.describe("signing in", () => {
  test("old /?next= links land on the sign-in page with the destination kept", async ({
    page,
  }) => {
    await page.goto("/?next=/billing");
    await expect(page).toHaveURL(/\/login\?next=%2Fbilling/);
    await expect(
      page.getByRole("heading", { name: "Sign in or create an account" }),
    ).toBeVisible();
  });

  test("an expired link explains itself", async ({ page }) => {
    await page.goto("/login?error=link");
    await expect(page.getByText(/sign-in link has expired/)).toBeVisible();
  });

  for (const path of ["/projects", "/billing", "/team/billing"]) {
    test(`${path} asks signed-out visitors to sign in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test("publishes robots.txt and a sitemap that keep prototypes private", async ({
    request,
  }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /p/");
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("https://realframe.app/pricing");
    for (const path of ["faq", "privacy", "terms"])
      expect(sitemap).toContain(`https://realframe.app/${path}`);
  });
});

test.describe("company pages", () => {
  test("every marketing page links to Pricing, FAQ, Privacy and Terms", async ({
    page,
  }) => {
    for (const path of ["/", "/pricing", "/faq", "/privacy", "/terms"]) {
      await page.goto(path);
      const footer = page.getByRole("navigation", { name: "Footer" });
      for (const name of ["Pricing", "FAQ", "Privacy", "Terms"])
        await expect(
          footer.getByRole("link", { name, exact: true }),
        ).toBeVisible();
    }
  });

  test("the privacy policy names who processes data and how to reach us", async ({
    page,
  }) => {
    await page.goto("/privacy");
    await expect(
      page.getByRole("heading", { level: 1, name: "Privacy Policy" }),
    ).toBeVisible();
    const sharing = page.locator("section#sharing");
    for (const provider of [
      "Supabase",
      "Vercel",
      "Anthropic",
      "Stripe",
      "Resend",
      "GitHub",
    ])
      await expect(
        sharing
          .getByRole("listitem")
          .filter({ hasText: new RegExp(`^${provider}:`) }),
      ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "support@hearthapps.com" }).first(),
    ).toHaveAttribute("href", "mailto:support@hearthapps.com");
    await page
      .getByRole("navigation", { name: "On this page" })
      .getByRole("link", { name: /Cookies/ })
      .click();
    await expect(page).toHaveURL(/#cookies$/);
  });

  test("the terms state Utah law and the plan facts", async ({ page }) => {
    await page.goto("/terms");
    await expect(
      page.getByRole("heading", { level: 1, name: "Terms of Service" }),
    ).toBeVisible();
    await expect(page.getByText(/laws of the State of Utah/)).toBeVisible();
    await expect(page.getByText(/billed at our cost plus 50%/)).toBeVisible();
    await expect(
      page.getByText(/Builds that fail aren.t billed/),
    ).toBeVisible();
  });

  test("the FAQ page groups every question and opens answers", async ({
    page,
  }) => {
    await page.goto("/faq");
    for (const name of [
      "Getting started",
      "Sharing and reviewing",
      "Plans and billing",
      "Privacy and security",
    ])
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    await page.getByText("Do you train AI models on my work?").click();
    await expect(
      page.getByText(
        /We don.t use your prototypes, prompts or comments to train/,
      ),
    ).toBeVisible();
    const ld = await page
      .locator('script[type="application/ld+json"]')
      .textContent();
    expect(JSON.parse(ld!)["@type"]).toBe("FAQPage");
  });

  test("the home FAQ links to the full list", async ({ page }) => {
    await page.goto("/#faq");
    await page.getByRole("link", { name: "See all questions" }).click();
    await expect(page).toHaveURL(/\/faq$/);
  });

  test("sign-in pages point to the terms and privacy policy", async ({
    page,
  }) => {
    for (const path of ["/", "/login"]) {
      await page.goto(path);
      await expect(
        page.getByRole("link", { name: /^Terms/ }).first(),
      ).toHaveAttribute("href", "/terms");
      await expect(
        page.getByRole("link", { name: "Privacy Policy" }).first(),
      ).toHaveAttribute("href", "/privacy");
    }
  });
});
