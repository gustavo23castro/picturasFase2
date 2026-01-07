import { useQuery } from "@tanstack/react-query";
import {
  fetchProjects,
  fetchProject,
  getProjectImages,
  ProjectImage,
  fetchProjectResults,
  fetchShareProject,
  fetchShareProjectResults,
  fetchShareLinks,
  ShareLink,
} from "../projects";
import { io } from "socket.io-client";
import { getSocketBaseUrl } from "../axios";

export const useGetProjects = (uid: string, token: string) => {
  return useQuery({
    queryKey: ["projects", uid, token],
    queryFn: () => fetchProjects(uid, token),
  });
};

export const useGetProject = (uid: string, pid: string, token: string) => {
  return useQuery({
    queryKey: ["project", uid, pid, token],
    queryFn: () => fetchProject(uid, pid, token),
  });
};

export const useGetProjectImages = (
  uid: string,
  pid: string,
  token: string,
  initialData?: ProjectImage[],
) => {
  return useQuery({
    queryKey: ["projectImages", uid, pid, token],
    queryFn: () => getProjectImages(uid, pid, token),
    initialData: initialData,
  });
};

export const useGetSocket = (token?: string, projectId?: string) => {
  return useQuery({
    queryKey: ["socket", token, projectId],
    queryFn: () =>
      io(getSocketBaseUrl(), {
        auth: {
          token: token,
          projectId: projectId,
        },
      }),
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};

export const useGetProjectResults = (
  uid: string,
  pid: string,
  token: string,
) => {
  return useQuery({
    queryKey: ["projectResults", uid, pid, token],
    queryFn: () => fetchProjectResults(uid, pid, token),
  });
};

export const useGetShareProject = (token: string) => {
  return useQuery({
    queryKey: ["shareProject", token],
    queryFn: () => fetchShareProject(token),
  });
};

export const useGetShareProjectResults = (token: string) => {
  return useQuery({
    queryKey: ["shareProjectResults", token],
    queryFn: () => fetchShareProjectResults(token),
  });
};

export const useGetShareLinks = (uid: string, pid: string, token: string) => {
  return useQuery<ShareLink[]>({
    queryKey: ["shareLinks", uid, pid, token],
    queryFn: () => fetchShareLinks({ uid, pid, token }),
  });
};
