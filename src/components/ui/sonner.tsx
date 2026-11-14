"use client";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/components/theme";
import {
  CircleCheck,
  CircleX,
  Info,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";

/** Realframe's toaster: pill toasts, bottom-centre on phones and bottom-right on larger screens. */
function Toaster(props: ToasterProps) {
  const { resolved } = useTheme();
  return (
    <Sonner
      theme={resolved}
      position="bottom-right"
      visibleToasts={3}
      gap={8}
      offset={16}
      mobileOffset={12}
      duration={4000}
      icons={{
        success: <CircleCheck className="size-4 text-emerald-600" />,
        error: <CircleX className="size-4 text-red-600" />,
        warning: <TriangleAlert className="size-4 text-amber-600" />,
        info: <Info className="size-4 text-stone-500" />,
        loading: (
          <LoaderCircle className="size-4 animate-spin text-stone-500" />
        ),
      }}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-2xl !border-border !bg-card !px-3.5 !py-3 !text-foreground !shadow-[0_20px_48px_-20px_rgba(28,25,23,.35)] !gap-2.5 !font-sans",
          title: "!text-[13px] !font-semibold !leading-snug",
          description: "!text-xs !text-muted-foreground",
          actionButton:
            "!h-7 !rounded-full !bg-foreground !px-3 !text-xs !font-medium !text-background hover:!bg-foreground/85 active:!scale-[.97] !transition",
          cancelButton:
            "!h-7 !rounded-full !bg-secondary !px-3 !text-xs !font-medium !text-stone-700",
          closeButton: "!border-border !bg-card",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
