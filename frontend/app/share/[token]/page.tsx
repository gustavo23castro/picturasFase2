"use client";

import { use, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ProjectProvider } from "@/providers/project-provider";
import { useSession } from "@/providers/session-provider";
import { ProjectImageList } from "@/components/project-page/project-image-list";
import { ViewToggle } from "@/components/project-page/view-toggle";
import { ModeToggle } from "@/components/project-page/mode-toggle";
import { Toolbar } from "@/components/toolbar/toolbar";
import { PipelineDialog } from "@/components/project-page/pipeline-dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import Loading from "@/components/loading";
import { useGetShareProject, useGetShareProjectResults, useGetSocket } from "@/lib/queries/projects";
import {
  useProcessSharedProject,
  useCancelSharedProjectProcess,
} from "@/lib/mutations/projects";
import { ProjectImage } from "@/lib/projects";

export default function ShareProject({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = use(params);
  const { token } = resolvedParams;
  const session = useSession();
  const shareProject = useGetShareProject(token);
  const shareResults = useGetShareProjectResults(token);
  const processShared = useProcessSharedProject();
  const cancelShared = useCancelSharedProjectProcess();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "grid";
  const mode = searchParams.get("mode") ?? "edit";
  const router = useRouter();
  const path = usePathname();
  const [currentImage, setCurrentImage] = useState<ProjectImage | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processingSteps, setProcessingSteps] = useState<number>(1);
  const [waitingForPreview, setWaitingForPreview] = useState<string>("");
  const [toolModalOpen, setToolModalOpen] = useState<boolean>(false);
  const [showCancel, setShowCancel] = useState<boolean>(false);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const socket = useGetSocket(session.token, shareProject.data?._id);

  const totalProcessingSteps =
    (shareProject.data?.tools.length ?? 0) *
    (shareProject.data?.imgs.length ?? 0);

  const permission = shareProject.data?.permission ?? "view";
  const readOnly = permission === "view";

  useLayoutEffect(() => {
    if (
      !["edit", "results"].includes(mode) ||
      !["grid", "carousel"].includes(view)
    ) {
      router.replace(path);
    }
  }, [mode, view, path, router]);

  useEffect(() => {
    function onProcessUpdate() {
      if (!processing) return;
      setProcessingSteps((prev) => prev + 1);

      const progress = Math.min(
        Math.round((processingSteps * 100) / totalProcessingSteps),
        100,
      );

      setProcessingProgress(progress);
      if (processingSteps >= totalProcessingSteps) {
        setTimeout(() => {
          shareResults.refetch().then(() => {
            setProcessing(false);
            setShowCancel(false);
            if (cancelTimerRef.current) {
              clearTimeout(cancelTimerRef.current);
              cancelTimerRef.current = null;
            }
            setProcessingProgress(0);
            setProcessingSteps(1);
            router.push("?mode=results&view=grid");
          });
        }, 2000);
      }
    }

    if (socket.data) {
      socket.data.on("process-update", onProcessUpdate);
      socket.data.on("process-canceled", () => {
        setProcessing(false);
        setShowCancel(false);
        if (cancelTimerRef.current) {
          clearTimeout(cancelTimerRef.current);
          cancelTimerRef.current = null;
        }
        setProcessingProgress(0);
        setProcessingSteps(1);
      });
    }

    return () => {
      if (socket.data) {
        socket.data.off("process-update", onProcessUpdate);
        socket.data.off("process-canceled");
      }
    };
  }, [
    processing,
    processingSteps,
    totalProcessingSteps,
    router,
    shareResults,
    socket.data,
  ]);

  useEffect(() => {
    function onProjectUpdate() {
      shareProject.refetch();
      shareResults.refetch();
    }

    if (socket.data) {
      socket.data.on("project-update", onProjectUpdate);
    }

    return () => {
      if (socket.data) socket.data.off("project-update", onProjectUpdate);
    };
  }, [socket.data, shareProject, shareResults]);

  if (shareProject.isError)
    return (
      <div className="flex size-full justify-center items-center h-screen p-8">
        <Alert
          variant="destructive"
          className="w-fit max-w-[40rem] text-wrap truncate"
        >
          <AlertTitle>
            {shareProject.error.message.includes("Link invalido")
              ? "Link invalido ou expirado"
              : shareProject.error.name}
          </AlertTitle>
          <AlertDescription>
            {shareProject.error.message.includes("Link invalido")
              ? "Ask the project owner for a new share link."
              : shareProject.error.message}
          </AlertDescription>
        </Alert>
      </div>
    );

  if (
    shareProject.isLoading ||
    !shareProject.data ||
    shareResults.isLoading ||
    !shareResults.data
  )
    return (
      <div className="flex justify-center items-center h-screen">
        <Loading />
      </div>
    );

  return (
    <ProjectProvider
      project={shareProject.data}
      currentImage={currentImage}
      preview={{ waiting: waitingForPreview, setWaiting: setWaitingForPreview }}
      toolModal={{ open: toolModalOpen, setOpen: setToolModalOpen }}
    >
      <div className="flex flex-col h-screen relative">
        <div className="flex flex-col xl:flex-row justify-center items-start xl:items-center xl:justify-between border-b border-sidebar-border py-2 px-2 md:px-3 xl:px-4 h-fit gap-2">
          <div className="flex items-center justify-between w-full xl:w-auto gap-2">
            <h1 className="text-lg font-semibold truncate">
              {shareProject.data.name}
            </h1>
            <span className="text-xs text-muted-foreground">
              {permission.toUpperCase()} access
            </span>
            <div className="flex items-center gap-2 xl:hidden">
              <ViewToggle />
              <ModeToggle />
            </div>
          </div>
          <div className="flex items-center justify-between w-full xl:w-auto gap-2">
            <div className="flex items-center gap-2 flex-wrap justify-end xl:justify-normal w-full xl:w-auto">
              {mode !== "results" && permission === "edit" && (
                <Button
                  disabled={
                    shareProject.data.tools.length <= 0 ||
                    waitingForPreview !== ""
                  }
                  className="inline-flex"
                  onClick={() => {
                    processShared.mutate(
                      { token },
                      {
                        onSuccess: () => {
                          setProcessing(true);
                          setShowCancel(false);
                          if (cancelTimerRef.current) {
                            clearTimeout(cancelTimerRef.current);
                          }
                          cancelTimerRef.current = setTimeout(
                            () => setShowCancel(true),
                            10000,
                          );
                        },
                        onError: (error) =>
                          toast({
                            title: "Ups! An error occurred.",
                            description: error.message,
                            variant: "destructive",
                          }),
                      },
                    );
                  }}
                >
                  <Play /> Apply
                </Button>
              )}
              {mode !== "results" && (
                <PipelineDialog shareToken={token} readOnly={readOnly} />
              )}
              <div className="hidden xl:flex items-center gap-2">
                <ViewToggle />
                <ModeToggle />
              </div>
            </div>
          </div>
        </div>
        <div className="h-full overflow-x-hidden flex">
          {mode !== "results" && (
            <Toolbar readOnly={readOnly} shareToken={token} />
          )}
          <ProjectImageList
            setCurrentImageId={setCurrentImage}
            results={shareResults.data}
          />
        </div>
      </div>
      <div>
        {processing && (
          <div className="absolute top-0 left-0 h-screen w-screen bg-black/70 z-50 flex justify-center items-center">
            <Card className="p-4 flex flex-col justify-center items-center gap-4">
              <div className="flex gap-2 items-center text-lg font-semibold">
                <h1>Processing</h1>
                <LoaderCircle className="size-[1em] animate-spin" />
              </div>
              <Progress value={processingProgress} className="w-96" />
              {showCancel && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    cancelShared.mutate({ token });
                    setProcessing(false);
                    setShowCancel(false);
                    if (cancelTimerRef.current) {
                      clearTimeout(cancelTimerRef.current);
                      cancelTimerRef.current = null;
                    }
                    setProcessingProgress(0);
                    setProcessingSteps(1);
                  }}
                >
                  Cancel
                </Button>
              )}
            </Card>
          </div>
        )}
      </div>
    </ProjectProvider>
  );
}
