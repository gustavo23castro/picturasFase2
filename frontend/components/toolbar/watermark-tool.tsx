import { ToolbarButton } from "./toolbar-button";
import { Signature } from "lucide-react";

export default function WatermarkTool({
  disabled,
  shareToken,
}: {
  disabled: boolean;
  shareToken?: string;
}) {
  return (
    <ToolbarButton
      tool={{
        procedure: "watermark",
        params: {},
      }}
      shareToken={shareToken}
      disabled={disabled}
      icon={Signature}
      label="Watermark"
      noParams
    />
  );
}
