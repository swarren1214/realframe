/** Screens a prototype can be previewed on. Sizes are CSS pixels, phones and tablets in portrait. */

export type DeviceKind = "desktop" | "tablet" | "phone";
export type Orientation = "portrait" | "landscape";
export type ScaleMode = "fit" | "actual" | "dynamic";

export type Device = {
  id: string;
  name: string;
  kind: DeviceKind;
  width: number;
  height: number;
  /** Screen corner radius, in device pixels. */
  radius: number;
  /** Team templates come from the database. */
  team?: boolean;
  frame?: "bezel" | "none";
};

export const DEVICES: Device[] = [
  {
    id: "desktop-1440",
    name: "Desktop",
    kind: "desktop",
    width: 1440,
    height: 900,
    radius: 10,
  },
  {
    id: "laptop-1280",
    name: "Laptop",
    kind: "desktop",
    width: 1280,
    height: 800,
    radius: 10,
  },
  {
    id: "desktop-1920",
    name: "Large display",
    kind: "desktop",
    width: 1920,
    height: 1080,
    radius: 10,
  },
  {
    id: "ipad-pro-11",
    name: 'iPad Pro 11"',
    kind: "tablet",
    width: 834,
    height: 1194,
    radius: 18,
  },
  {
    id: "ipad-pro-13",
    name: 'iPad Pro 13"',
    kind: "tablet",
    width: 1032,
    height: 1376,
    radius: 18,
  },
  {
    id: "ipad-mini",
    name: "iPad mini",
    kind: "tablet",
    width: 744,
    height: 1133,
    radius: 18,
  },
  {
    id: "galaxy-tab-s9",
    name: "Galaxy Tab S9",
    kind: "tablet",
    width: 800,
    height: 1280,
    radius: 14,
  },
  {
    id: "iphone-16-pro",
    name: "iPhone 16 Pro",
    kind: "phone",
    width: 402,
    height: 874,
    radius: 55,
  },
  {
    id: "iphone-16-pro-max",
    name: "iPhone 16 Pro Max",
    kind: "phone",
    width: 440,
    height: 956,
    radius: 55,
  },
  {
    id: "iphone-se",
    name: "iPhone SE",
    kind: "phone",
    width: 375,
    height: 667,
    radius: 0,
  },
  {
    id: "pixel-9",
    name: "Pixel 9",
    kind: "phone",
    width: 412,
    height: 915,
    radius: 40,
  },
  {
    id: "galaxy-s24",
    name: "Galaxy S24",
    kind: "phone",
    width: 360,
    height: 780,
    radius: 36,
  },
];

export const KIND_LABEL: Record<DeviceKind, string> = {
  tablet: "Tablet",
  phone: "Phone",
  desktop: "Desktop",
};
export const KINDS: DeviceKind[] = ["tablet", "phone", "desktop"];

/** What a prototype is built for. Stored on the project. */
export type DeviceSettings = {
  kinds: DeviceKind[];
  /** Device it opens on. Null: the first device of the first kind. */
  default: string | null;
  orientation: "both" | Orientation;
};

export const DEFAULT_SETTINGS: DeviceSettings = {
  kinds: ["desktop", "tablet", "phone"],
  default: null,
  orientation: "both",
};

export function readSettings(raw: unknown): DeviceSettings {
  const r = (raw ?? {}) as Partial<DeviceSettings>;
  const kinds = Array.isArray(r.kinds)
    ? r.kinds.filter((k): k is DeviceKind => KINDS.includes(k as DeviceKind))
    : [];
  return {
    kinds: kinds.length ? kinds : DEFAULT_SETTINGS.kinds,
    default: typeof r.default === "string" ? r.default : null,
    orientation:
      r.orientation === "portrait" || r.orientation === "landscape"
        ? r.orientation
        : "both",
  };
}

/** The devices a prototype can be viewed on, kind order first (tablet, phone, desktop). */
export function devicesFor(settings: DeviceSettings, extra: Device[] = []) {
  const all = [...DEVICES, ...extra];
  return KINDS.filter((k) => settings.kinds.includes(k)).flatMap((k) =>
    all.filter((d) => d.kind === k),
  );
}

export function defaultDevice(
  settings: DeviceSettings,
  extra: Device[] = [],
  /** The viewer's screen: a small one prefers a phone when the prototype allows it. */
  screen: "small" | "large" = "large",
) {
  const list = devicesFor(settings, extra);
  const kind = (k: DeviceKind) => list.find((d) => d.kind === k);
  const explicit = list.find((d) => d.id === settings.default);
  if (explicit) return explicit;
  // Without a set default: desktop if allowed, then phone, then tablet. On a
  // phone-sized screen, a phone comes first.
  return (
    (screen === "small" ? kind("phone") : undefined) ??
    kind("desktop") ??
    kind("phone") ??
    list[0] ??
    DEVICES[0]
  );
}

export function canRotate(device: Device, settings: DeviceSettings) {
  return device.kind !== "desktop" && settings.orientation === "both";
}

/** The orientation a device actually shows in, given the person's pick and the prototype's lock. */
export function effectiveOrientation(
  device: Device,
  settings: DeviceSettings,
  picked: Orientation,
): Orientation {
  if (device.kind === "desktop") return "landscape";
  return settings.orientation === "both" ? picked : settings.orientation;
}

/** Screen size in the given orientation. Desktops always show as entered. */
export function screenSize(device: Device, orientation: Orientation) {
  const { width, height } = device;
  if (device.kind === "desktop") return { width, height };
  const natural: Orientation = width >= height ? "landscape" : "portrait";
  return natural === orientation
    ? { width, height }
    : { width: height, height: width };
}

/** Tells the model which screens to design for. */
export function deviceBrief(settings: DeviceSettings) {
  const all = KINDS.every((k) => settings.kinds.includes(k));
  if (all && settings.orientation === "both") return "";
  const sizes: Record<DeviceKind, string> = {
    phone: "phones (about 360–440px wide in portrait)",
    tablet:
      "tablets (about 744–1032px wide in portrait, 1133–1376px in landscape)",
    desktop: "desktop browsers (1280px and wider)",
  };
  const kinds = KINDS.filter((k) => settings.kinds.includes(k)).map(
    (k) => sizes[k],
  );
  const lines = [
    `This prototype is built for ${kinds.join(" and ")}. Design the layout for those screens first; it doesn't need to work on other screen sizes.`,
  ];
  if (settings.orientation !== "both")
    lines.push(`It is used in ${settings.orientation} orientation only.`);
  if (!settings.kinds.includes("desktop"))
    lines.push(
      "Use touch-friendly targets (at least 44px) and native-feeling mobile patterns.",
    );
  return lines.join(" ");
}
