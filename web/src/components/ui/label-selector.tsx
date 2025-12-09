import { useState, useEffect } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useLabels } from "@/lib/api/labels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LabelBadge } from "@/components/ui/label-badge";
import type { Label } from "@/lib/types/api";

interface LabelSelectorProps {
  selectedLabelIds: string[];
  onChange: (labelIds: string[]) => void;
  maxLabels?: number;
}

export function LabelSelector({
  selectedLabelIds,
  onChange,
  maxLabels = 10,
}: LabelSelectorProps) {
  const [open, setOpen] = useState(false);
  const { data: allLabels, isLoading } = useLabels();

  const selectedLabels =
    allLabels?.filter((label) => selectedLabelIds.includes(label.id)) || [];

  const toggleLabel = (labelId: string) => {
    if (selectedLabelIds.includes(labelId)) {
      onChange(selectedLabelIds.filter((id) => id !== labelId));
    } else {
      if (selectedLabelIds.length >= maxLabels) {
        return; // Don't add if at limit
      }
      onChange([...selectedLabelIds, labelId]);
    }
  };

  const removeLabel = (labelId: string) => {
    onChange(selectedLabelIds.filter((id) => id !== labelId));
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {selectedLabels.length > 0
              ? `${selectedLabels.length} label${selectedLabels.length !== 1 ? "s" : ""} selected`
              : "Select labels..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0">
          <Command>
            <CommandInput placeholder="Search labels..." />
            <CommandEmpty>
              {isLoading ? "Loading labels..." : "No labels found."}
            </CommandEmpty>
            <CommandGroup className="max-h-64 overflow-auto">
              {allLabels?.map((label) => {
                const isSelected = selectedLabelIds.includes(label.id);
                const isAtLimit = selectedLabelIds.length >= maxLabels;
                const isDisabled = !isSelected && isAtLimit;

                return (
                  <CommandItem
                    key={label.id}
                    value={label.name}
                    onSelect={() => toggleLabel(label.id)}
                    disabled={isDisabled}
                    className={cn(
                      "flex items-center gap-2",
                      isDisabled && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <LabelBadge label={label} size="sm" />
                    {label.description && (
                      <span className="text-xs text-muted-foreground truncate flex-1">
                        {label.description}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </Command>
          {selectedLabelIds.length >= maxLabels && (
            <div className="p-2 border-t text-xs text-muted-foreground text-center">
              Maximum {maxLabels} labels per configuration
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Selected labels */}
      {selectedLabels.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedLabels.map((label) => (
            <LabelBadge
              key={label.id}
              label={label}
              size="sm"
              onRemove={() => removeLabel(label.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
