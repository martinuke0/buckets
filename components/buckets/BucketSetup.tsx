"use client";
import { useState } from "react";
import type { Bucket } from "@/lib/model/types";
import { AllocationBar } from "./AllocationBar";
import { BucketRow } from "./BucketRow";
import { canAddBucket, bucketCapFor, deleteBucket, resplitAdjacent } from "@/lib/buckets/edit";
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

export function BucketSetup({ initial, premium, onSave, onDelete }: BucketSetupProps) {
  const [buckets, setBuckets] = useState<Bucket[]>(initial);

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
    setBuckets((prev) => {
      const editedIdx = prev.findIndex((b) => b.id === id);
      if (editedIdx === -1) return prev;

      const savingsIdx = prev.findIndex((b) => b.name.toLowerCase() === "savings");
      const recipientIdx = savingsIdx !== -1 ? savingsIdx : prev.findIndex((b, i) => i !== editedIdx);

      if (recipientIdx === -1) return prev;

      const edited = prev[editedIdx];
      const recipient = prev[recipientIdx];
      const pairSum = edited.percent + recipient.percent;
      const clampedNewPercent = Math.max(0, Math.min(Math.round(newPercent), pairSum));
      const newRecipientPercent = pairSum - clampedNewPercent;

      return prev.map((b, i) => {
        if (i === editedIdx) {
          return { ...b, percent: clampedNewPercent };
        }
        if (i === recipientIdx) {
          return { ...b, percent: newRecipientPercent };
        }
        return b;
      });
    });
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

  const handleSave = () => {
    const bucketsWithOrder = buckets.map((b, i) => ({ ...b, order: i }));
    onSave(bucketsWithOrder);
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
            className="mt-3 rounded px-4 py-2 text-sm font-medium"
            style={{ background: "var(--grad-brand)", color: "var(--color-text)" }}
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
          disabled={!isValid}
          className="px-4 py-2 rounded text-sm font-medium"
          style={{
            background: isValid ? "var(--grad-brand)" : "var(--color-card)",
            opacity: isValid ? 1 : 0.5,
            cursor: isValid ? "pointer" : "not-allowed",
            color: "var(--color-text)",
          }}
          aria-label="Save"
        >
          Save
        </button>
      </div>
    </div>
  );
}
