"use client";

import type { Bucket } from "@/lib/model/types";
import { BUCKET_DOT_COLORS, pickDotColor } from "@/lib/theme";
import { useState, useRef, useEffect } from "react";

interface BucketMenuProps {
  bucket: Bucket;
  onRename: (newName: string) => void;
  onRecolor: (colorIndex: number) => void;
  onDelete: () => void;
}

type MenuState = "closed" | "main" | "rename" | "recolor" | "delete-confirm";

export function BucketMenu({ bucket, onRename, onRecolor, onDelete }: BucketMenuProps) {
  const [state, setState] = useState<MenuState>("closed");
  const [renameDraft, setRenameDraft] = useState(bucket.name);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state === "closed") return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setState("closed");
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setState("closed");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [state]);

  const handleRenameSubmit = () => {
    if (renameDraft.trim()) {
      onRename(renameDraft.trim());
      setState("closed");
    }
  };

  const handleRecolor = (index: number) => {
    onRecolor(index);
    setState("closed");
  };

  const handleDeleteConfirm = () => {
    onDelete();
    setState("closed");
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setState(state === "closed" ? "main" : "closed")}
        className="rounded px-2 py-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-600"
        aria-label="Open menu"
      >
        ⋯
      </button>

      {state !== "closed" && (
        <div
          ref={menuRef}
          className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-gray-700 bg-gray-900 py-1 shadow-lg"
          role="menu"
        >
          {state === "main" && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setRenameDraft(bucket.name);
                  setState("rename");
                }}
                className="block w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-800 focus:bg-gray-800 focus:outline-none"
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setState("recolor")}
                className="block w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-800 focus:bg-gray-800 focus:outline-none"
              >
                Recolor
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setState("delete-confirm")}
                className="block w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-800 focus:bg-gray-800 focus:outline-none"
              >
                Delete
              </button>
            </>
          )}

          {state === "rename" && (
            <div className="px-4 py-2">
              <input
                type="text"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleRenameSubmit();
                  }
                }}
                className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                autoFocus
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleRenameSubmit}
                  className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setState("main")}
                  className="rounded bg-gray-700 px-3 py-1 text-sm text-gray-200 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {state === "recolor" && (
            <div className="px-4 py-2">
              <div className="grid grid-cols-4 gap-2">
                {BUCKET_DOT_COLORS.map((color, i) => (
                  <button
                    key={i}
                    type="button"
                    data-testid={`color-${i}`}
                    onClick={() => handleRecolor(i)}
                    className="h-8 w-8 rounded border-2 border-transparent hover:border-gray-500 focus:border-gray-400 focus:outline-none"
                    style={{ backgroundColor: color }}
                    aria-label={`Color ${i + 1}`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setState("main")}
                className="mt-2 w-full rounded bg-gray-700 px-3 py-1 text-sm text-gray-200 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Back
              </button>
            </div>
          )}

          {state === "delete-confirm" && (
            <div className="px-4 py-2">
              <p className="mb-2 text-sm text-gray-300">Delete this bucket?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label="Confirm"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setState("main")}
                  className="rounded bg-gray-700 px-3 py-1 text-sm text-gray-200 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
