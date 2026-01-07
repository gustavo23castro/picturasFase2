"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/providers/session-provider";
import { useProjectInfo, useToolModal } from "@/providers/project-provider";
import { useToast } from "@/hooks/use-toast";
import { useCreateShareLink, useRevokeShareLink } from "@/lib/mutations/projects";
import { useGetShareLinks } from "@/lib/queries/projects";

export function ShareDialog() {
  const session = useSession();
  const project = useProjectInfo();
  const toolModal = useToolModal();
  const { toast } = useToast();
  const [open, setOpen] = useState<boolean>(false);
  const [permission, setPermission] = useState<"view" | "edit">("view");
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [createdLink, setCreatedLink] = useState<string>("");

  const shareLinks = useGetShareLinks(
    session.user._id,
    project._id,
    session.token,
  );
  const createShareLink = useCreateShareLink(
    session.user._id,
    project._id,
    session.token,
  );
  const revokeShareLink = useRevokeShareLink(
    session.user._id,
    project._id,
    session.token,
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin);
    }
  }, []);

  function handleCreate() {
    createShareLink.mutate(
      {
        uid: session.user._id,
        pid: project._id,
        token: session.token,
        permission: permission,
        unsaved: toolModal.open,
      },
      {
        onSuccess: (link) => {
          setCreatedLink(link.token);
          toast({
            title: "Share link created",
          });
        },
        onError: (error) => {
          toast({
            title: "Ups! An error occurred.",
            description: error.message,
            variant: "destructive",
          });
        },
      },
    );
  }

  function handleCopy(token: string) {
    const url = `${baseUrl}/share/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Link copied" });
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Share</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share project</DialogTitle>
          <DialogDescription>
            Generate secure links to view or edit this project.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Select
            value={permission}
            onValueChange={(value) => setPermission(value as "view" | "edit")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Permission" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="view">View</SelectItem>
              <SelectItem value="edit">Edit</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={handleCreate}
            disabled={toolModal.open || createShareLink.isPending}
          >
            Generate Link
          </Button>
          {toolModal.open && (
            <p className="text-xs text-red-500">
              Close open tool panels to share this project.
            </p>
          )}
          {createdLink && (
            <div className="flex gap-2 items-center">
              <Input
                readOnly
                value={`${baseUrl}/share/${createdLink}`}
                onFocus={(event) => event.target.select()}
              />
              <Button onClick={() => handleCopy(createdLink)} variant="outline">
                Copy
              </Button>
            </div>
          )}
        </div>
        <DialogFooter className="flex flex-col gap-2 items-stretch">
          <div className="w-full">
            <p className="text-sm font-medium">Active links</p>
            <div className="mt-2 flex flex-col gap-2">
              {shareLinks.data?.length ? (
                shareLinks.data.map((link) => (
                  <div
                    key={link.token}
                    className="flex items-center gap-2"
                  >
                    <Input
                      readOnly
                      value={`${baseUrl}/share/${link.token}`}
                      onFocus={(event) => event.target.select()}
                    />
                    <span className="text-xs text-muted-foreground">
                      {link.permission}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => handleCopy(link.token)}
                    >
                      Copy
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() =>
                        revokeShareLink.mutate({
                          uid: session.user._id,
                          pid: project._id,
                          token: session.token,
                          linkToken: link.token,
                        })
                      }
                    >
                      Revoke
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No active links yet.
                </p>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
