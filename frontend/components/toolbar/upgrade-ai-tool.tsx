import { ToolbarButton } from "./toolbar-button";
import { ArrowBigUpDashIcon } from "lucide-react";

export default function UpgradeAITool({
  disabled,
  shareToken,
}: {
  disabled: boolean;
  shareToken?: string;
}) {
  return (
    <ToolbarButton
      tool={{
        procedure: "upgrade_ai",
        params: {},
      }}
      shareToken={shareToken}
      disabled={disabled}
      icon={ArrowBigUpDashIcon}
      label="AI Upgrade"
      isPremium
      noParams
    />
  );
}
