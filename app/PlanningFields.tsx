"use client";

import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const pad = (value: number) => String(value).padStart(2, "0");
const iso = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parse = (value: string) =>
  value ? new Date(`${value}T00:00:00`) : new Date();

export function TravelDateField({
  name,
  label,
  value,
  min,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  min: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const count = new Date(
      month.getFullYear(),
      month.getMonth() + 1,
      0,
    ).getDate();
    return [
      ...Array(first.getDay()).fill(null),
      ...Array.from(
        { length: count },
        (_, index) =>
          new Date(month.getFullYear(), month.getMonth(), index + 1),
      ),
    ];
  }, [month]);
  const selected = value ? parse(value) : null;
  return (
    <label className="planning-field-label">
      {label}
      <div className="date-field" ref={root}>
        <input type="hidden" name={name} value={value} />
        <button
          type="button"
          className={open ? "date-trigger active" : "date-trigger"}
          onClick={() => setOpen((current) => !current)}
        >
          <span>
            {selected
              ? `${selected.getFullYear()}年${selected.getMonth() + 1}月${selected.getDate()}日`
              : `选择${label}`}
          </span>
          <CalendarDays aria-hidden="true" />
        </button>
        {open && (
          <div className="date-popover">
            <header>
              <b>
                {month.getFullYear()}年 {month.getMonth() + 1}月
              </b>
              <div>
                <button
                  type="button"
                  aria-label="上个月"
                  onClick={() =>
                    setMonth(
                      new Date(month.getFullYear(), month.getMonth() - 1, 1),
                    )
                  }
                >
                  <ChevronLeft />
                </button>
                <button
                  type="button"
                  aria-label="下个月"
                  onClick={() =>
                    setMonth(
                      new Date(month.getFullYear(), month.getMonth() + 1, 1),
                    )
                  }
                >
                  <ChevronRight />
                </button>
              </div>
            </header>
            <div className="calendar-week">
              {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="calendar-days">
              {days.map((date, index) =>
                date ? (
                  <button
                    type="button"
                    key={iso(date)}
                    disabled={iso(date) < min}
                    className={value === iso(date) ? "selected" : ""}
                    onClick={() => {
                      onChange(iso(date));
                      setOpen(false);
                    }}
                  >
                    {date.getDate()}
                  </button>
                ) : (
                  <i key={`blank-${index}`} />
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </label>
  );
}

const paceOptions = [
  { value: "relaxed", label: "轻松", detail: "每天少量安排，留出休息时间" },
  { value: "balanced", label: "均衡", detail: "游览与休息保持平衡" },
  { value: "packed", label: "紧凑", detail: "尽可能体验更多地点" },
];

export type ChoiceOption = {
  value: string;
  label: string;
  detail?: string;
};

export function ChoiceField({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name?: string;
  value: string;
  options: ChoiceOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const current =
    options.find((option) => option.value === value) || options[0];

  return (
    <label className="planning-field-label">
      {label}
      <div className="choice-field" ref={root}>
        {name && <input type="hidden" name={name} value={value} />}
        <button
          type="button"
          className={open ? "choice-trigger active" : "choice-trigger"}
          onClick={() => setOpen((currentOpen) => !currentOpen)}
          aria-expanded={open}
        >
          <span>{current.label}</span>
          <ChevronDown aria-hidden="true" />
        </button>
        {open && (
          <div className="choice-popover">
            {options.map((option) => (
              <button
                type="button"
                key={option.value}
                className={option.value === value ? "selected" : ""}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>
                  <b>{option.label}</b>
                  {option.detail && <small>{option.detail}</small>}
                </span>
                {option.value === value && <Check aria-hidden="true" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </label>
  );
}

export function FormChoiceField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: ChoiceOption[];
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <ChoiceField
      label={label}
      name={name}
      value={value}
      options={options}
      onChange={setValue}
    />
  );
}

export function PaceField({
  defaultValue = "balanced",
  onChange,
}: {
  defaultValue?: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <ChoiceField
      label="旅行节奏"
      name="pace"
      value={value}
      options={paceOptions}
      onChange={(nextValue) => {
        setValue(nextValue);
        onChange?.(nextValue);
      }}
    />
  );
}
