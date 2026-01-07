import { ToolbarButton } from "./toolbar-button";
import { Users } from "lucide-react";

export default function PeopleAITool({
  disabled,
  shareToken,
}: {
  disabled: boolean;
  shareToken?: string;
}) {
  return (
    <ToolbarButton
      tool={{
        procedure: "people_ai",
        params: {},
      }}
      shareToken={shareToken}
      disabled={disabled}
      icon={Users}
      label="AI People Detection"
      isPremium
      noParams
    />
  );
}
