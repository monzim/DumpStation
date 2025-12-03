import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Clock, Calendar, Edit3, Wand2 } from "lucide-react";

interface CronBuilderProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

type ScheduleType = "hourly" | "daily" | "weekly" | "monthly" | "custom";

interface CronParts {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

const DAYS_OF_WEEK = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const PRESET_SCHEDULES = [
  { label: "Every hour", value: "0 * * * *", type: "hourly" as const },
  { label: "Daily at midnight", value: "0 0 * * *", type: "daily" as const },
  { label: "Daily at 2 AM", value: "0 2 * * *", type: "daily" as const },
  { label: "Daily at 6 AM", value: "0 6 * * *", type: "daily" as const },
  { label: "Weekly on Sunday", value: "0 0 * * 0", type: "weekly" as const },
  { label: "Weekly on Monday", value: "0 0 * * 1", type: "weekly" as const },
  { label: "Monthly on 1st", value: "0 0 1 * *", type: "monthly" as const },
];

function parseCronExpression(cron: string): CronParts {
  const parts = cron.trim().split(/\s+/);
  return {
    minute: parts[0] || "0",
    hour: parts[1] || "*",
    dayOfMonth: parts[2] || "*",
    month: parts[3] || "*",
    dayOfWeek: parts[4] || "*",
  };
}

function buildCronExpression(parts: CronParts): string {
  return `${parts.minute} ${parts.hour} ${parts.dayOfMonth} ${parts.month} ${parts.dayOfWeek}`;
}

function detectScheduleType(cron: string): ScheduleType {
  const parts = parseCronExpression(cron);

  // Hourly: minute is specific, hour is *, rest are *
  if (
    parts.hour === "*" &&
    parts.dayOfMonth === "*" &&
    parts.month === "*" &&
    parts.dayOfWeek === "*"
  ) {
    return "hourly";
  }

  // Monthly: specific day of month, rest flexible
  if (parts.dayOfMonth !== "*" && parts.dayOfWeek === "*") {
    return "monthly";
  }

  // Weekly: specific day of week
  if (parts.dayOfWeek !== "*" && parts.dayOfMonth === "*") {
    return "weekly";
  }

  // Daily: specific hour, day/month/week are *
  if (
    parts.hour !== "*" &&
    parts.dayOfMonth === "*" &&
    parts.month === "*" &&
    parts.dayOfWeek === "*"
  ) {
    return "daily";
  }

  return "custom";
}

function describeCronExpression(cron: string): string {
  try {
    const parts = parseCronExpression(cron);
    const type = detectScheduleType(cron);

    const formatTime = (hour: string, minute: string) => {
      if (hour === "*") return `every hour at minute ${minute}`;
      const h = parseInt(hour);
      const m = parseInt(minute);
      const period = h >= 12 ? "PM" : "AM";
      const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${displayHour}:${m.toString().padStart(2, "0")} ${period}`;
    };

    switch (type) {
      case "hourly":
        return `Runs every hour at minute ${parts.minute}`;
      case "daily":
        return `Runs daily at ${formatTime(parts.hour, parts.minute)}`;
      case "weekly":
        const day =
          DAYS_OF_WEEK.find((d) => d.value === parts.dayOfWeek)?.label ||
          parts.dayOfWeek;
        return `Runs every ${day} at ${formatTime(parts.hour, parts.minute)}`;
      case "monthly":
        const suffix = getOrdinalSuffix(parseInt(parts.dayOfMonth));
        return `Runs on the ${parts.dayOfMonth}${suffix} of every month at ${formatTime(parts.hour, parts.minute)}`;
      default:
        return `Custom schedule: ${cron}`;
    }
  } catch {
    return "Invalid cron expression";
  }
}

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export function CronBuilder({ value, onChange, error }: CronBuilderProps) {
  const [mode, setMode] = useState<"visual" | "manual">("visual");
  const [scheduleType, setScheduleType] = useState<ScheduleType>(() =>
    detectScheduleType(value)
  );
  const [cronParts, setCronParts] = useState<CronParts>(() =>
    parseCronExpression(value)
  );
  const [manualValue, setManualValue] = useState(value);

  // Sync internal state when external value changes
  useEffect(() => {
    const newParts = parseCronExpression(value);
    setCronParts(newParts);
    setManualValue(value);
    setScheduleType(detectScheduleType(value));
  }, [value]);

  const updateCron = useCallback(
    (newParts: CronParts) => {
      setCronParts(newParts);
      const newCron = buildCronExpression(newParts);
      onChange(newCron);
    },
    [onChange]
  );

  const handleScheduleTypeChange = (type: ScheduleType) => {
    setScheduleType(type);

    let newParts: CronParts;
    switch (type) {
      case "hourly":
        newParts = {
          minute: "0",
          hour: "*",
          dayOfMonth: "*",
          month: "*",
          dayOfWeek: "*",
        };
        break;
      case "daily":
        newParts = {
          minute: "0",
          hour: "2",
          dayOfMonth: "*",
          month: "*",
          dayOfWeek: "*",
        };
        break;
      case "weekly":
        newParts = {
          minute: "0",
          hour: "0",
          dayOfMonth: "*",
          month: "*",
          dayOfWeek: "0",
        };
        break;
      case "monthly":
        newParts = {
          minute: "0",
          hour: "0",
          dayOfMonth: "1",
          month: "*",
          dayOfWeek: "*",
        };
        break;
      case "custom":
        newParts = cronParts;
        break;
      default:
        newParts = cronParts;
    }
    updateCron(newParts);
  };

  const handlePresetSelect = (preset: (typeof PRESET_SCHEDULES)[0]) => {
    const newParts = parseCronExpression(preset.value);
    setCronParts(newParts);
    setScheduleType(preset.type);
    onChange(preset.value);
  };

  const handleManualSubmit = () => {
    onChange(manualValue);
    setScheduleType(detectScheduleType(manualValue));
  };

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-lg border p-1 bg-muted/30">
          <button
            type="button"
            onClick={() => setMode("visual")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
              mode === "visual"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Wand2 className="size-4" />
            <span className="hidden sm:inline">Visual</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
              mode === "manual"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Edit3 className="size-4" />
            <span className="hidden sm:inline">Manual</span>
          </button>
        </div>
      </div>

      {mode === "visual" ? (
        <div className="space-y-4">
          {/* Schedule Type Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Frequency</Label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {(
                ["hourly", "daily", "weekly", "monthly", "custom"] as const
              ).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleScheduleTypeChange(type)}
                  className={cn(
                    "px-3 py-2 rounded-md text-sm font-medium transition-all border",
                    scheduleType === type
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-accent border-input"
                  )}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic Options based on Schedule Type */}
          <div className="rounded-lg border bg-card p-4 space-y-4">
            {scheduleType === "hourly" && (
              <div className="space-y-2">
                <Label className="text-sm">Run at minute</Label>
                <Select
                  value={cronParts.minute}
                  onValueChange={(val) =>
                    updateCron({ ...cronParts, minute: val })
                  }
                >
                  <SelectTrigger className="w-full sm:w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 60 }, (_, i) => (
                      <SelectItem key={i} value={i.toString()}>
                        :{i.toString().padStart(2, "0")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {scheduleType === "daily" && (
              <div className="space-y-2">
                <Label className="text-sm">Run at time</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={cronParts.hour}
                    onValueChange={(val) =>
                      updateCron({ ...cronParts, hour: val })
                    }
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {i.toString().padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">:</span>
                  <Select
                    value={cronParts.minute}
                    onValueChange={(val) =>
                      updateCron({ ...cronParts, minute: val })
                    }
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 60 }, (_, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {i.toString().padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {scheduleType === "weekly" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm">Day of week</Label>
                  <Select
                    value={cronParts.dayOfWeek}
                    onValueChange={(val) =>
                      updateCron({ ...cronParts, dayOfWeek: val })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((day) => (
                        <SelectItem key={day.value} value={day.value}>
                          {day.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">At time</Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={cronParts.hour}
                      onValueChange={(val) =>
                        updateCron({ ...cronParts, hour: val })
                      }
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => (
                          <SelectItem key={i} value={i.toString()}>
                            {i.toString().padStart(2, "0")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground">:</span>
                    <Select
                      value={cronParts.minute}
                      onValueChange={(val) =>
                        updateCron({ ...cronParts, minute: val })
                      }
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 60 }, (_, i) => (
                          <SelectItem key={i} value={i.toString()}>
                            {i.toString().padStart(2, "0")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {scheduleType === "monthly" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm">Day of month</Label>
                  <Select
                    value={cronParts.dayOfMonth}
                    onValueChange={(val) =>
                      updateCron({ ...cronParts, dayOfMonth: val })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => (
                        <SelectItem key={i + 1} value={(i + 1).toString()}>
                          {i + 1}
                          {getOrdinalSuffix(i + 1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">At time</Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={cronParts.hour}
                      onValueChange={(val) =>
                        updateCron({ ...cronParts, hour: val })
                      }
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => (
                          <SelectItem key={i} value={i.toString()}>
                            {i.toString().padStart(2, "0")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground">:</span>
                    <Select
                      value={cronParts.minute}
                      onValueChange={(val) =>
                        updateCron({ ...cronParts, minute: val })
                      }
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 60 }, (_, i) => (
                          <SelectItem key={i} value={i.toString()}>
                            {i.toString().padStart(2, "0")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {scheduleType === "custom" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Configure each cron field individually for advanced
                  scheduling.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Minute
                    </Label>
                    <Input
                      value={cronParts.minute}
                      onChange={(e) =>
                        updateCron({ ...cronParts, minute: e.target.value })
                      }
                      placeholder="0-59"
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Hour
                    </Label>
                    <Input
                      value={cronParts.hour}
                      onChange={(e) =>
                        updateCron({ ...cronParts, hour: e.target.value })
                      }
                      placeholder="0-23"
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Day</Label>
                    <Input
                      value={cronParts.dayOfMonth}
                      onChange={(e) =>
                        updateCron({ ...cronParts, dayOfMonth: e.target.value })
                      }
                      placeholder="1-31"
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Month
                    </Label>
                    <Input
                      value={cronParts.month}
                      onChange={(e) =>
                        updateCron({ ...cronParts, month: e.target.value })
                      }
                      placeholder="1-12"
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Weekday
                    </Label>
                    <Input
                      value={cronParts.dayOfWeek}
                      onChange={(e) =>
                        updateCron({ ...cronParts, dayOfWeek: e.target.value })
                      }
                      placeholder="0-6"
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use * for any, */n for intervals, n-m for ranges, or
                  comma-separated values
                </p>
              </div>
            )}
          </div>

          {/* Quick Presets */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">
              Quick presets
            </Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_SCHEDULES.map((preset) => (
                <Button
                  key={preset.value}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePresetSelect(preset)}
                  className={cn(
                    "text-xs",
                    value === preset.value && "border-primary bg-primary/5"
                  )}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-sm">Cron Expression</Label>
            <div className="flex gap-2">
              <Input
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder="0 2 * * *"
                className="font-mono"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleManualSubmit}
              >
                Apply
              </Button>
            </div>
          </div>
          <div className="rounded-md bg-muted/50 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Cron Format Reference
            </p>
            <div className="grid grid-cols-5 gap-2 text-xs font-mono">
              <div className="text-center">
                <div className="font-semibold">MIN</div>
                <div className="text-muted-foreground">0-59</div>
              </div>
              <div className="text-center">
                <div className="font-semibold">HOUR</div>
                <div className="text-muted-foreground">0-23</div>
              </div>
              <div className="text-center">
                <div className="font-semibold">DOM</div>
                <div className="text-muted-foreground">1-31</div>
              </div>
              <div className="text-center">
                <div className="font-semibold">MON</div>
                <div className="text-muted-foreground">1-12</div>
              </div>
              <div className="text-center">
                <div className="font-semibold">DOW</div>
                <div className="text-muted-foreground">0-6</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              * = any, */n = every n, n-m = range, n,m = list
            </p>
          </div>
        </div>
      )}

      {/* Result Display */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Schedule</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {describeCronExpression(value)}
          </p>
          <code className="inline-flex items-center gap-1.5 rounded bg-muted px-2 py-1 text-xs font-mono">
            <Calendar className="size-3" />
            {value}
          </code>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
