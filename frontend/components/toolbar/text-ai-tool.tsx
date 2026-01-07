import { ToolbarButton } from "./toolbar-button";
import { CaseSensitive } from "lucide-react";

export default function TextAITool({
  disabled,
  shareToken,
}: {
  disabled: boolean;
  shareToken?: string;
}) {
  return (
    <ToolbarButton
      tool={{
        procedure: "text_ai",
        params: {},
      }}
      shareToken={shareToken}
      disabled={disabled}
      icon={CaseSensitive}
      label="AI Text Detection"
      isPremium
      noParams
    />
  );
}
