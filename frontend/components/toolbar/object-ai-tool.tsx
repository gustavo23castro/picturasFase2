import { ToolbarButton } from "./toolbar-button";
import { Box } from "lucide-react";

export default function ObjectAITool({
  disabled,
  shareToken,
}: {
  disabled: boolean;
  shareToken?: string;
}) {
  return (
    <ToolbarButton
      tool={{
        procedure: "obj_ai",
        params: {},
      }}
      shareToken={shareToken}
      disabled={disabled}
      icon={Box}
      label="AI Object Detection"
      isPremium
      noParams
    />
  );
}
