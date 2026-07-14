"use client";
import { useState, useEffect } from "react";
import type { Bucket } from "@/lib/model/types";
import { AllocationBar } from "./AllocationBar";
import { BucketRow } from "./BucketRow";
import { canAddBucket, bucketCapFor, deleteBucket, setBucketPercent } from "@/lib/buckets/edit";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface BucketSetupProps {
  initial: Bucket[];
  premium: boolean;
  onSave: (buckets: Bucket[]) => void;
  onDelete: (id: string) => void;
  onUpgrade?: () => void;
}

function SortableBucketRow({
  bucket,
  onPercentChange,
  onRename,
  onRecolor,
  onDelete,
}: {
  bucket: Bucket;
  onPercentChange: (percent: number) => void;
  onRename: (newName: string) => void;
  onRecolor: (colorIndex: number) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: bucket.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <BucketRow
        bucket={bucket}
        onPercentChange={onPercentChange}
        onRename={onRename}
        onRecolor={onRecolor}
        onDelete={onDelete}
        dragHandleProps={listeners}
      />
    </div>
  );
}

export function BucketSetup({ initial, premium, onSave, onDelete, onUpgrade }: BucketSetupProps) {
  const [buckets, setBuckets] = useState<Bucket[]>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const total = buckets.reduce((sum, b) => sum + b.percent, 0);
  const isValid = total === 100;
  const cap = bucketCapFor(premium);
  const atCap = !canAddBucket(buckets, premium);

  useEffect(() => {
    if (saved) {
      const timer = setTimeout(() => setSaved(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [saved]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setBuckets((items) => {
        const oldIndex = items.findIndex((b) => b.id === active.id);
        const newIndex = items.findIndex((b) => b.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handlePercentChange = (id: string, newPercent: number) => {
    // Single source of truth: the pure helper picks a recipient excluding the edited
    // bucket and preserves total=100 (handles editing Savings correctly).
    setBuckets((prev) => setBucketPercent(prev, id, newPercent));
  };

  const handleRename = (id: string, newName: string) => {
    setBuckets((prev) => prev.map((b) => (b.id === id ? { ...b, name: newName } : b)));
  };

  const handleRecolor = (id: string, colorIndex: number) => {
    setBuckets((prev) => prev.map((b) => (b.id === id ? { ...b, colorIndex } : b)));
  };

  const handleDeleteLocal = (id: string) => {
    onDelete(id);
    setBuckets((prev) => deleteBucket(prev, id));
  };

  const handleAddBucket = () => {
    const nextColorIndex = buckets.length % 8;
    const newBucket: Bucket = {
      id: crypto.randomUUID(),
      name: "New bucket",
      colorIndex: nextColorIndex,
      percent: 0,
      type: "virtual",
      remaining: 0,
      allocated: 0,
    };
    setBuckets((prev) => [...prev, newBucket]);
  };

  const handleSave = async () => {
    setSaving(true);
    const bucketsWithOrder = buckets.map((b, i) => ({ ...b, order: i }));
    await Promise.resolve(onSave(bucketsWithOrder));
    setSaving(false);
    setSaved(true);
  };

  return (
    <div className="space-y-6">
      <AllocationBar buckets={buckets} onChange={setBuckets} />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={buckets.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {buckets.map((bucket) => (
              <SortableBucketRow
                key={bucket.id}
                bucket={bucket}
                onPercentChange={(percent) => handlePercentChange(bucket.id, percent)}
                onRename={(newName) => handleRename(bucket.id, newName)}
                onRecolor={(colorIndex) => handleRecolor(bucket.id, colorIndex)}
                onDelete={() => handleDeleteLocal(bucket.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>
        {buckets.length} of {cap} · {premium ? "Premium" : "Free"}
      </div>

      {!atCap && (
        <button
          type="button"
          onClick={handleAddBucket}
          className="text-sm hover:opacity-80"
          style={{ color: "var(--color-text)" }}
          aria-label="Add bucket"
        >
          + Add bucket
        </button>
      )}

      {atCap && (
        <div
          className="rounded-lg p-4"
          style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}
        >
          <div className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
            Need more buckets?
          </div>
          <div className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>
            Free includes 5 buckets. Premium unlocks 15 buckets + AI Coach.
          </div>
          <button
            type="button"
            onClick={onUpgrade}
            disabled={!onUpgrade}
            className="mt-3 rounded px-4 py-2 text-sm font-medium"
            style={{
              background: "var(--grad-brand)",
              color: "var(--color-text)",
              opacity: onUpgrade ? 1 : 0.5,
              cursor: onUpgrade ? "pointer" : "not-allowed",
            }}
          >
            Upgrade to Premium
          </button>
        </div>
      )}

      <div
        className="flex items-center justify-between pt-4"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: "var(--color-muted)" }}>Total:</span>
          <span
            data-testid="total-percent"
            style={{ color: isValid ? "var(--color-success)" : "var(--color-danger)" }}
            className="text-sm font-medium"
          >
            {total}
          </span>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={!isValid || saving}
          className="px-4 py-2 rounded text-sm font-medium transition-transform hover:scale-105 active:scale-95"
          style={{
            background: (isValid && !saving) ? "var(--grad-brand)" : "var(--color-card)",
            opacity: (isValid && !saving) ? 1 : 0.5,
            cursor: (isValid && !saving) ? "pointer" : "not-allowed",
            color: "var(--color-text)",
          }}
          aria-label="Save"
        >
          {saving ? "Saving..." : saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  );
}
