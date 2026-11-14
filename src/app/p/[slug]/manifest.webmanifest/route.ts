import { subdomainSlug } from "@/lib/hosts";

// Web app manifest for a review link, so "Add to Home Screen" opens the prototype full screen.
// The name is generic on purpose: the manifest is public and prototype names can be private.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const onSubdomain = subdomainSlug(request.headers.get("host")) === slug;
  const base = onSubdomain ? "/" : `/p/${slug}`;
  const manifest = {
    name: "Realframe prototype",
    short_name: "Prototype",
    id: base,
    start_url: `${base}?present=1`,
    scope: onSubdomain ? "/" : `/p/${slug}`,
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: {
      "content-type": "application/manifest+json",
      "cache-control": "public, max-age=3600",
    },
  });
}
