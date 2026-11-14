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
    await expect(page.getByText("Reviewers are free on every plan")).toBeVisible();
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
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.goto("/");
    await page.getByLabel("Work email").fill("new@acme.co");
    await page.getByRole("button", { name: "Start free" }).click();
    await expect(page.getByText("Check your inbox.")).toBeVisible();
    expect(sent).toMatchObject({ email: "new@acme.co", create_user: true });
  });

  test("has a standalone pricing page", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { level: 1, name: /Reviewers are free/ })).toBeVisible();
    await page.getByRole("link", { name: "Get Pro" }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fbilling|\/login\?next=\/billing/);
  });

  test("has no detectable accessibility problems", async ({ page }) => {
    for (const path of ["/", "/pricing", "/login"]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      expect(results.violations.map((v) => `${path}: ${v.id} (${v.nodes.length})`)).toEqual([]);
    }
  });
});

test.describe("signing in", () => {
  test("old /?next= links land on the sign-in page with the destination kept", async ({ page }) => {
    await page.goto("/?next=/billing");
    await expect(page).toHaveURL(/\/login\?next=%2Fbilling/);
    await expect(page.getByRole("heading", { name: "Sign in or create an account" })).toBeVisible();
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

  test("publishes robots.txt and a sitemap that keep prototypes private", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /p/");
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("https://realframe.app/pricing");
  });
});
