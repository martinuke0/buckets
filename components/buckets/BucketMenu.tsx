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
        className="rounded px-2 py-1 focus:outline-none"
        style={{ color: "var(--color-muted)" }}
        aria-label="Open menu"
      >
        ⋯
      </button>

      {state !== "closed" && (
        <div
          ref={menuRef}
          className="absolute right-0 z-10 mt-1 w-48 rounded-md py-1 shadow-lg"
          style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}
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
                className="block w-full px-4 py-2 text-left text-sm focus:outline-none"
                style={{ color: "var(--color-text)" }}
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setState("recolor")}
                className="block w-full px-4 py-2 text-left text-sm focus:outline-none"
                style={{ color: "var(--color-text)" }}
              >
                Recolor
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setState("delete-confirm")}
                className="block w-full px-4 py-2 text-left text-sm focus:outline-none"
                style={{ color: "var(--color-danger)" }}
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
                className="w-full rounded px-2 py-1 text-sm focus:outline-none"
                style={{ background: "var(--color-base)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                autoFocus
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleRenameSubmit}
                  className="rounded px-3 py-1 text-sm focus:outline-none"
                  style={{ background: "var(--grad-brand)", color: "var(--color-text)" }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setState("main")}
                  className="rounded px-3 py-1 text-sm focus:outline-none"
                  style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
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
                    className="h-8 w-8 rounded border-2 focus:outline-none"
                    style={{
                      backgroundColor: color,
                      borderColor: bucket.colorIndex === i ? "var(--color-text)" : "transparent"
                    }}
                    aria-label={`Color ${i + 1}`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setState("main")}
                className="mt-2 w-full rounded px-3 py-1 text-sm focus:outline-none"
                style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              >
                Back
              </button>
            </div>
          )}

          {state === "delete-confirm" && (
            <div className="px-4 py-2">
              <p className="mb-2 text-sm" style={{ color: "var(--color-text)" }}>Delete this bucket?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  className="rounded px-3 py-1 text-sm focus:outline-none"
                  style={{ background: "var(--color-danger)", border: "1px solid var(--color-danger)", color: "var(--color-text)" }}
                  aria-label="Confirm"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setState("main")}
                  className="rounded px-3 py-1 text-sm focus:outline-none"
                  style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
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
