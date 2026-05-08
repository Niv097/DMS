import React, { useEffect, useMemo, useRef, useState } from 'react';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const pad = (value) => String(value).padStart(2, '0');

const toLocalDate = (value) => {
  if (!value) return null;
  const parts = String(value).split('-').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return null;

  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

const toISODate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const toDisplayDate = (date) => `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addMonths = (date, offset) => new Date(date.getFullYear(), date.getMonth() + offset, 1);
const normalizeTypedDateInput = (value) => {
  const digits = String(value || '')
    .replace(/\D/g, '')
    .slice(0, 8);

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
};

const parseTypedDate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const compactDigits = raw.replace(/\D/g, '');
  if (compactDigits.length === 8 && !raw.includes('-') && !raw.includes('/') && !raw.includes('.')) {
    const day = Number.parseInt(compactDigits.slice(0, 2), 10);
    const month = Number.parseInt(compactDigits.slice(2, 4), 10);
    const year = Number.parseInt(compactDigits.slice(4, 8), 10);
    return toLocalDate(`${year}-${pad(month)}-${pad(day)}`);
  }

  const normalized = raw.replace(/\//g, '-').replace(/\./g, '-');
  const parts = normalized.split('-').map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 3) return null;

  let year;
  let month;
  let day;

  if (parts[0].length === 4) {
    [year, month, day] = parts.map((part) => Number.parseInt(part, 10));
  } else {
    [day, month, year] = parts.map((part) => Number.parseInt(part, 10));
  }

  if (![year, month, day].every((part) => Number.isInteger(part))) return null;
  return toLocalDate(`${year}-${pad(month)}-${pad(day)}`);
};

const buildCalendarDays = (monthDate) => {
  const firstOfMonth = startOfMonth(monthDate);
  const firstDay = (firstOfMonth.getDay() + 6) % 7;
  const startDate = new Date(firstOfMonth);
  startDate.setDate(startDate.getDate() - firstDay);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return date;
  });
};

const DatePicker = ({
  id,
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  min,
  max,
  helpText,
  placeholder = 'dd-mm-yyyy'
}) => {
  const wrapperRef = useRef(null);
  const popoverRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [viewMonth, setViewMonth] = useState(() => {
    const selected = toLocalDate(value);
    return startOfMonth(selected || new Date());
  });

  const selectedDate = useMemo(() => toLocalDate(value), [value]);
  const minDate = useMemo(() => toLocalDate(min), [min]);
  const maxDate = useMemo(() => toLocalDate(max), [max]);
  const calendarDays = useMemo(() => buildCalendarDays(viewMonth), [viewMonth]);
  const todayISO = useMemo(() => toISODate(new Date()), []);
  const currentYear = new Date().getFullYear();
  const minYear = minDate?.getFullYear() ?? 1900;
  const maxYear = maxDate?.getFullYear() ?? currentYear;
  const yearOptions = useMemo(() => {
    const years = [];
    for (let year = maxYear; year >= minYear; year -= 1) {
      years.push(year);
    }
    return years;
  }, [maxYear, minYear]);

  useEffect(() => {
    if (!selectedDate) return;
    setViewMonth(startOfMonth(selectedDate));
  }, [selectedDate]);

  useEffect(() => {
    setInputValue(selectedDate ? toDisplayDate(selectedDate) : '');
  }, [selectedDate]);

  useEffect(() => {
    if (!open) return undefined;

    const updateAlignment = () => {
      const wrapperRect = wrapperRef.current?.getBoundingClientRect();
      const popoverWidth = popoverRef.current?.getBoundingClientRect().width || 360;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const overflowRight = wrapperRect ? wrapperRect.left + popoverWidth > viewportWidth - 16 : false;
      setAlignRight(overflowRight);
    };

    const rafId = window.requestAnimationFrame(updateAlignment);
    window.addEventListener('resize', updateAlignment);
    window.addEventListener('scroll', updateAlignment, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateAlignment);
      window.removeEventListener('scroll', updateAlignment, true);
    };
  }, [open]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const isDisabledDate = (date) => {
    const iso = toISODate(date);
    return Boolean(
      (minDate && iso < toISODate(minDate))
      || (maxDate && iso > toISODate(maxDate))
    );
  };

  const handleSelect = (date) => {
    if (isDisabledDate(date)) return;
    onChange(toISODate(date));
    setInputValue(toDisplayDate(date));
    setViewMonth(startOfMonth(date));
    setOpen(false);
  };

  const commitTypedDate = () => {
    if (!inputValue.trim()) {
      onChange('');
      return;
    }

    const parsedDate = parseTypedDate(inputValue);
    if (!parsedDate || isDisabledDate(parsedDate)) {
      setInputValue(selectedDate ? toDisplayDate(selectedDate) : '');
      return;
    }

    onChange(toISODate(parsedDate));
    setInputValue(toDisplayDate(parsedDate));
    setViewMonth(startOfMonth(parsedDate));
  };

  const monthLabel = `${MONTHS[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`;
  const rangeLabel = [
    minDate ? `From ${minDate.toLocaleDateString('en-GB')}` : '',
    maxDate ? `To ${maxDate.toLocaleDateString('en-GB')}` : ''
  ].filter(Boolean).join(' | ');

  return (
    <div className="form-group date-picker" ref={wrapperRef}>
      <label htmlFor={id}>
        {label}
        {required && <span className="required-marker" aria-hidden="true"> *</span>}
      </label>

      <div className={`date-picker-control ${disabled ? 'is-disabled' : ''}`}>
        <input
          id={id}
          type="text"
          className={`date-picker-input ${selectedDate ? '' : 'placeholder'}`}
          value={inputValue}
          onChange={(event) => {
            const nextValue = normalizeTypedDateInput(event.target.value);
            setInputValue(nextValue);

            if (!nextValue.trim()) {
              onChange('');
              return;
            }

            const parsedDate = parseTypedDate(nextValue);
            if (parsedDate && !isDisabledDate(parsedDate)) {
              onChange(toISODate(parsedDate));
              setViewMonth(startOfMonth(parsedDate));
            }
          }}
          onBlur={commitTypedDate}
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitTypedDate();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="off"
          aria-haspopup="dialog"
          aria-expanded={open}
        />
        <button
          type="button"
          className="date-picker-icon-button"
          onClick={() => {
            if (!disabled) setOpen((current) => !current);
          }}
          disabled={disabled}
          aria-label={`Open ${label} calendar`}
        >
          <span className="date-picker-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M7 3v4M17 3v4M3 9h18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          </span>
        </button>
      </div>

      {open && !disabled && (
        <div ref={popoverRef} className={`date-picker-popover ${alignRight ? 'align-right' : ''}`} role="dialog" aria-label={label}>
          <div className="date-picker-header">
            <button
              type="button"
              className="date-picker-nav"
              onClick={() => setViewMonth((current) => addMonths(current, -1))}
              aria-label="Previous month"
            >
              &lt;
            </button>
            <div className="date-picker-header-controls">
              <select
                className="date-picker-select month"
                value={viewMonth.getMonth()}
                onChange={(event) => {
                  const nextMonth = Number.parseInt(event.target.value, 10);
                  setViewMonth(new Date(viewMonth.getFullYear(), nextMonth, 1));
                }}
                aria-label="Select month"
              >
                {MONTHS.map((month, index) => (
                  <option key={month} value={index}>{month}</option>
                ))}
              </select>

              <select
                className="date-picker-select year"
                value={viewMonth.getFullYear()}
                onChange={(event) => {
                  const nextYear = Number.parseInt(event.target.value, 10);
                  setViewMonth(new Date(nextYear, viewMonth.getMonth(), 1));
                }}
                aria-label="Select year"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="date-picker-nav"
              onClick={() => setViewMonth((current) => addMonths(current, 1))}
              aria-label="Next month"
            >
              &gt;
            </button>
          </div>

          <div className="date-picker-weekdays" aria-hidden="true">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>

          <div className="date-picker-range">
            {rangeLabel || 'Choose a date'}
          </div>

          <div className="date-picker-grid" role="grid" aria-label={`${monthLabel} calendar`}>
            {calendarDays.map((date) => {
              const iso = toISODate(date);
              const selected = selectedDate && iso === toISODate(selectedDate);
              const currentMonth = date.getMonth() === viewMonth.getMonth();
              const today = iso === todayISO;
              const disabledDay = isDisabledDate(date);

              return (
                <button
                  key={iso}
                  type="button"
                  className={[
                    'date-picker-day',
                    currentMonth ? 'current-month' : 'other-month',
                    selected ? 'selected' : '',
                    today ? 'today' : '',
                    disabledDay ? 'disabled' : ''
                  ].join(' ').trim()}
                  onClick={() => handleSelect(date)}
                  disabled={disabledDay}
                  aria-selected={selected}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="date-picker-footer">
            <button
              type="button"
              className="date-picker-footer-action"
              onClick={() => {
                const today = new Date();
                if (!isDisabledDate(today)) {
                  onChange(toISODate(today));
                  setViewMonth(startOfMonth(today));
                  setOpen(false);
                }
              }}
            >
              Today
            </button>
            <button
              type="button"
              className="date-picker-footer-action secondary"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {helpText && <div className="date-picker-help">{helpText}</div>}
    </div>
  );
};

export default DatePicker;
