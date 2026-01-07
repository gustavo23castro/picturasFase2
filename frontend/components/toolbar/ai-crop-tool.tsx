import { ToolbarButton } from "./toolbar-button";
import { Crop } from "lucide-react";

export default function CropAITool({
  disabled,
  shareToken,
}: {
  disabled: boolean;
  shareToken?: string;
}) {
  return (
    <ToolbarButton
      tool={{
        procedure: "cut_ai",
        params: {},
      }}
      shareToken={shareToken}
      disabled={disabled}
      icon={Crop}
      label="AI Crop"
      isPremium
      noParams
    />
  );
}
