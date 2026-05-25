import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--canvas-soft)",
          "--normal-text": "var(--on-primary)",
          "--normal-border": "var(--hairline-soft)",
          "--border-radius": "var(--radius-app-lg)",
          "--success-bg": "var(--canvas-soft)",
          "--success-text": "var(--success)",
          "--success-border": "var(--hairline-soft)",
          "--info-bg": "var(--canvas-soft)",
          "--info-text": "var(--link-blue-soft)",
          "--info-border": "var(--hairline-soft)",
          "--error-bg": "var(--canvas-soft)",
          "--error-text": "var(--error)",
          "--error-border": "var(--hairline-soft)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
