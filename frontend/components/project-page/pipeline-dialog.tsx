"use client";

import { useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useProjectInfo, useCurrentImage, usePreview } from "@/providers/project-provider";
import { useSession } from "@/providers/session-provider";
import {
  useReorderProjectTools,
  useReorderSharedProjectTools,
  usePreviewProjectResult,
  usePreviewSharedProjectResult,
} from "@/lib/mutations/projects";

const TOOL_LABELS: Record<string, string> = {
  brightness: "Brightness",
  contrast: "Contrast",
  saturation: "Saturation",
  binarization: "Binarization",
  rotate: "Rotate",
  cut: "Crop",
  resize: "Resize",
  border: "Border",
  watermark: "Watermark",
  cut_ai: "AI Crop",
  upgrade_ai: "AI Upgrade",
  bg_remove_ai: "AI Background Removal",
  text_ai: "AI Text Detection",
  obj_ai: "AI Object Detection",
  people_ai: "AI People Detection",
};

export function PipelineDialog({
  shareToken,
  readOnly = false,
}: {
  shareToken?: string;
  readOnly?: boolean;
}) {
  const project = useProjectInfo();
  const session = useSession();
  const currentImage = useCurrentImage();
  const preview = usePreview();
  const [open, setOpen] = useState(false);
  const isShared = Boolean(shareToken);

  const reorderTools = useReorderProjectTools(
    session.user._id,
    project._id,
    session.token,
  );
  const reorderSharedTools = useReorderSharedProjectTools(shareToken || "");
  const previewEdits = usePreviewProjectResult();
  const previewSharedEdits = usePreviewSharedProjectResult();

  function handleReorder(from: number, to: number) {
    const reordered = [...project.tools];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const withPositions = reordered.map((tool, index) => ({
      ...tool,
      position: index,
    }));

    const mutation = isShared ? reorderSharedTools : reorderTools;
    const payload = isShared
      ? { token: shareToken || "", tools: withPositions }
      : {
          uid: session.user._id,
          pid: project._id,
          token: session.token,
          tools: withPositions,
        };

    mutation.mutate(payload as any, {
      onSuccess: () => {
        if (currentImage && preview.waiting === "") {
          const previewMutation = isShared
            ? previewSharedEdits
            : previewEdits;
          const previewPayload = isShared
            ? { token: shareToken || "", imageId: currentImage._id }
            : {
                uid: session.user._id,
                pid: project._id,
                token: session.token,
                imageId: currentImage._id,
              };
          previewMutation.mutate(previewPayload as any);
        }
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={readOnly}>
          Pipeline
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tool pipeline</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {project.tools.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No tools applied yet.
            </p>
          )}
          {project.tools.map((tool, index) => (
            <div
              key={tool._id}
              className="flex items-center justify-between rounded-md border p-2"
            >
              <span className="text-sm">
                {TOOL_LABELS[tool.procedure] || tool.procedure}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={index === 0 || readOnly}
                  onClick={() => handleReorder(index, index - 1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={index === project.tools.length - 1 || readOnly}
                  onClick={() => handleReorder(index, index + 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
