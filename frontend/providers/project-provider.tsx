"use client";

import { ProjectImage, SingleProject } from "@/lib/projects";
import { createContext, useContext } from "react";

interface ProjectContextData {
  project: SingleProject;
  currentImage: ProjectImage | null;
  preview: {
    waiting: string;
    setWaiting: (waiting: string) => void;
  };
  toolModal: {
    open: boolean;
    setOpen: (open: boolean) => void;
  };
}

const ProjectContext = createContext<ProjectContextData | undefined>(undefined);

export function ProjectProvider({
  children,
  project,
  currentImage,
  preview,
  toolModal,
}: {
  children: React.ReactNode;
  project: SingleProject;
  currentImage: ProjectImage | null;
  preview: {
    waiting: string;
    setWaiting: (waiting: string) => void;
  };
  toolModal: {
    open: boolean;
    setOpen: (open: boolean) => void;
  };
}) {
  return (
    <ProjectContext.Provider value={{ project, currentImage, preview, toolModal }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectInfo() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error("useProjectInfo() must be used within a ProjectProvider");
  }
  return context.project;
}

export function useCurrentImage() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error("useCurrentImage() must be used within a ProjectProvider");
  }
  return context.currentImage;
}

export function usePreview() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error("usePreview() must be used within a ProjectProvider");
  }
  return context.preview;
}

export function useToolModal() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error("useToolModal() must be used within a ProjectProvider");
  }
  return context.toolModal;
}
