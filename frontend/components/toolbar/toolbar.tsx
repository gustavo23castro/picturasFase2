import { useSearchParams } from "next/navigation";
import BrightnessTool from "./brightness-tool";
import ContrastTool from "./contrast-tool";
import CropTool from "./crop-tool";
import ResizeTool from "./resize-tool";
import RotateTool from "./rotate-tool";
import SaturationTool from "./saturation-tool";
import BorderTool from "./border-tool";
import BinarizationTool from "./binarization-tool";
import WatermarkTool from "./watermark-tool";
import CropAITool from "./ai-crop-tool";
import BgRemovalAITool from "./ai-bg-removal";
import ObjectAITool from "./object-ai-tool";
import PeopleAITool from "./people-ai-tool";
import TextAITool from "./text-ai-tool";
import UpgradeAITool from "./upgrade-ai-tool";
import {
  useClearProjectTools,
  useClearSharedProjectTools,
} from "@/lib/mutations/projects";
import { useSession } from "@/providers/session-provider";
import { useProjectInfo } from "@/providers/project-provider";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Eraser } from "lucide-react";
import { useState } from "react";

export function Toolbar({
  readOnly = false,
  shareToken,
}: {
  readOnly?: boolean;
  shareToken?: string;
}) {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "grid";
  const disabled = view === "grid" || readOnly;
  const project = useProjectInfo();
  const session = useSession();

  const [open, setOpen] = useState<boolean>(false);

  const clearTools = useClearProjectTools(
    session.user._id,
    project._id,
    session.token,
  );
  const clearSharedTools = useClearSharedProjectTools(shareToken || "");

  return (
    <div className="flex h-full w-14 flex-col justify-between items-center border-r bg-background p-2">
      <div className="flex flex-col gap-2">
        <span className="text-sm text-gray-500">Tools</span>
        <BrightnessTool disabled={disabled} shareToken={shareToken} />
        <ContrastTool disabled={disabled} shareToken={shareToken} />
        <SaturationTool disabled={disabled} shareToken={shareToken} />
        <BinarizationTool disabled={disabled} shareToken={shareToken} />
        <RotateTool disabled={disabled} shareToken={shareToken} />
        <CropTool disabled={disabled} shareToken={shareToken} />
        <ResizeTool disabled={disabled} shareToken={shareToken} />
        <BorderTool disabled={disabled} shareToken={shareToken} />
        <WatermarkTool disabled={disabled} shareToken={shareToken} />
        <BgRemovalAITool disabled={disabled} shareToken={shareToken} />
        <CropAITool disabled={disabled} shareToken={shareToken} />
        <ObjectAITool disabled={disabled} shareToken={shareToken} />
        <PeopleAITool disabled={disabled} shareToken={shareToken} />
        <TextAITool disabled={disabled} shareToken={shareToken} />
        <UpgradeAITool disabled={disabled} shareToken={shareToken} />
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className="text-red-400 size-8"
            disabled={project.tools.length === 0 || readOnly}
          >
            <Eraser />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear Tools?</DialogTitle>
            <DialogDescription>
              This will remove <b>all</b> edits from the current project.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => {
                if (shareToken) {
                  clearSharedTools.mutate({
                    token: shareToken,
                    toolIds: project.tools.map((t) => t._id),
                  });
                } else {
                  clearTools.mutate({
                    uid: session.user._id,
                    pid: project._id,
                    toolIds: project.tools.map((t) => t._id),
                    token: session.token,
                  });
                }
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
