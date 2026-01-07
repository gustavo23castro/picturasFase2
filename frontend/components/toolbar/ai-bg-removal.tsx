import { ToolbarButton } from "./toolbar-button";
import { ImageOff } from "lucide-react";

export default function BgRemovalAITool({
  disabled,
  shareToken,
}: {
  disabled: boolean;
  shareToken?: string;
}) {
  return (
    <ToolbarButton
      tool={{
        procedure: "bg_remove_ai",
        params: {},
      }}
      shareToken={shareToken}
      disabled={disabled}
      icon={ImageOff}
      label="AI Background Removal"
      isPremium
      noParams
    />
  );
}
